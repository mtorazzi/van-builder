import { v4 as uuid } from 'uuid';
import type { ComponentDef, OverlapMatrix, VanShell } from './types';

// All linear values below are MILLIMETERS. They were converted from the
// original inch figures ×25.4 and rounded to the nearest whole millimeter
// (Math.round(inches * 25.4)) — the app's rounding policy for every legacy
// inch value. The 3D scene renders 1 unit = 1 mm, so whole-mm values keep
// silhouette identical up to a scaling factor.

export const DEFAULT_SHELL: VanShell = {
  name: 'Ram ProMaster 159" EXT High Roof',
  interiorLength: 4069,
  interiorWidth: 1920, // max width at wall; narrows to ~1417 mm between wheel arches — see wheelWell* below
  interiorHeight: 1930,
  wallFramingThickness: 19, // furring strip / scaffold depth
  insulationThickness: 38, // e.g. Havelock wool or XPS layer
  ceilingFramingThickness: 64,
  floorBuildUpThickness: 38,

  // Cab / front seats: approximate depth from the front wall taken up by the
  // driver + passenger seats and dash, swiveled to face the rear.
  cabDepth: 1016,
  cabSeatWidth: 508,
  cabSeatDepth: 559,
  cabSeatHeight: 1016,

  // Rear swing doors span the full rear opening by default.
  rearDoorWidth: 1920,
  rearDoorHeight: 1930,

  // Ram ProMaster standard passenger-side sliding door (approx.).
  sideDoorWidth: 1245,
  sideDoorHeight: 1575,
  sideDoorOffsetZ: 1016,
  sideDoorSide: 'right',

  // Height budget for roof-mounted gear (solar, Starlink, vents, roof AC).
  roofClearance: 356,

  // Height budget below the floor for undercarriage-mounted gear (tanks, etc).
  underbodyClearance: 254,

  // Rear wheel wells — approximated from community-measured Ram ProMaster
  // 159" conversion sources (Ram doesn't publish interior wheel-well
  // dimensions): ~1417 mm clear width between the arches at floor level (=>
  // ~252 mm/side intrusion off a 1920 mm interior width, rounded to 254),
  // ~432 mm arch height, ~864 mm front-to-back length on the extended
  // wheelbase. Longitudinal position is the least certain of the bunch (no
  // single agreed-upon reference point in the sources) — placed with a
  // modest gap ahead of the rear doors as a starting point. Adjust all four
  // to your own tape-measure numbers before cutting anything. Front wheel
  // wells aren't modeled — they fall inside the cab zone, which is already
  // off-limits.
  wheelWellWidth: 254,
  wheelWellHeight: 432,
  wheelWellLength: 864,
  rearWheelWellCenterZ: 3205,
};

// A starter, standardized component catalog. Dimensions are W (across) x D
// (front-back) x H (up), in millimeters, at rotation 0. Users extend/edit
// this list from the Catalog panel.
function def(partial: Omit<ComponentDef, 'id' | 'standard'>): ComponentDef {
  return { id: uuid(), standard: true, ...partial };
}

