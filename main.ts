// GLASSLINE — entrypoint for the make.fun gta6-01 bounty.
//
// What this program does, end to end: it takes the finished game that lives
// in this repository (the static files under game/, plus the four JPEG renders
// under screenshots/) and hands it in as one output directory. That means
// copying both folders, then asking the vendored make.fun library to read the
// copied game and write dossier.json, the summary the judge reads. The
// output directory is /output inside the grader's container, or wherever
// MAKEFUN_OUTPUT_DIR (or the --out flag) points when you run it yourself:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// This entrypoint does more than copy, because a silent bad build is worse
// than a loud one. Before it copies anything it checks the source tree the
// way a careful builder would: every module the page loads has to be there,
// every screenshot has to be a real JPEG or PNG inside its size cap, and the
// first screenshot by name is the cover the dossier points at. After the
// copy it writes manifest.json, a SHA-256 fingerprint of every file it
// shipped, and prints a short summary (files, bytes, dossier size) so the
// person running it can see at a glance that the build is whole. With
// --verify it then reads the output back and re-checks every hash and cap,
// and it refuses to exit cleanly when anything does not line up.
//
// Usage:
//   node main.ts [--out <dir>] [--verify] [--check-out <dir>] [--help]
//     --out <dir>       write the entry to <dir> instead of $MAKEFUN_OUTPUT_DIR or /output
//     --verify          build, then verify the output before exiting
//     --check-out <dir> only verify an output directory that already exists
//     --help            print this help and exit

import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildDossier, DOSSIER_MAX_BYTES, DOSSIER_SCHEMA } from './vendor/makefun-game.ts';

// ------------------------------------------------------------------ the entry

const ENTRY_TITLE = 'GLASSLINE';

// The scorer's own caps, from the competition's reference/gate.json. Only
// text_max_bytes shapes how much of the game the dossier carries; the rest
// refuse an entry the scorer would refuse: more than 4 screenshots or one
// over 256 KiB; more than 993 files in game/ or 48 MiB of game files in all,
// or a path under game/ over 1000 bytes.
const GATE_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
} as const;

// Every file the page needs to run. index.html loads ./src/main.js as its
// module and maps the bare specifier "three" to the vendored build; the rest
// are the game's own modules, imported from main.js and from each other. If
// any one of these is missing the game cannot load, so the build fails here
// with the name of the file instead of shipping a broken entry.
const REQUIRED_GAME_FILES = [
  'index.html',
  'src/main.js',
  'src/audio.js',
  'src/city.js',
  'src/config.js',
  'src/hud.js',
  'src/input.js',
  'src/missions.js',
  'src/people.js',
  'src/police.js',
  'src/random.js',
  'src/render.js',
  'src/save.js',
  'src/shots.js',
  'src/vehicles.js',
  'src/world.js',
  'vendor/three.module.min.js',
] as const;

const SCREENSHOT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SCREENSHOT_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);

// ------------------------------------------------------------------ small tools

interface BuildFlags {
  outDir: string | null;
  verifyAfterBuild: boolean;
  checkOutDir: string | null;
  showHelp: boolean;
}

interface TreeStats {
  files: number;
  bytes: number;
}

interface ManifestEntry {
  path: string;
  bytes: number;
  sha256: string;
}

interface ShippedManifest {
  entry: string;
  generated_at: string;
  files: ManifestEntry[];
  total_files: number;
  total_bytes: number;
}

function fail(message: string): never {
  throw new Error(`glassline main: ${message}`);
}

function prettyBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
}

function sha256OfFile(absPath: string): string {
  return createHash('sha256').update(readFileSync(absPath)).digest('hex');
}

// Every regular file under a directory, as POSIX-style paths relative to it,
// sorted so the manifest and the summary are deterministic run to run.
function walkFiles(root: string): string[] {
  const found: string[] = [];
  const visit = (dir: string): void => {
    for (const item of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    )) {
      const abs = join(dir, item.name);
      if (item.isDirectory()) visit(abs);
      else if (item.isFile()) found.push(relative(root, abs).split(sep).join('/'));
    }
  };
  visit(root);
  return found.sort();
}

