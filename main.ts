// GLASSLINE — entrypoint for the make.fun gta6-01 bounty.
//
// What it does, in order:
//   1. Pre-flight: checks the 17 required game files exist and parse.
//   2. Copies game/ and screenshots/ from this repository into the
//      output directory (MAKEFUN_OUTPUT_DIR, or /output in the grader).
//   3. Writes /output/dossier.json with buildDossier from
//      vendor/makefun-game.ts, and /output/manifest.json with the
//      SHA-256 of every file it copied.
//   4. Prints a build summary.
//
// Modes:
//   node main.ts            build (default)
//   node main.ts --verify   validate the repo only, write nothing
//   node main.ts --check-out <dir>
//                           re-check an output directory: rebuild the
//                           dossier from it and compare with its
//                           dossier.json, and verify manifest hashes.
//
// The game itself is static files under game/; this program never
// serves it, only hands it in.
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildDossier } from './vendor/makefun-game.ts';

const REQUIRED_FILES = [
  'game/index.html',
  'game/src/audio.js',
  'game/src/city.js',
  'game/src/config.js',
  'game/src/hud.js',
  'game/src/input.js',
  'game/src/main.js',
  'game/src/missions.js',
  'game/src/people.js',
  'game/src/police.js',
  'game/src/radio.js',
  'game/src/random.js',
  'game/src/render.js',
  'game/src/save.js',
  'game/src/shots.js',
  'game/src/vehicles.js',
  'game/src/world.js',
];

const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

const ROOT = resolve(dirname(new URL(import.meta.url).pathname));
const OUT = process.env.MAKEFUN_OUTPUT_DIR || '/output';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function fail(msg) {
  console.error(`glassline: ${msg}`);
  process.exit(1);
}

// Walk a directory tree, returning relative paths of regular files.
// Refuses symlinks: the scorer's game_files row forbids them.
function walk(dir, base) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const st = lstatSync(full);
    if (st.isSymbolicLink()) fail(`symlink not allowed: ${relative(base, full)}`);
    if (st.isDirectory()) out.push(...walk(full, base));
    else if (st.isFile()) out.push(relative(base, full));
    else fail(`not a regular file or directory: ${relative(base, full)}`);
  }
  return out;
}

