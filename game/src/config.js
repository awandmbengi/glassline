// GLASSLINE — tuning, city layout, districts, factions and the 7 story missions.
// Veyra is an inland tiered city around a giant dam: heavy rain, steel-blue + amber.
// Nara Venn is a getaway courier and ex-network technician: a skilled driver, not a
// fighter — every mission below is driving or stealth, never guard-filled combat.
export const STEP = 1 / 60;
export const SAVE_KEY = 'glassline-save-v1';

export const CITY = {
  bound: 180,
  roads: [-150, -90, -30, 30, 90, 150],
  roadHalf: 6,
  // Kestrel Heights overpass: deck along z = 0, |x| < 120 at y = 8, ramps to |x| = 150.
  overpass: { halfWidth: 7, deck: 8, deckEnd: 120, rampEnd: 150 },
  // Sluice flood channel: sunken roadway, floor y = -2, x in [-150, -90], z in [108, 132].
  channel: { x0: -150, x1: -90, z0: 108, z1: 132, floor: -2, ramp: 10 },
  // The dam wall at the north edge; the reservoir is the water beyond it.
  damZ: -195,
};

export const DISTRICTS = [
  { name: 'Glassworks', x0: -60, x1: 60, z0: -150, z1: -30, style: 'tower' },
  { name: 'Reservoir Row', x0: -150, x1: -30, z0: -150, z1: -30, style: 'stilt' },
  { name: 'Kestrel Heights', x0: -150, x1: 150, z0: -15, z1: 15, style: 'overpass' },
  { name: 'Sluice District', x0: -150, x1: -30, z0: 30, z1: 150, style: 'warehouse' },
  { name: 'Foundry Yard', x0: 30, x1: 150, z0: 30, z1: 150, style: 'industrial' },
];

export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) return d.name;
  }
  return 'Veyra';
}

// The people and powers of Veyra. All invented for this game.
export const FACTIONS = {
  combine: 'Aurek Combine',
  combineBoss: 'Director Ilya Sark',
  syndicate: 'The Undertow',
  syndicateBoss: 'Vess "Tide" Marrow',
  contact: 'Doss Kade',
  witness: 'Mara Quill',
};

export const RADIO = [
  { name: '98.6 Static Bloom', bpm: 112, root: 55, scale: [0, 3, 5, 7, 10] },
  { name: 'KVRN 104.1 Rain Line', bpm: 84, root: 49, scale: [0, 2, 3, 7, 8] },
];