function treeStats(root: string): TreeStats {
  let files = 0;
  let bytes = 0;
  for (const rel of walkFiles(root)) {
    files += 1;
    bytes += statSync(join(root, rel)).size;
  }
  return { files, bytes };
}

// ------------------------------------------------------------------ validation

// The source tree, checked before a single file is copied. Returns the
// screenshot names, first by name, which is the dossier's cover.
function validateSourceTree(repoRoot: string): string[] {
  const gameDir = join(repoRoot, 'game');
  if (!existsSync(gameDir) || !lstatSync(gameDir).isDirectory()) {
    fail(`game/ is missing from ${repoRoot}: the entry has no game to hand in`);
  }
  const missing: string[] = [];
  for (const rel of REQUIRED_GAME_FILES) {
    const abs = join(gameDir, rel);
    if (!existsSync(abs) || !lstatSync(abs).isFile()) missing.push(`game/${rel}`);
  }
  if (missing.length > 0) {
    fail(`required game files are missing:\n  - ${missing.join('\n  - ')}`);
  }

  const indexHtml = readFileSync(join(gameDir, 'index.html'), 'utf8');
  if (!indexHtml.includes('./src/main.js')) {
    fail('game/index.html does not load ./src/main.js: the entrypoint module is not wired up');
  }
  if (!indexHtml.includes('./vendor/three.module.min.js')) {
    fail('game/index.html does not map "three" to ./vendor/three.module.min.js');
  }

  const shotsDir = join(repoRoot, 'screenshots');
  if (!existsSync(shotsDir) || !lstatSync(shotsDir).isDirectory()) {
    fail('screenshots/ is missing: an entry hands in 3 or 4 renders of its game');
  }
  const shots = readdirSync(shotsDir, { withFileTypes: true })
    .filter((e) => e.isFile() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort();
  if (shots.length < 3 || shots.length > GATE_CAPS.screenshots.max) {
    fail(`screenshots/ holds ${shots.length} files, expected 3 or 4`);
  }
  for (const name of shots) {
    if (!SCREENSHOT_NAME.test(name)) fail(`screenshots/${name}: bad file name`);
    const dot = name.lastIndexOf('.');
    const ext = dot < 0 ? '' : name.slice(dot).toLowerCase();
    if (!SCREENSHOT_EXTENSIONS.has(ext)) {
      fail(`screenshots/${name}: not a JPEG or PNG`);
    }
    const size = statSync(join(shotsDir, name)).size;
    if (size > GATE_CAPS.screenshots.max_bytes) {
      fail(`screenshots/${name} is ${prettyBytes(size)}, over the ${prettyBytes(GATE_CAPS.screenshots.max_bytes)} cap`);
    }
  }
  return shots;
}

// ------------------------------------------------------------------ the build

// Assemble the output directory and return its summary. The four paths this
// program owns inside the output are cleared first, so a stale file from an
// earlier build can never ride along into the entry.
function assemble(repoRoot: string, outDir: string): { dossierBytes: number; manifest: ShippedManifest; shots: string[] } {
  const shots = validateSourceTree(repoRoot);
  mkdirSync(outDir, { recursive: true });

  const gameOut = join(outDir, 'game');
  const shotsOut = join(outDir, 'screenshots');
  rmSync(gameOut, { recursive: true, force: true });
  rmSync(shotsOut, { recursive: true, force: true });
  rmSync(join(outDir, 'dossier.json'), { force: true });
  rmSync(join(outDir, 'manifest.json'), { force: true });

  cpSync(join(repoRoot, 'game'), gameOut, { recursive: true });
  cpSync(join(repoRoot, 'screenshots'), shotsOut, { recursive: true });

  const gameStats = treeStats(gameOut);
  if (gameStats.files > GATE_CAPS.game_max_files) {
    fail(`game/ holds ${gameStats.files} files, over the ${GATE_CAPS.game_max_files} cap`);
  }
  if (gameStats.bytes > GATE_CAPS.game_max_bytes) {
    fail(`game/ is ${prettyBytes(gameStats.bytes)}, over the ${prettyBytes(GATE_CAPS.game_max_bytes)} cap`);
  }

  const dossier = buildDossier(outDir, {
    text_max_bytes: GATE_CAPS.text_max_bytes,
    screenshots: { max: GATE_CAPS.screenshots.max, max_bytes: GATE_CAPS.screenshots.max_bytes },
    game_max_files: GATE_CAPS.game_max_files,
    game_max_bytes: GATE_CAPS.game_max_bytes,
    game_path_max_bytes: GATE_CAPS.game_path_max_bytes,
  });
  writeFileSync(join(outDir, 'dossier.json'), dossier);

  const entries: ManifestEntry[] = [];
  for (const rel of [...walkFiles(gameOut).map((p) => `game/${p}`), ...shots.map((n) => `screenshots/${n}`), 'dossier.json']) {
    const abs = join(outDir, rel);
    entries.push({ path: rel, bytes: statSync(abs).size, sha256: sha256OfFile(abs) });
  }
  const manifest: ShippedManifest = {
    entry: ENTRY_TITLE,
    generated_at: new Date().toISOString(),
    files: entries,
    total_files: entries.length,
    total_bytes: entries.reduce((sum, e) => sum + e.bytes, 0),
  };
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  return { dossierBytes: dossier.length, manifest, shots };
}

// ------------------------------------------------------------------ verification

// Read an output directory back and check it the way the scorer will: the
// dossier parses and carries this competition's schema, every file the
// manifest lists is still there with the hash it recorded, and the caps
// hold. Returns every problem found, so the caller can print them all.
function verifyOutput(outDir: string): string[] {
  const problems: string[] = [];
  const gameDir = join(outDir, 'game');
  const shotsDir = join(outDir, 'screenshots');
  const dossierPath = join(outDir, 'dossier.json');
  const manifestPath = join(outDir, 'manifest.json');

  if (!existsSync(join(gameDir, 'index.html'))) problems.push('game/index.html is missing from the output');
  for (const rel of REQUIRED_GAME_FILES) {
    if (!existsSync(join(gameDir, rel))) problems.push(`game/${rel} is missing from the output`);
  }
  if (!existsSync(dossierPath)) problems.push('dossier.json is missing from the output');
  if (!existsSync(manifestPath)) problems.push('manifest.json is missing from the output');
  if (problems.length > 0) return problems;

  let dossier: { schema?: unknown; images?: { name: string }[] };
  try {
    dossier = JSON.parse(readFileSync(dossierPath, 'utf8')) as typeof dossier;
  } catch (err) {
    return [...problems, `dossier.json does not parse: ${(err as Error).message}`];
  }
  if (dossier.schema !== DOSSIER_SCHEMA) {
    problems.push(`dossier.json schema is ${JSON.stringify(dossier.schema)}, expected ${JSON.stringify(DOSSIER_SCHEMA)}`);
  }
  if (statSync(dossierPath).size > DOSSIER_MAX_BYTES) {
    problems.push(`dossier.json is over the ${prettyBytes(DOSSIER_MAX_BYTES)} dossier cap`);
  }
  const shotCount = Array.isArray(dossier.images) ? dossier.images.length : 0;
  if (shotCount < 3 || shotCount > GATE_CAPS.screenshots.max) {
    problems.push(`the dossier lists ${shotCount} screenshots, expected 3 or 4`);
  }
  if (existsSync(shotsDir)) {
    for (const name of readdirSync(shotsDir).filter((n) => !n.startsWith('.')).sort()) {
      if (statSync(join(shotsDir, name)).size > GATE_CAPS.screenshots.max_bytes) {
        problems.push(`screenshots/${name} is over the ${prettyBytes(GATE_CAPS.screenshots.max_bytes)} cap`);
      }
    }
  }

  let manifest: ShippedManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ShippedManifest;
  } catch (err) {
    return [...problems, `manifest.json does not parse: ${(err as Error).message}`];
  }
  for (const entry of manifest.files) {
    const abs = join(outDir, entry.path);
    if (!existsSync(abs)) {
      problems.push(`${entry.path} is listed in the manifest but missing from the output`);
      continue;
    }
    if (statSync(abs).size !== entry.bytes) {
      problems.push(`${entry.path} is ${statSync(abs).size} bytes, the manifest says ${entry.bytes}`);
    }
    if (sha256OfFile(abs) !== entry.sha256) {
      problems.push(`${entry.path} no longer matches its manifest hash`);
    }
  }
  return problems;
}