export const DEFAULT_DEFS: ComponentDef[] = [
  def({ name: 'Platform Bed (Queen Short)', category: 'bed', dims: { w: 1372, d: 1829, h: 229 } }),
  def({ name: 'Fixed Bench/Dinette Bed', category: 'bed', dims: { w: 1219, d: 610, h: 457 } }),
  def({ name: 'Swivel Cab Seat', category: 'seating', dims: { w: 559, d: 559, h: 508 } }),
  def({ name: 'Galley Kitchen Block', category: 'kitchen', dims: { w: 914, d: 610, h: 914 } }),
  def({
    name: 'Round Bar Sink (15")',
    category: 'sink',
    dims: { w: 381, d: 381, h: 152 },
    overlapGroup: 'sink-option',
  }),
  def({
    name: 'Rect. Kitchen Sink (20x16)',
    category: 'sink',
    dims: { w: 508, d: 406, h: 152 },
    overlapGroup: 'sink-option',
  }),
  def({ name: 'Bathroom Vanity Cabinet', category: 'vanity', dims: { w: 610, d: 457, h: 864 } }),
  def({ name: 'Wet Bath Shower Pan (32x32)', category: 'shower', dims: { w: 813, d: 813, h: 102 } }),
  def({ name: 'Cassette Toilet', category: 'toilet', dims: { w: 406, d: 406, h: 406 } }),
  def({ name: 'Upper Cabinet', category: 'cabinet', dims: { w: 762, d: 305, h: 356 } }),
  def({ name: 'Base Cabinet', category: 'cabinet', dims: { w: 610, d: 508, h: 762 } }),
  def({ name: '12V Compressor Fridge', category: 'appliance', dims: { w: 457, d: 457, h: 508 } }),
  def({ name: 'Diesel Heater Unit', category: 'appliance', dims: { w: 254, d: 254, h: 203 } }),
  def({ name: 'Fresh Water Tank (20gal)', category: 'water', dims: { w: 610, d: 406, h: 254 } }),
  def({ name: 'Grey Water Tank (20gal)', category: 'water', dims: { w: 610, d: 406, h: 254 } }),
  def({ name: 'Battery/Electrical Box', category: 'electrical', dims: { w: 508, d: 356, h: 254 } }),
  def({ name: 'Shore Power Inlet Panel', category: 'electrical', dims: { w: 203, d: 76, h: 203 } }),
  def({ name: 'Overhead Storage Cubby', category: 'storage', dims: { w: 914, d: 356, h: 305 } }),
  def({ name: 'Under-Bed Garage Bin', category: 'storage', dims: { w: 762, d: 508, h: 305 } }),

  // --- Power system: battery bank, inverter, and supporting electrical ---
  def({ name: 'Lithium Battery (100Ah)', category: 'electrical', dims: { w: 330, d: 178, h: 229 } }),
  def({ name: 'Inverter/Charger (2000W)', category: 'electrical', dims: { w: 406, d: 203, h: 127 } }),
  def({ name: 'DC-DC Charger', category: 'electrical', dims: { w: 152, d: 102, h: 51 } }),
  def({ name: 'Solar Charge Controller', category: 'electrical', dims: { w: 152, d: 102, h: 51 } }),
  def({ name: '12V Fuse/Breaker Panel', category: 'electrical', dims: { w: 254, d: 152, h: 76 } }),
  def({ name: 'Battery Monitor / Shunt', category: 'electrical', dims: { w: 102, d: 76, h: 51 } }),

  // --- Plumbing fixtures ---
  def({ name: 'Water Pump (Demand Pump)', category: 'plumbing', dims: { w: 152, d: 127, h: 127 } }),
  def({ name: 'Tankless Water Heater', category: 'plumbing', dims: { w: 432, d: 254, h: 254 } }),
  def({ name: 'Kitchen Faucet', category: 'plumbing', dims: { w: 51, d: 203, h: 305 } }),
  def({ name: 'Bathroom Faucet', category: 'plumbing', dims: { w: 51, d: 152, h: 254 } }),
  def({ name: 'Shower Mixer/Head', category: 'plumbing', dims: { w: 102, d: 102, h: 203 } }),
  def({ name: 'Inline Water Filter', category: 'plumbing', dims: { w: 76, d: 76, h: 254 } }),
  def({ name: 'City Water Inlet', category: 'plumbing', dims: { w: 102, d: 51, h: 102 } }),

  // --- Lighting fixtures ---
  def({ name: 'LED Puck Light', category: 'lighting', dims: { w: 76, d: 76, h: 25 } }),
  def({ name: 'LED Strip Light (36")', category: 'lighting', dims: { w: 914, d: 25, h: 13 } }),
  def({ name: 'Reading Light', category: 'lighting', dims: { w: 102, d: 51, h: 102 } }),
  def({ name: 'Awning/Porch Light', category: 'lighting', dims: { w: 127, d: 76, h: 127 } }),

  // --- Roof layer: its own layout plane, combined on top of the van ---
  def({
    name: 'Solar Panel (100W)',
    category: 'roof',
    mountSurface: 'roof',
    dims: { w: 1062, d: 531, h: 36 },
  }),
  def({
    name: 'Starlink (Flat High Performance)',
    category: 'roof',
    mountSurface: 'roof',
    dims: { w: 607, d: 335, h: 74 },
  }),
  def({ name: 'Roof Vent/Fan (14x14)', category: 'roof', mountSurface: 'roof', dims: { w: 356, d: 356, h: 254 } }),
  def({ name: 'Roof A/C Unit', category: 'roof', mountSurface: 'roof', dims: { w: 686, d: 686, h: 356 } }),
  def({
    name: 'Roof Rack Cargo Box',
    category: 'roof',
    mountSurface: 'roof',
    dims: { w: 762, d: 1219, h: 381 },
  }),

  // --- Underbody layer: its own layout plane below the floor ---
  def({
    name: 'Fresh Water Tank — Underbody (30gal)',
    category: 'water',
    mountSurface: 'underbody',
    dims: { w: 1016, d: 508, h: 203 },
  }),
  def({
    name: 'Grey Water Tank — Underbody (30gal)',
    category: 'water',
    mountSurface: 'underbody',
    dims: { w: 1016, d: 508, h: 203 },
  }),
  def({
    name: 'Underbody Accessory Box',
    category: 'storage',
    mountSurface: 'underbody',
    dims: { w: 610, d: 406, h: 203 },
    notes: 'Generic slot for anything else chassis-mounted — LP tank, tool box, spare parts, etc.',
  }),
];

function sym(matrix: OverlapMatrix, a: string, b: string) {
  (matrix[a] ??= {})[b] = true;
  (matrix[b] ??= {})[a] = true;
}

export function buildDefaultOverlapMatrix(): OverlapMatrix {
  const matrix: OverlapMatrix = {};
  // A sink is designed to sit within/on its vanity or kitchen counter footprint.
  sym(matrix, 'sink', 'vanity');
  sym(matrix, 'sink', 'kitchen');
  // Electrical/water infrastructure commonly tucks inside or under cabinetry/storage.
  sym(matrix, 'electrical', 'cabinet');
  sym(matrix, 'electrical', 'storage');
  sym(matrix, 'water', 'storage');
  sym(matrix, 'water', 'cabinet');
  // Plumbing fixtures mount ON/IN sinks, counters, vanities, showers, or tuck
  // into the same cabinetry/utility space as the tanks and pump they serve.
  sym(matrix, 'plumbing', 'sink');
  sym(matrix, 'plumbing', 'kitchen');
  sym(matrix, 'plumbing', 'vanity');
  sym(matrix, 'plumbing', 'shower');
  sym(matrix, 'plumbing', 'water');
  sym(matrix, 'plumbing', 'cabinet');
  sym(matrix, 'plumbing', 'storage');
  // Light fixtures mount on/in ceilings, cabinet faces, and walls above
  // whatever furniture is below them.
  sym(matrix, 'lighting', 'cabinet');
  sym(matrix, 'lighting', 'storage');
  sym(matrix, 'lighting', 'kitchen');
  sym(matrix, 'lighting', 'vanity');
  sym(matrix, 'lighting', 'bed');
  sym(matrix, 'lighting', 'seating');
  return matrix;
}