// Mission steps: goto (reach a marker), steal (enter a marked vehicle), interact
// (hold E at a marker), pickup (a passenger walks to your stopped car), escape
// (reach a marker while wanted), timed (reach a marker before the clock), choice
// (drive to one of three markers; the one you reach decides the ending).
export const MISSIONS = [
  {
    id: 'first-drop',
    name: '1 · First Drop',
    briefing: 'Doss needs a relay device on the Glassworks comms tower. The Aurek service van parked by Reservoir Row has one in the back. Take it — quietly.',
    reward: 400,
    steps: [
      { kind: 'steal', text: 'Steal the Aurek service van', vehicle: 'van' },
      { kind: 'goto', text: 'Deliver the device to the comms tower', place: 'commsTower' },
    ],
  },
  {
    id: 'lights-on',
    name: '2 · Lights Out, Lights On',
    briefing: 'Sark cut power to the whole Sluice District to flush you out. The Foundry Yard substation can relight it — if you can reach the panel on foot.',
    reward: 500,
    steps: [
      { kind: 'goto', text: 'Reach the Foundry Yard substation', place: 'powerDepot' },
      { kind: 'interact', text: 'Hold E — relight the Sluice District', place: 'powerDepot', hold: 2 },
      { kind: 'escape', text: 'Get clear — reach the Sluice marker', place: 'sluiceMarker', wanted: 1 },
    ],
  },
  {
    id: 'the-witness',
    name: '3 · The Witness',
    briefing: 'Mara Quill saw what Sark did to the grid. She is waiting on Reservoir Row. Drive her across the Kestrel overpass to the Glassworks safehouse — the roadblocks will not make it easy.',
    reward: 700,
    steps: [
      { kind: 'pickup', text: 'Pick up Mara Quill on Reservoir Row', place: 'maraPickup' },
      { kind: 'goto', text: 'Cross the overpass to the safehouse', place: 'safehouse', passenger: true },
    ],
  },
  {
    id: 'borrowed-authority',
    name: '4 · Borrowed Authority',
    briefing: 'A patrol car sits running at the Glassworks checkpoint — its driver went for coffee. In a patrol car, nobody looks twice. Take it through the traffic-control gate.',
    reward: 600,
    steps: [
      { kind: 'steal', text: 'Steal the patrol car at the checkpoint', vehicle: 'patrol' },
      { kind: 'goto', text: 'Drive through the traffic-control gate', place: 'trafficGate', disguised: true },
    ],
  },
  {
    id: 'dead-air',
    name: '5 · Dead Air',
    briefing: 'The footage that buries Sark is on a relay drive at the Glassworks rooftop access. Grab it on foot — and be ready: the moment you touch it, a police helicopter is coming.',
    reward: 800,
    steps: [
      { kind: 'goto', text: 'Reach the rooftop access in Glassworks', place: 'rooftop' },
      { kind: 'interact', text: 'Hold E — pull the footage drive', place: 'rooftop', hold: 2, wanted: 3 },
      { kind: 'escape', text: 'Lose the helicopter — get 150 m clear', place: 'anywhere', wanted: 3 },
    ],
  },
  {
    id: 'flood-channel',
    name: '6 · The Flood Channel',
    briefing: 'The Undertow opened the sluice gates early. The only way out of the Sluice District is the flood channel itself — drive it end to end before the water takes the road.',
    reward: 900,
    steps: [
      { kind: 'goto', text: 'Enter the flood channel', place: 'channelEntry' },
      { kind: 'timed', text: 'Reach the tunnel exit before the water rises', place: 'channelExit', seconds: 90 },
    ],
  },
  {
    id: 'the-choice',
    name: '7 · The Choice',
    briefing: 'You hold the evidence now. The press will run it. The Undertow will pay for it. The dam will hide it. One drive, one ending — choose where the truth goes.',
    reward: 1500,
    steps: [
      {
        kind: 'choice',
        text: 'Choose: press HQ (Glassworks), the Undertow den (Sluice), or the dam gate',
        places: ['pressHQ', 'undertowDen', 'damGate'],
        endings: [
          'THE LEAK — the footage runs on every screen in Veyra. Sark is finished by morning. Nara keeps driving.',
          'THE SALE — the Undertow pays in full and the evidence vanishes. Nara is rich, and the city stays thirsty.',
          'THE BURN — the drive goes into the reservoir at the dam gate. No one wins. No one loses. Nara keeps driving.',
        ],
      },
    ],
  },
];

// Named places on the map (x, z). Every mission marker points at one of these.
export const PLACES = {
  vanSpawn: { x: -90, z: -150, label: 'Aurek service van' },
  commsTower: { x: 30, z: -150, label: 'Comms tower' },
  powerDepot: { x: 120, z: 120, label: 'Foundry substation' },
  sluiceMarker: { x: -90, z: 90, label: 'Sluice marker' },
  maraPickup: { x: -150, z: -60, label: 'Mara Quill' },
  safehouse: { x: -60, z: -90, label: 'Safehouse' },
  patrolSpawn: { x: 60, z: -30, label: 'Patrol car' },
  trafficGate: { x: 30, z: -30, label: 'Traffic-control gate' },
  rooftop: { x: 0, z: -90, label: 'Rooftop access' },
  channelEntry: { x: -150, z: 120, label: 'Flood channel entry' },
  channelExit: { x: -90, z: 120, label: 'Tunnel exit' },
  pressHQ: { x: 90, z: -60, label: 'Veyra Herald press HQ' },
  undertowDen: { x: -120, z: 60, label: 'Undertow den' },
  damGate: { x: -60, z: -180, label: 'Dam service gate' },
  start: { x: -30, z: 150, label: 'Start' },
};

export const TUNING = {
  walkSpeed: 9,
  carAccel: 26,
  carBrake: 40,
  carReverse: 12,
  carMaxSpeed: 42,
  carTurn: 1.9,
  carGrip: 3.2,
  wantedDecaySeconds: 15,
  bustSeconds: 3,
  heliAtWanted: 3,
  maxPoliceCars: 4,
  trafficCars: 14,
  pedestrians: 22,
  moneyStart: 0,
};