function preflight() {
  const problems = [];
  for (const rel of REQUIRED_FILES) {
    const full = join(ROOT, rel);
    if (!existsSync(full)) { problems.push(`${rel}: missing`); continue; }
    if (!statSync(full).isFile()) { problems.push(`${rel}: not a file`); continue; }
    const bytes = readFileSync(full);
    if (bytes.length === 0) { problems.push(`${rel}: empty`); continue; }
    if (rel.endsWith('.js')) {
      // Parse with Node itself, as a module: the browser loads these
      // as ES modules, so a CommonJS parse would reject every import.
      const tmp = mkdtempSync(join(tmpdir(), 'glassline-check-'));
      try {
        const tmpFile = join(tmp, 'check.mjs');
        writeFileSync(tmpFile, bytes);
        execFileSync(process.execPath, ['--check', tmpFile], { stdio: 'pipe' });
      } catch (e) {
        const detail = String(e.stderr || e.stdout || e.message).trim().split('\n').slice(0, 3).join(' ');
        problems.push(`${rel}: does not parse: ${detail}`);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    }
    if (rel.endsWith('.html') && !String(bytes).includes('</html>')) {
      problems.push(`${rel}: no closing </html>`);
    }
  }
  const shotsDir = join(ROOT, 'screenshots');
  if (!existsSync(shotsDir)) problems.push('screenshots/: missing');
  else {
    const shots = readdirSync(shotsDir).filter((n) => /\.(png|jpe?g)$/i.test(n)).sort();
    if (shots.length < 3 || shots.length > 4) problems.push(`screenshots/: ${shots.length} images, need 3 or 4`);
    for (const s of shots) {
      const size = statSync(join(shotsDir, s)).size;
      if (size > 262144) problems.push(`screenshots/${s}: ${size} bytes, over 256 KiB`);
    }
  }
  const gameFiles = walk(join(ROOT, 'game'), join(ROOT, 'game'));
  if (gameFiles.length > 993) problems.push(`game/: ${gameFiles.length} entries, over 993`);
  const totalBytes = gameFiles.reduce((n, f) => n + statSync(join(ROOT, 'game', f)).size, 0);
  if (totalBytes > 50331648) problems.push(`game/: ${totalBytes} bytes, over 48 MiB`);
  return { problems, gameFiles, totalBytes };
}

function copyTree(srcDir, dstDir) {
  const copied = [];
  for (const rel of walk(srcDir, srcDir)) {
    const src = join(srcDir, rel);
    const dst = join(dstDir, rel);
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(src, dst);
    copied.push({ path: rel.split(sep).join('/'), sha256: sha256(readFileSync(dst)), bytes: statSync(dst).size });
  }
  return copied;
}

function build(outDir) {
  const { problems, gameFiles, totalBytes } = preflight();
  if (problems.length) fail(`pre-flight failed:\n  - ${problems.join('\n  - ')}`);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const gameManifest = copyTree(join(ROOT, 'game'), join(outDir, 'game'));
  const shotManifest = existsSync(join(ROOT, 'screenshots'))
    ? copyTree(join(ROOT, 'screenshots'), join(outDir, 'screenshots'))
    : [];
  const dossier = buildDossier(outDir, DOSSIER_CAPS);
  writeFileSync(join(outDir, 'dossier.json'), dossier);
  const manifest = {
    game: 'GLASSLINE',
    bounty: 'gta6-01',
    files: [
      ...gameManifest.map((f) => ({ ...f, dir: 'game' })),
      ...shotManifest.map((f) => ({ ...f, dir: 'screenshots' })),
    ],
    dossier_sha256: sha256(dossier),
  };
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const gameTextBytes = gameManifest
    .filter((f) => /\.(js|html|json|css)$/.test(f.path))
    .reduce((n, f) => n + f.bytes, 0);
  console.log('GLASSLINE build OK');
  console.log(`  output:      ${outDir}`);
  console.log(`  game files:  ${gameFiles.length} (${(totalBytes / 1024).toFixed(1)} KiB, ${gameTextBytes} bytes text)`);
  console.log(`  screenshots: ${shotManifest.length} (${shotManifest.map((s) => basename(s.path)).join(', ')})`);
  console.log(`  dossier:     ${dossier.length} bytes (sha256 ${manifest.dossier_sha256.slice(0, 16)}…)`);
  console.log(`  manifest:    ${manifest.files.length} files hashed`);
}

function verify() {
  const { problems, gameFiles, totalBytes } = preflight();
  if (problems.length) fail(`verify failed:\n  - ${problems.join('\n  - ')}`);
  console.log(`GLASSLINE verify OK: ${gameFiles.length} game files, ${(totalBytes / 1024).toFixed(1)} KiB, all required files present and parsing`);
}

function checkOut(dir) {
  if (!existsSync(join(dir, 'dossier.json'))) fail(`${dir}: no dossier.json`);
  if (!existsSync(join(dir, 'manifest.json'))) fail(`${dir}: no manifest.json`);
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  for (const f of manifest.files) {
    const full = join(dir, f.dir, f.path);
    if (!existsSync(full)) fail(`${f.dir}/${f.path}: missing from output`);
    const actual = sha256(readFileSync(full));
    if (actual !== f.sha256) fail(`${f.dir}/${f.path}: hash mismatch`);
  }
  const rebuilt = buildDossier(dir, DOSSIER_CAPS);
  const stored = readFileSync(join(dir, 'dossier.json'));
  if (!rebuilt.equals(stored)) fail('dossier.json does not match a fresh buildDossier of this output');
  console.log(`GLASSLINE check-out OK: ${manifest.files.length} files verified, dossier matches (${rebuilt.length} bytes)`);
}

const args = process.argv.slice(2);
if (args.includes('--verify')) verify();
else if (args.includes('--check-out')) {
  const i = args.indexOf('--check-out');
  const dir = args[i + 1];
  if (!dir) fail('--check-out needs a directory');
  checkOut(resolve(dir));
} else if (args.includes('--help') || args.includes('-h')) {
  console.log('usage: node main.ts [--verify | --check-out <dir>]');
  console.log('  (no flags) builds game/ + screenshots/ into $MAKEFUN_OUTPUT_DIR or /output');
} else {
  build(resolve(OUT));
}