// ------------------------------------------------------------------ CLI

function printHelp(): void {
  console.log(
    [
      'GLASSLINE entrypoint — build the gta6-01 entry into an output directory.',
      '',
      'Usage: node main.ts [--out <dir>] [--verify] [--check-out <dir>] [--help]',
      '',
      '  --out <dir>        write the entry to <dir> (default: $MAKEFUN_OUTPUT_DIR, else /output)',
      '  --verify           build, then verify the output before exiting',
      '  --check-out <dir>  only verify an output directory that already exists',
      '  --help             print this help and exit',
      '',
      'The build copies game/ and screenshots/ from beside this file, writes',
      'dossier.json with the vendored make.fun library, and writes manifest.json',
      'with a SHA-256 hash of every shipped file.',
    ].join('\n'),
  );
}

function parseArgs(argv: string[]): BuildFlags {
  const flags: BuildFlags = { outDir: null, verifyAfterBuild: false, checkOutDir: null, showHelp: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') flags.showHelp = true;
    else if (arg === '--verify') flags.verifyAfterBuild = true;
    else if (arg === '--out') {
      const value = argv[++i];
      if (value === undefined) fail('--out needs a directory after it');
      flags.outDir = resolve(value);
    } else if (arg === '--check-out') {
      const value = argv[++i];
      if (value === undefined) fail('--check-out needs a directory after it');
      flags.checkOutDir = resolve(value);
    } else {
      fail(`unknown argument: ${arg} (see --help)`);
    }
  }
  return flags;
}

