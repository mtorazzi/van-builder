// All linear units are MILLIMETERS (mm). Angles in degrees (yaw only, snapped to 90s).
// Coordinate frame: x = across width (0 = interior left wall), y = up from
// interior floor, z = along length (0 = interior front / cab-facing wall).

export type Category =
  | 'structure'
  | 'bed'
  | 'seating'
  | 'kitchen'
  | 'sink'
  | 'vanity'
  | 'shower'
  | 'toilet'
  | 'storage'
  | 'cabinet'
  | 'appliance'
  | 'electrical'
  | 'water'
  | 'plumbing'
  | 'lighting'
  | 'roof'
  | 'other';

export const CATEGORIES: Category[] = [
  'structure',
  'bed',
  'seating',
  'kitchen',
  'sink',
  'vanity',
  'shower',
  'toilet',
  'storage',
  'cabinet',
  'appliance',
  'electrical',
  'water',
  'plumbing',
  'lighting',
  'roof',
  'other',
];

// Red is reserved exclusively for violation/danger signaling (see --danger
// in style.css and PlacedItemMesh's `violating` override, '#e05a4e') — no
// category default below may sit within ~25° of that hue at meaningful
// saturation, or an item can look like it's in conflict when it isn't.
export const CATEGORY_COLORS: Record<Category, string> = {
  structure: '#8d99ae',
  bed: '#6d8f6b',
  seating: '#b08968',
  kitchen: '#f2994a',
  sink: '#4a919e',
  vanity: '#7b6d8d',
  shower: '#3a86ff',
  toilet: '#a4a4a4',
  storage: '#c9a227',
  cabinet: '#b5651d',
  appliance: '#6c5ce7',
  electrical: '#ffd166',
  water: '#118ab2',
  plumbing: '#5390d9',
  lighting: '#f4e04d',
  roof: '#06d6a0',
  other: '#adb5bd',
};

/** Which layout plane a component belongs to. 'roof' components live on the
 * roof's own footprint (solar, Starlink, vents, roof AC); 'underbody'
 * components live on the frame/undercarriage plane below the floor (water
 * tanks, other chassis-mounted gear); 'door' components mount to one of the
 * rear swing-door panels (e.g. a split A/C's interior unit) — they must stay
 * flush against that panel and swing with it when the door opens, unlike
 * roof/underbody which are static planes; 'wall' components mount to the
 * interior side walls (cam brackets, touch panels, small mounts). Each is
 * planned as its own layer, combined on top of / below / hinged-to the van
 * in the same scene, with its own independent collision checking. */
export type MountSurface = 'floor' | 'roof' | 'underbody' | 'door' | 'ceiling' | 'wall';

/** 'ceiling' components live INSIDE the van (same physical space as 'floor'
 * items — they collide with beds, cabinets, the cab zone, etc.) but hang
 * from above instead of standing on the floor: their TOP face is always
 * pressed against the finished ceiling, or against the underside of
 * whatever interior item is directly above them (e.g. a raised HappiJac
 * bed platform). They can be dragged anywhere in X/Z; Y is derived, never
 * free — "hug the ceiling" is enforced on every placement/move the same way
 * "flush against the door" is for 'door' items. Because Y is recomputed
 * whenever anything moves, lowering the bed above a ceiling item lowers
 * the item with it.
 *
 * 'wall' components live INSIDE the van, mounted to a side wall — same
 * collision space as floor/ceiling items but constrained to the wall plane. */
export const INTERIOR_SURFACES: readonly MountSurface[] = ['floor', 'ceiling', 'wall'];

/** Which rear swing-door panel a 'door'-mount instance is attached to. The
 * rear doors are two independent hinged panels (left half / right half of
 * rearDoorWidth) — an item must commit to one, it can't straddle both. */
export type DoorId = 'rear-left' | 'rear-right';

/** Which interior side wall a 'wall'-mount instance is attached to. Items
 * mount flush against the wall surface (after insulation/framing), extending
 * inward into the interior space. Default is 'left'. */
export type WallSide = 'left' | 'right';

export interface Dims {
  w: number; // across x (width) at rotation 0
  d: number; // along z (depth/length) at rotation 0
  h: number; // up y (height)
}

/** Purchase/inventory tracking status for a component definition. Tracks
 * the lifecycle from initial idea through ownership:
 * - 'proposed': wishlist/planning item, not yet committed
 * - 'ordered': purchase placed, awaiting delivery
 * - 'owned': in hand, ready to install
 * - 'placed': installed in the van
 * - 'superseded': replaced by another part, kept for reference */
export type InventoryStatus = 'owned' | 'ordered' | 'proposed' | 'placed' | 'superseded';