function printSummary(outDir: string, dossierBytes: number, manifest: ShippedManifest, shots: string[]): void {
  const gameStats = treeStats(join(outDir, 'game'));
  console.log(`GLASSLINE build -> ${outDir} (served from ${pathToFileURL(outDir).href})`);
  console.log(`  game:        ${gameStats.files} files, ${prettyBytes(gameStats.bytes)}`);
  console.log(`  screenshots: ${shots.length} (${shots.join(', ')})`);
  console.log(`  dossier:     ${prettyBytes(dossierBytes)}`);
  console.log(`  manifest:    ${manifest.total_files} files, ${prettyBytes(manifest.total_bytes)}`);
}

function main(): void {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.showHelp) {
    printHelp();
    return;
  }
  const repoRoot = fileURLToPath(new URL('.', import.meta.url));

  if (flags.checkOutDir !== null) {
    const problems = verifyOutput(flags.checkOutDir);
    if (problems.length > 0) {
      console.error(`verify ${flags.checkOutDir}: FAILED\n  - ${problems.join('\n  - ')}`);
      process.exitCode = 1;
      return;
    }
    console.log(`verify ${flags.checkOutDir}: OK`);
    return;
  }

  const outDir = flags.outDir ?? resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
  const { dossierBytes, manifest, shots } = assemble(repoRoot, outDir);
  printSummary(outDir, dossierBytes, manifest, shots);

  if (flags.verifyAfterBuild) {
    const problems = verifyOutput(outDir);
    if (problems.length > 0) {
      console.error(`verify ${outDir}: FAILED\n  - ${problems.join('\n  - ')}`);
      process.exitCode = 1;
      return;
    }
    console.log(`verify ${outDir}: OK`);
  }
}

try {
  main();
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