/** What kind of plumbing/electrical connection a port marker represents —
 * drives its marker color and default label in the 3D view. */
export type PortKind = 'fill' | 'vent' | 'outlet' | 'inlet' | 'drain' | 'electrical' | 'other';

// Distinct from CATEGORY_COLORS and kept clear of the violation-red hue (see
// note above) so a port marker never reads as either a category swatch or a
// conflict indicator.
export const PORT_COLORS: Record<PortKind, string> = {
  fill: '#ffd166',
  vent: '#95d5b2',
  outlet: '#00b4d8',
  drain: '#00b4d8',
  inlet: '#7b6d8d',
  electrical: '#f4e04d',
  other: '#adb5bd',
};

/** A labeled plumbing/electrical connection point on a component — visual
 * reference only (rendered as a small marker in the 3D view + listed in the
 * Inspector), never collision-checked. Position is in the component's own
 * local frame at rotation 0, same convention as `dims`: x/z are centered
 * on the footprint (-w/2..w/2, -d/2..d/2), y is height from the component's
 * base (0..h). */
export interface ComponentPort {
  kind: PortKind;
  /** Optional override label, e.g. "1-1/2\" BSPT fill/vent". Falls back to
   * the kind name if omitted. */
  label?: string;
  x: number;
  y: number;
  z: number;
}

export interface ComponentDef {
  id: string;
  name: string;
  category: Category;
  dims: Dims;
  color?: string;
  notes?: string;
  /** Instances of defs sharing an overlapGroup are treated as designed
   * alternates (e.g. two sink options on the same vanity footprint) and are
   * allowed to overlap each other regardless of the category matrix. */
  overlapGroup?: string;
  standard?: boolean; // true for built-in starter defs
  /** 'floor' (default, inside the van) or 'roof' (its own layout plane on
   * top of the van — solar, Starlink, vents, roof AC, etc). */
  mountSurface?: MountSurface;
  /** Estimated unit cost in USD. Undefined/omitted means not priced yet —
   * distinct from a real $0. Populated via the build checklist import or
   * manual add_def/update_def calls. */
  estCost?: number;
  /** Build-planning status, independent of whether dims/cost are filled in:
   * 'placeholder' = name/dims/cost may still be guesses (a stand-in so the
   * layout/checklist has something to place and measure against);
   * 'final' = locked in, ready for the build blueprint. Defaults to
   * 'final' for the hand-authored starter catalog; defs created through
   * the checklist importer default to 'placeholder' unless marked final. */
  status?: 'final' | 'placeholder';
  /** True when this component's actual shape is hollowed/notched to fit
   * around the rear wheel well by design (e.g. a wheel-well water tank) —
   * its bounding box is allowed to overlap the wheel-well exclusion zone
   * (computeWheelWellZones) without being flagged as a conflict or treated
   * as an obstacle for snap-to-safe. The box model can't represent the real
   * cutout shape, so this is the escape hatch: it doesn't shrink the
   * footprint, it just stops that one specific overlap from reading as an
   * error. Everything else (other instances, cab zone, envelope walls)
   * still collides normally. */
  wheelWellCutout?: boolean;
  /** Labeled plumbing/electrical connection points (fill, vent, drain,
   * etc), for visual reference only. */
  ports?: ComponentPort[];
  /** Product / spec-sheet link for this part (Amazon listing, manufacturer
   * page, install manual, etc). Shown as a clickable link in the catalog
   * sheet view. Free-form links buried in `notes` are also harvested there
   * as a fallback, but this is the canonical one. */
  url?: string;

  // --- Inventory / purchase tracking ---
  /** Purchase/inventory lifecycle status. When reading legacy JSON missing
   * this field: treat as 'proposed' if status is 'placeholder', else 'owned'
   * if placedCount > 0, else 'proposed'. New Capture/FAIT items default to
   * 'proposed'. */
  inventoryStatus?: InventoryStatus;
  /** Actual order/receipt URL if different from the spec/buy link in `url`. */
  orderUrl?: string;
  /** ISO date string (YYYY-MM-DD) when the order was placed. */
  orderDate?: string;
  /** Vendor/supplier name for this part. */
  vendor?: string;

  // --- Tags ---
  /** Free-form string tags for filtering/organization. Suggested vocabulary:
   * fait, capture, structural, electrical, plumbing, kitchen, furniture,
   * exterior, consumable. Any string is accepted — not a hard enum. */
  tags?: string[];
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface PlacedInstance {
  id: string;
  defId: string;
  label?: string; // optional override display name, e.g. "Driver-side galley"
  /** x,z = footprint CENTER (stable under yaw rotation); y = BASE (bottom)
   * height above the van floor (y=0 at raw shell floor). */
  pos: Vec3;
  rotationY: 0 | 90 | 180 | 270;
  /** Explicit extra instance ids this one is allowed to overlap with, beyond
   * category-matrix / overlapGroup rules. */
  overlapWhitelist?: string[];
  locked?: boolean;
  /** Which rear door panel this rides on. Only meaningful when the def's
   * mountSurface is 'door' — ignored otherwise. Defaults to 'rear-left' when
   * a door-mount instance omits it. */
  doorId?: DoorId;
  /** Which interior side wall this is mounted on. Only meaningful when the
   * def's mountSurface is 'wall' — ignored otherwise. Defaults to 'left'. */
  wallSide?: WallSide;
}

export interface VanShell {
  name: string;
  interiorLength: number; // z extent, cab wall to rear doors
  interiorWidth: number; // x extent, wall to wall at widest usable point
  interiorHeight: number; // y extent, floor to ceiling
  wallFramingThickness: number; // scaffold/furring strips on side + front + rear walls
  insulationThickness: number; // insulation layer, also on walls (in addition to framing)
  ceilingFramingThickness: number; // framing + insulation allowance overhead
  floorBuildUpThickness: number; // subfloor/insulation/vapor barrier on floor

  // --- Fixed van features (reference/visual + the cab is a hard build exclusion) ---
  // These are NOT subtracted from interiorLength/Width/Height above — the cab zone
  // is a separate, always-out-of-bounds region layered on top of the envelope, so
  // it never distorts the raw buildable-envelope numbers.
  /** Depth (z, from the very front wall) of the driver/passenger cab area.
   * Nothing may be built inside this zone. */
  cabDepth: number;
  /** Approximate front seat footprint, shown swiveled to face the rear (a common
   * camper-conversion setup) so you can plan around them. Visual only. */
  cabSeatWidth: number;
  cabSeatDepth: number;
  cabSeatHeight: number;

  // Rear swing doors — reference visualization only, doesn't constrain the envelope.
  rearDoorWidth: number;
  rearDoorHeight: number;

  // Side sliding door — reference visualization only. Dimensions/position are
  // configurable since they vary van to van.
  sideDoorWidth: number;
  sideDoorHeight: number;
  /** Distance from the front wall (z=0) to the door opening's forward edge. */
  sideDoorOffsetZ: number;
  sideDoorSide: 'left' | 'right';

  /** Height budget above the roof surface available for roof-mounted gear
   * (solar panels, Starlink, vents, roof AC). The roof layout plane sits at
   * y = interiorHeight, combined on top of the van in the same 3D scene. */
  roofClearance: number;

  /** Height budget below the floor available for undercarriage-mounted gear
   * (water tanks, etc). The zone also automatically stays clear of the front
   * ~cabDepth of the van, approximating the engine/transmission area. */
  underbodyClearance: number;

  // --- Rear wheel wells (both sides) — a floor-plane build exclusion, same
  // treatment as the cab zone: NOT subtracted from interiorWidth above, just
  // an always-out-of-bounds region layered on top. Modeled as a flat-topped
  // rectangular box (how it's actually built out in plywood, not the true
  // curved arch) intruding inward from each side wall. Set wheelWellWidth or
  // wheelWellHeight to 0 to disable (e.g. for a non-ProMaster shell where this
  // doesn't apply). Defaults approximate a Ram ProMaster 159" EXT High Roof
  // from community-measured van-conversion sources, not a manufacturer spec —
  // true these up with your own tape measure before cutting anything. Front
  // wheel wells aren't modeled — they fall inside the cab zone, which is
  // already off-limits, so there's nothing extra to build around there.
  /** How far each wheel well box intrudes inward from its side wall. */
  wheelWellWidth: number;
  /** How tall each wheel well box is off the floor. */
  wheelWellHeight: number;
  /** Front-to-back extent of each wheel well box. */
  wheelWellLength: number;
  /** Distance from the front wall (z=0) to the rear wheel wells' center. */
  rearWheelWellCenterZ: number;
}

export type CameraView =
  | 'iso'
  | 'front'
  | 'back'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'roof'
  | 'underbody';

/** category -> category -> allowed to overlap */
export type OverlapMatrix = Record<string, Record<string, boolean>>;

export interface ProjectState {
  /* Schema version: 1 = legacy (inches), 2 = millimeters. Missing/unversioned
   * data is treated as legacy inches and auto-migrated on load. */
  version: number;
  shell: VanShell;
  defs: ComponentDef[];
  instances: PlacedInstance[];
  overlapMatrix: OverlapMatrix;
}
