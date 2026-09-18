import type { ComponentDef, Dims, DoorId, MountSurface, OverlapMatrix, PlacedInstance, VanShell, Vec3, WallSide } from './types';

/** Rear door panel thickness (mm) — shared with VanFeaturesMesh so the
 * 3D door geometry and the door-mount placement math never drift apart. */
export const REAR_DOOR_THICKNESS = 38;

/** Rear door swing-open angle (degrees) — shared with VanFeaturesMesh. */
export const REAR_DOOR_OPEN_ANGLE_DEG = 100;

export interface Envelope {
  // usable interior box after subtracting insulation/framing/floor/ceiling build-up
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  width: number;
  height: number;
  length: number;
}

/** The buildable envelope once wall framing/insulation and floor/ceiling
 * build-up eat into the raw interior dimensions of the van shell. */
export function computeEnvelope(shell: VanShell): Envelope {
  const wallEat = shell.wallFramingThickness + shell.insulationThickness;
  const minX = wallEat;
  const maxX = shell.interiorWidth - wallEat;
  const minZ = wallEat;
  const maxZ = shell.interiorLength - wallEat;
  const minY = shell.floorBuildUpThickness;
  const maxY = shell.interiorHeight - shell.ceilingFramingThickness;
  return {
    minX,
    maxX,
    minY,
    maxY,
    minZ,
    maxZ,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
    length: Math.max(0, maxZ - minZ),
  };
}

/** The roof layout plane, sitting directly on top of the van's ceiling —
 * combined into the same 3D scene/coordinate space as the interior, but its
 * own independent placement surface (solar, Starlink, vents, roof AC...).
 * Uses the same wall inset as the interior envelope so equipment doesn't
 * overhang the roof edges. */
export function computeRoofEnvelope(shell: VanShell): Envelope {
  const wallEat = shell.wallFramingThickness + shell.insulationThickness;
  const minX = wallEat;
  const maxX = shell.interiorWidth - wallEat;
  const minZ = wallEat;
  const maxZ = shell.interiorLength - wallEat;
  const minY = shell.interiorHeight;
  const maxY = shell.interiorHeight + Math.max(0, shell.roofClearance);
  return {
    minX,
    maxX,
    minY,
    maxY,
    minZ,
    maxZ,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
    length: Math.max(0, maxZ - minZ),
  };
}

/** The undercarriage layout plane, below the floor — water tanks and other
 * chassis-mounted gear. Kept deliberately simple: a shallow box under the
 * floor that also stays clear of the front `cabDepth`, a rough stand-in for
 * the engine/transmission area (exact drivetrain geometry is out of scope
 * for now — this just keeps tank placement sane by default). */
export function computeUnderbodyEnvelope(shell: VanShell): Envelope {
  const wallEat = shell.wallFramingThickness + shell.insulationThickness;
  const minX = wallEat;
  const maxX = shell.interiorWidth - wallEat;
  const minZ = Math.max(wallEat, shell.cabDepth);
  const maxZ = shell.interiorLength - wallEat;
  const maxY = 0;
  const minY = -Math.max(0, shell.underbodyClearance);
  return {
    minX,
    maxX,
    minY,
    maxY,
    minZ,
    maxZ,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
    length: Math.max(0, maxZ - minZ),
  };
}

/** Interior side wall envelope — items mount flush against the wall surface
 * (after framing + insulation), extending inward into the van. The envelope
 * is a thin slice along the wall plane: X is pinned to the wall surface,
 * Y spans floor to ceiling, Z spans the wall length (cab to rear).
 *
 * For the LEFT wall: items are flush against minX (wallEat), extending in +X.
 * For the RIGHT wall: items are flush against maxX (width - wallEat), extending in -X.
 *
 * This is a first-pass implementation using a side-wall AABB. The X position
 * is constrained so the item's BACK touches the wall; the item extends into
 * the interior and collides with floor/ceiling items normally. */
export function computeWallEnvelope(shell: VanShell, wallSide: WallSide, itemDepth: number): Envelope {
  const wallEat = shell.wallFramingThickness + shell.insulationThickness;
  const minZ = Math.max(wallEat, shell.cabDepth);
  const maxZ = shell.interiorLength - wallEat;
  const minY = shell.floorBuildUpThickness;
  const maxY = shell.interiorHeight - shell.ceilingFramingThickness;

  let minX: number, maxX: number;
  if (wallSide === 'left') {
    minX = wallEat;
    maxX = wallEat + itemDepth;
  } else {
    minX = shell.interiorWidth - wallEat - itemDepth;
    maxX = shell.interiorWidth - wallEat;
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    minZ,
    maxZ,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
    length: Math.max(0, maxZ - minZ),
  };
}

/** The world X a wall-mounted item's footprint CENTER must sit at to be
 * flush against the wall surface, given its (rotation-adjusted) width
 * (the dimension extending inward from the wall). */
export function requiredWallTouchX(shell: VanShell, wallSide: WallSide, widthW: number): number {
  const wallEat = shell.wallFramingThickness + shell.insulationThickness;
  if (wallSide === 'left') {
    return wallEat + widthW / 2;
  } else {
    return shell.interiorWidth - wallEat - widthW / 2;
  }
}

/** Corrects a wall-mounted item's position to the nearest position that's
 * (a) within the wall's Y/Z bounds and (b) flush against it. For wall items,
 * X is pinned to the wall surface; Y/Z can slide along the wall plane. */
export function clampToWall(shell: VanShell, wallSide: WallSide, dims: Dims, pos: Vec3): Vec3 {
  const env = computeWallEnvelope(shell, wallSide, dims.w);
  const halfD = dims.d / 2;
  const z = clamp(pos.z, env.minZ + halfD, Math.max(env.minZ + halfD, env.maxZ - halfD));
  const y = clamp(pos.y, env.minY, Math.max(env.minY, env.maxY - dims.h));
  return { x: requiredWallTouchX(shell, wallSide, dims.w), y, z };
}

export function wallLabel(wallSide: WallSide): string {
  return wallSide === 'left' ? 'left wall' : 'right wall';
}

export function envelopeFor(shell: VanShell, mountSurface: MountSurface | undefined): Envelope {
  switch (mountSurface) {
    case 'roof':
      return computeRoofEnvelope(shell);
    case 'underbody':
      return computeUnderbodyEnvelope(shell);
    case 'ceiling':
      // Ceiling items live inside the van — same envelope as floor items;
      // only their Y is special (see ceilingHangY / clampToCeiling).
      return computeEnvelope(shell);
    case 'door':
      // Door envelopes depend on which panel AND the mounted item's own
      // depth (see computeDoorEnvelope) — there's no single shell-only
      // answer, so this generic form falls back to the interior envelope.
      // Every real call site for door-mounted items uses
      // computeDoorEnvelope directly instead.
      return computeEnvelope(shell);
    case 'wall':
      // Wall envelopes depend on which side AND the mounted item's own
      // depth (see computeWallEnvelope) — there's no single shell-only
      // answer, so this generic form falls back to the interior envelope.
      // Every real call site for wall-mounted items uses
      // computeWallEnvelope directly instead.
      return computeEnvelope(shell);
    default:
      return computeEnvelope(shell);
  }
}

export function doorLabel(doorId: DoorId): string {
  return doorId === 'rear-left' ? 'left rear door' : 'right rear door';
}

/** World Z (van floor/wall coordinate frame, door CLOSED) of the door
 * panel's EXTERIOR (outward-facing) face — where a flush-mounted exterior
 * item's back touches it. Door-mounted gear lives outside the van, same as
 * roof/underbody gear — it must never occupy interior space. */
function doorFaceZ(shell: VanShell): number {
  return shell.interiorLength + REAR_DOOR_THICKNESS / 2;
}

/** The world-space X span (door CLOSED) of one rear door panel — half of
 * rearDoorWidth, hinged at the outer corner (x=0 for the left panel,
 * x=interiorWidth for the right). */
function doorPanelXSpan(shell: VanShell, doorId: DoorId): { minX: number; maxX: number } {
  const panelWidth = shell.rearDoorWidth / 2;
  const minX = doorId === 'rear-left' ? 0 : shell.interiorWidth - panelWidth;
  return { minX, maxX: minX + panelWidth };
}

/** The world Z (door CLOSED) an item's footprint CENTER must sit at to be
 * flush against the door's exterior face, extending further OUTWARD (away
 * from the van, increasing Z) given its (rotation-adjusted) depth along Z.
 * This is the one and only valid Z for a door-mounted item — "touching the
 * exterior" isn't a range, it's this single value, and it never overlaps
 * the van's interior. */
export function requiredDoorTouchZ(shell: VanShell, depthD: number): number {
  return doorFaceZ(shell) + depthD / 2;
}

/** The valid placement envelope for an item of depth `depthD` mounted on
 * `doorId`, in the same world coordinates as any other instance (assuming
 * the door is closed — matches the position convention used everywhere
 * else). Unlike the roof/underbody envelopes, the Z range here is exactly
 * `depthD` wide and centered on the one flush-touching position: an item
 * that exactly fills this box is, by construction, touching the door and
 * nothing else — sliding it off that Z is what "moved away from the
 * exterior" means. */
export function computeDoorEnvelope(shell: VanShell, doorId: DoorId, depthD: number): Envelope {
  const { minX, maxX } = doorPanelXSpan(shell, doorId);
  const panelHeight = shell.rearDoorHeight;
  const z = requiredDoorTouchZ(shell, depthD);
  return {
    minX,
    maxX,
    minY: 0,
    maxY: panelHeight,
    minZ: z - depthD / 2,
    maxZ: z + depthD / 2,
    width: Math.max(0, maxX - minX),
    height: panelHeight,
    length: depthD,
  };
}

/** Corrects a door-mounted item's position to the nearest position that's
 * (a) within its door panel's width/height and (b) flush against it — i.e.
 * enforces "can slide anywhere along the exterior, can't move away from
 * touching it". Used on every placement/move of a door-mount instance so
 * that constraint is never just a red flag, it's physically unreachable. */
export function clampToDoorPanel(shell: VanShell, doorId: DoorId, dims: Dims, pos: Vec3): Vec3 {
  const env = computeDoorEnvelope(shell, doorId, dims.d);
  const halfW = dims.w / 2;
  const x = clamp(pos.x, env.minX + halfW, Math.max(env.minX + halfW, env.maxX - halfW));
  const y = clamp(pos.y, env.minY, Math.max(env.minY, env.maxY - dims.h));
  return { x, y, z: requiredDoorTouchZ(shell, dims.d) };
}

function surfaceOf(def: ComponentDef | undefined): MountSurface {
  return def?.mountSurface ?? 'floor';
}

/** Which physical space a surface's items occupy for collision purposes.
 * 'floor', 'ceiling', and 'wall' items share the van interior and DO collide
 * with each other (a wall-mounted panel vs. a tall cabinet); roof, underbody
 * and door items are each their own separate plane. */
export type PhysicalPlane = 'interior' | 'roof' | 'underbody' | 'door';
export function physicalPlane(surface: MountSurface): PhysicalPlane {
  return surface === 'floor' || surface === 'ceiling' || surface === 'wall' ? 'interior' : surface;
}
function samePlane(a: ComponentDef | undefined, b: ComponentDef | undefined): boolean {
  return physicalPlane(surfaceOf(a)) === physicalPlane(surfaceOf(b));
}

/** The world Y a ceiling-mounted item's TOP must touch when its footprint
 * is centered at (x, z): the finished ceiling, or — if any interior
 * (floor-plane) item overlaps that footprint in X/Z from above — the
 * underside of the LOWEST such item it can still fit beneath. This is what
 * makes a rail bolted under a raised bed platform hang from the bed rather
 * than the ceiling, and follow the bed down when it's lowered. Items the
 * target is allowed to overlap (same overlapGroup / whitelisted) are
 * ignored — the trolley+arm assembly rides ON its rail, it doesn't hang
 * under it. */
export function ceilingHangY(
  shell: VanShell,
  dims: Dims,
  x: number,
  z: number,
  target: Pick<PlacedInstance, 'id' | 'overlapWhitelist'>,
  targetDef: ComponentDef,
  others: PlacedInstance[],
  defsById: Record<string, ComponentDef>
): number {
  const env = computeEnvelope(shell);
  let hang = env.maxY;
  const halfW = dims.w / 2;
  const halfD = dims.d / 2;
  for (const other of others) {
    if (other.id === target.id) continue;
    const oDef = defsById[other.defId];
    if (!oDef || surfaceOf(oDef) !== 'floor') continue;
    if (target.overlapWhitelist?.includes(other.id) || other.overlapWhitelist?.includes(target.id)) continue;
    if (targetDef.overlapGroup && targetDef.overlapGroup === oDef.overlapGroup) continue;
    const oBox = instanceAABB(other, oDef);
    const overlapsXZ =
      x - halfW < oBox.maxX - 1e-6 && x + halfW > oBox.minX + 1e-6 && z - halfD < oBox.maxZ - 1e-6 && z + halfD > oBox.minZ + 1e-6;
    if (!overlapsXZ) continue;
    // Only hang from things we can actually fit under; something sitting on
    // the floor (a cabinet) isn't a "ceiling" — that's a plain collision.
    if (oBox.minY - dims.h < env.minY - 1e-6) continue;
    hang = Math.min(hang, oBox.minY);
  }
  return hang;
}

/** Corrects a ceiling-mounted item's position: X/Z clamped into the
 * interior envelope, Y forced to (hang height − item height) so its top is
 * pressed against the ceiling or the underside of what's above it. Used on
 * every placement/move so "floating below the ceiling" is unreachable, not
 * just flagged. */
export function clampToCeiling(
  shell: VanShell,
  dims: Dims,
  pos: Vec3,
  target: Pick<PlacedInstance, 'id' | 'overlapWhitelist'>,
  targetDef: ComponentDef,
  others: PlacedInstance[],
  defsById: Record<string, ComponentDef>
): Vec3 {
  const env = computeEnvelope(shell);
  const halfW = dims.w / 2;
  const halfD = dims.d / 2;
  const x = clamp(pos.x, env.minX + halfW, Math.max(env.minX + halfW, env.maxX - halfW));
  const z = clamp(pos.z, env.minZ + halfD, Math.max(env.minZ + halfD, env.maxZ - halfD));
  const hang = ceilingHangY(shell, dims, x, z, target, targetDef, others, defsById);
  const y = Math.max(env.minY, hang - dims.h);
  return { x, y, z };
}

/** Fixed cab/front-seat exclusion zone, in the same absolute shell coordinates
 * as component placement. Deliberately NOT folded into computeEnvelope — it's
 * a hard build-exclusion region layered on top, not a dimension constraint. */
export function computeCabZone(shell: VanShell): AABB {
  return {
    minX: 0,
    maxX: shell.interiorWidth,
    minY: 0,
    maxY: shell.interiorHeight,
    minZ: 0,
    maxZ: Math.max(0, shell.cabDepth),
  };
}

export interface WheelWellZone {
  /** e.g. "front-left wheel well" — used in violation messages. */
  label: string;
  box: AABB;
}

/** Wheel well cutouts, in the same absolute shell coordinates as component
 * placement — same treatment as computeCabZone: a hard floor-plane
 * exclusion layered on top, not folded into computeEnvelope. Returns one
 * flat-topped box per rear side (left/right); returns [] if
 * width/height/length is 0 (i.e. disabled). Front wheel wells aren't
 * modeled — they fall inside the cab zone, which is already off-limits, so
 * there's nothing to build around there. */
export function computeWheelWellZones(shell: VanShell): WheelWellZone[] {
  const { wheelWellWidth: w, wheelWellHeight: h, wheelWellLength: len } = shell;
  if (w <= 0 || h <= 0 || len <= 0) return [];

  const centerZ = shell.rearWheelWellCenterZ;
  const sides = [
    { label: 'left', minX: 0, maxX: w },
    { label: 'right', minX: Math.max(0, shell.interiorWidth - w), maxX: shell.interiorWidth },
  ];

  return sides.map((side) => ({
    label: `rear-${side.label} wheel well`,
    box: {
      minX: side.minX,
      maxX: side.maxX,
      minY: 0,
      maxY: h,
      minZ: centerZ - len / 2,
      maxZ: centerZ + len / 2,
    },
  }));
}

/** Footprint dims after applying a 90-degree-snapped yaw rotation. */
export function rotatedDims(dims: Dims, rotationY: number): Dims {
  const turned = ((rotationY % 180) + 180) % 180 === 90;
  return turned ? { w: dims.d, d: dims.w, h: dims.h } : { ...dims };
}

export interface AABB {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export function instanceAABB(instance: PlacedInstance, def: ComponentDef): AABB {
  const dims = rotatedDims(def.dims, instance.rotationY);
  return {
    minX: instance.pos.x - dims.w / 2,
    maxX: instance.pos.x + dims.w / 2,
    minY: instance.pos.y,
    maxY: instance.pos.y + dims.h,
    minZ: instance.pos.z - dims.d / 2,
    maxZ: instance.pos.z + dims.d / 2,
  };
}

export function aabbIntersects(a: AABB, b: AABB, epsilon = 1e-6): boolean {
  return (
    a.minX < b.maxX - epsilon &&
    a.maxX > b.minX + epsilon &&
    a.minY < b.maxY - epsilon &&
    a.maxY > b.minY + epsilon &&
    a.minZ < b.maxZ - epsilon &&
    a.maxZ > b.minZ + epsilon
  );
}

export function aabbWithinEnvelope(box: AABB, env: Envelope, epsilon = 1e-6): boolean {
  return (
    box.minX >= env.minX - epsilon &&
    box.maxX <= env.maxX + epsilon &&
    box.minY >= env.minY - epsilon &&
    box.maxY <= env.maxY + epsilon &&
    box.minZ >= env.minZ - epsilon &&
    box.maxZ <= env.maxZ + epsilon
  );
}

/** Is an overlap between these two instances considered "designed", i.e.
 * intentional/allowed, rather than a real collision? */
export function overlapIsAllowed(
  a: PlacedInstance,
  aDef: ComponentDef,
  b: PlacedInstance,
  bDef: ComponentDef,
  matrix: OverlapMatrix
): boolean {
  if (a.overlapWhitelist?.includes(b.id) || b.overlapWhitelist?.includes(a.id)) return true;
  if (aDef.overlapGroup && aDef.overlapGroup === bDef.overlapGroup) return true;
  const row = matrix[aDef.category];
  if (row && row[bDef.category]) return true;
  const row2 = matrix[bDef.category];
  if (row2 && row2[aDef.category]) return true;
  return false;
}

export interface Violation {
  type: 'collision' | 'out-of-bounds' | 'obstacle';
  instanceIds: string[];
  message: string;
}

// ---------------------------------------------------------------------------
// Clearances — "how far until the next collision" in each of the 6 axis
// directions, for the selected item. Reuses the exact same AABB/overlap
// logic as findViolations, just as a swept-distance query instead of a
// yes/no intersection test.
// ---------------------------------------------------------------------------

export interface Clearances {
  left: number; // -X, mm
  right: number; // +X
  up: number; // +Y
  down: number; // -Y
  forward: number; // -Z, toward the front/cab wall
  back: number; // +Z, toward the rear doors
}

type Axis = 'x' | 'y' | 'z';

function axisBounds(box: AABB, axis: Axis): [number, number] {
  if (axis === 'x') return [box.minX, box.maxX];
  if (axis === 'y') return [box.minY, box.maxY];
  return [box.minZ, box.maxZ];
}

function otherAxes(axis: Axis): [Axis, Axis] {
  return axis === 'x' ? ['y', 'z'] : axis === 'y' ? ['x', 'z'] : ['x', 'y'];
}

function rangesOverlap(aMin: number, aMax: number, bMin: number, bMax: number, epsilon = 1e-6): boolean {
  return aMin < bMax - epsilon && aMax > bMin + epsilon;
}

/** Max distance `box` could slide along `axis` in `sign` direction before
 * touching an obstacle in `obstacles` or its plane's envelope wall.
 * Obstacles are only relevant if they're actually in the box's path on the
 * other two axes — a component off to the side doesn't limit how far
 * something can rise straight up, for instance. */
function sweepClearance(
  box: AABB,
  obstacles: AABB[],
  axis: Axis,
  sign: 1 | -1,
  envMin: number,
  envMax: number,
  epsilon = 1e-6
): number {
  const [boxMin, boxMax] = axisBounds(box, axis);
  let limit = sign === 1 ? envMax - boxMax : boxMin - envMin;
  const [oA, oB] = otherAxes(axis);
  const [boxAMin, boxAMax] = axisBounds(box, oA);
  const [boxBMin, boxBMax] = axisBounds(box, oB);

  for (const obs of obstacles) {
    const [obsAMin, obsAMax] = axisBounds(obs, oA);
    if (!rangesOverlap(boxAMin, boxAMax, obsAMin, obsAMax, epsilon)) continue;
    const [obsBMin, obsBMax] = axisBounds(obs, oB);
    if (!rangesOverlap(boxBMin, boxBMax, obsBMin, obsBMax, epsilon)) continue;

    const [obsMin, obsMax] = axisBounds(obs, axis);
    if (sign === 1) {
      if (obsMin >= boxMax - epsilon) limit = Math.min(limit, obsMin - boxMax);
    } else {
      if (obsMax <= boxMin + epsilon) limit = Math.min(limit, boxMin - obsMax);
    }
  }
  return Math.max(0, limit);
}

/** Clearance to the nearest same-plane obstacle (or envelope wall) in each
 * of the 6 directions — e.g. how far a bed mounted near the ceiling could
 * drop before its underside reaches the floor (or whatever's below it). */
export function computeClearances(
  target: PlacedInstance,
  targetDef: ComponentDef,
  others: PlacedInstance[],
  defsById: Record<string, ComponentDef>,
  shell: VanShell,
  matrix: OverlapMatrix
): Clearances {
  const surface = surfaceOf(targetDef);
  const targetDoorId = target.doorId ?? 'rear-left';
  const targetWallSide = target.wallSide ?? 'left';
  const dims = rotatedDims(targetDef.dims, target.rotationY);
  let env: Envelope;
  if (surface === 'door') {
    env = computeDoorEnvelope(shell, targetDoorId, dims.d);
  } else if (surface === 'wall') {
    env = computeWallEnvelope(shell, targetWallSide, dims.w);
  } else {
    env = envelopeFor(shell, targetDef.mountSurface);
  }
  const box = instanceAABB(target, targetDef);

  const obstacles: AABB[] = [];
  for (const other of others) {
    if (other.id === target.id) continue;
    const oDef = defsById[other.defId];
    if (!oDef || !samePlane(oDef, targetDef)) continue;
    if (surface === 'door' && (other.doorId ?? 'rear-left') !== targetDoorId) continue;
    if (overlapIsAllowed(target, targetDef, other, oDef, matrix)) continue;
    obstacles.push(instanceAABB(other, oDef));
  }
  if (physicalPlane(surface) === 'interior') {
    obstacles.push(computeCabZone(shell));
    if (!targetDef.wheelWellCutout) {
      for (const zone of computeWheelWellZones(shell)) obstacles.push(zone.box);
    }
  }
  // Door-mounted items are flush by construction (env's Z range is exactly
  // the item's own depth) — forward/back sweeps naturally come out ~0,
  // correctly reporting "no play toward/away from the door."
  // Wall-mounted items are similarly flush — left/right sweeps come out ~0.

  return {
    left: sweepClearance(box, obstacles, 'x', -1, env.minX, env.maxX),
    right: sweepClearance(box, obstacles, 'x', 1, env.minX, env.maxX),
    up: sweepClearance(box, obstacles, 'y', 1, env.minY, env.maxY),
    down: sweepClearance(box, obstacles, 'y', -1, env.minY, env.maxY),
    forward: sweepClearance(box, obstacles, 'z', -1, env.minZ, env.maxZ),
    back: sweepClearance(box, obstacles, 'z', 1, env.minZ, env.maxZ),
  };
}

export function findViolations(
  instances: PlacedInstance[],
  defs: Record<string, ComponentDef>,
  shell: VanShell,
  matrix: OverlapMatrix
): Violation[] {
  const envBySurface: Record<'floor' | 'roof' | 'underbody' | 'ceiling', Envelope> = {
    floor: computeEnvelope(shell),
    ceiling: computeEnvelope(shell),
    roof: computeRoofEnvelope(shell),
    underbody: computeUnderbodyEnvelope(shell),
  };
  const envelopeLabel: Record<'floor' | 'roof' | 'underbody' | 'ceiling' | 'wall', string> = {
    floor: 'buildable',
    ceiling: 'buildable',
    roof: 'roof',
    underbody: 'underbody',
    wall: 'wall',
  };
  const cabZone = computeCabZone(shell);
  const wheelWellZones = computeWheelWellZones(shell);
  const violations: Violation[] = [];

  for (const inst of instances) {
    const def = defs[inst.defId];
    if (!def) continue;
    const surface = surfaceOf(def);
    const box = instanceAABB(inst, def);

    if (surface === 'door') {
      const doorId = inst.doorId ?? 'rear-left';
      const dims = rotatedDims(def.dims, inst.rotationY);
      const env = computeDoorEnvelope(shell, doorId, dims.d);
      const withinPanel =
        box.minX >= env.minX - 1e-6 &&
        box.maxX <= env.maxX + 1e-6 &&
        box.minY >= env.minY - 1e-6 &&
        box.maxY <= env.maxY + 1e-6;
      const flush = Math.abs(box.minZ - env.minZ) < 1e-6 && Math.abs(box.maxZ - env.maxZ) < 1e-6;
      if (!withinPanel) {
        violations.push({
          type: 'out-of-bounds',
          instanceIds: [inst.id],
          message: `${inst.label ?? def.name} extends outside the ${doorLabel(doorId)} panel`,
        });
      } else if (!flush) {
        violations.push({
          type: 'out-of-bounds',
          instanceIds: [inst.id],
          message: `${inst.label ?? def.name} isn't flush against the ${doorLabel(doorId)} — exterior-mounted items must stay touching the mounting surface`,
        });
      }
      continue;
    }

    if (surface === 'wall') {
      const wallSide = inst.wallSide ?? 'left';
      const dims = rotatedDims(def.dims, inst.rotationY);
      const env = computeWallEnvelope(shell, wallSide, dims.w);
      const withinWall =
        box.minY >= env.minY - 1e-6 &&
        box.maxY <= env.maxY + 1e-6 &&
        box.minZ >= env.minZ - 1e-6 &&
        box.maxZ <= env.maxZ + 1e-6;
      const expectedX = requiredWallTouchX(shell, wallSide, dims.w);
      const flush = Math.abs(inst.pos.x - expectedX) < 1e-6;
      if (!withinWall) {
        violations.push({
          type: 'out-of-bounds',
          instanceIds: [inst.id],
          message: `${inst.label ?? def.name} extends outside the ${wallLabel(wallSide)} bounds`,
        });
      } else if (!flush) {
        violations.push({
          type: 'out-of-bounds',
          instanceIds: [inst.id],
          message: `${inst.label ?? def.name} isn't flush against the ${wallLabel(wallSide)} — wall-mounted items must stay touching the wall`,
        });
      }
      if (physicalPlane(surface) === 'interior' && aabbIntersects(box, cabZone)) {
        violations.push({
          type: 'obstacle',
          instanceIds: [inst.id],
          message: `${inst.label ?? def.name} overlaps the cab / front seat area`,
        });
      }
      continue;
    }

    const env = envBySurface[surface as 'floor' | 'roof' | 'underbody' | 'ceiling'];
    if (!aabbWithinEnvelope(box, env)) {
      violations.push({
        type: 'out-of-bounds',
        instanceIds: [inst.id],
        message: `${inst.label ?? def.name} extends outside the ${envelopeLabel[surface as 'floor' | 'roof' | 'underbody' | 'ceiling']} envelope`,
      });
    }
    if (surface === 'ceiling') {
      const dims = rotatedDims(def.dims, inst.rotationY);
      const hang = ceilingHangY(shell, dims, inst.pos.x, inst.pos.z, inst, def, instances, defs);
      if (Math.abs(box.maxY - hang) > 1e-3) {
        violations.push({
          type: 'out-of-bounds',
          instanceIds: [inst.id],
          message: `${inst.label ?? def.name} isn't hugging the ceiling (or the underside of what's above it) — ceiling-mounted items must stay pressed against it`,
        });
      }
    }
    if (physicalPlane(surface) === 'interior' && aabbIntersects(box, cabZone)) {
      violations.push({
        type: 'obstacle',
        instanceIds: [inst.id],
        message: `${inst.label ?? def.name} overlaps the cab / front seat area`,
      });
    }
    if (surface === 'floor' && !def.wheelWellCutout) {
      for (const zone of wheelWellZones) {
        if (aabbIntersects(box, zone.box)) {
          violations.push({
            type: 'obstacle',
            instanceIds: [inst.id],
            message: `${inst.label ?? def.name} overlaps the ${zone.label}`,
          });
        }
      }
    }
  }

  // Only compare items on the same mount surface — a roof solar panel and an
  // interior bed occupy entirely different physical planes and never collide.
  // Door-mounted items additionally only compare within the same panel — the
  // left and right rear doors are physically separate surfaces.
  for (let i = 0; i < instances.length; i++) {
    for (let j = i + 1; j < instances.length; j++) {
      const a = instances[i];
      const b = instances[j];
      const aDef = defs[a.defId];
      const bDef = defs[b.defId];
      if (!aDef || !bDef) continue;
      if (!samePlane(aDef, bDef)) continue;
      if (surfaceOf(aDef) === 'door' && (a.doorId ?? 'rear-left') !== (b.doorId ?? 'rear-left')) continue;
      const boxA = instanceAABB(a, aDef);
      const boxB = instanceAABB(b, bDef);
      if (aabbIntersects(boxA, boxB) && !overlapIsAllowed(a, aDef, b, bDef, matrix)) {
        violations.push({
          type: 'collision',
          instanceIds: [a.id, b.id],
          message: `${a.label ?? aDef.name} overlaps ${b.label ?? bDef.name}`,
        });
      }
    }
  }

  return violations;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), Math.min(hi, Math.max(lo, hi)));
}

/** Snap a position to a grid increment (mm). */
export function snap(v: number, grid: number): number {
  if (grid <= 0) return v;
  return Math.round(v / grid) * grid;
}

export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

/**
 * Find the closest conflict-free position for `target` (same rotation, same
 * footprint) — used by the "snap to nearest safe spot" recovery action.
 * Searches the floor plane (X/Z) around the item's current position first
 * (expanding ring search), since that resolves the overwhelming majority of
 * real layout conflicts without relocating the item vertically; only falls
 * back to scanning other heights if nothing on the current level works.
 * Returns null if no valid position exists anywhere in the envelope.
 */
/** Door-mount variant of findNearestValidPosition: Z is never searched (it's
 * pinned flush by clampToDoorPanel/computeDoorEnvelope) — only X/Y, the two
 * axes an item can actually slide along on the door's face, and only against
 * obstacles mounted on that same panel. */
function findNearestValidDoorPosition(
  target: PlacedInstance,
  targetDef: ComponentDef,
  others: PlacedInstance[],
  defsById: Record<string, ComponentDef>,
  shell: VanShell,
  matrix: OverlapMatrix,
  stepIn: number
): Vec3 | null {
  const doorId = target.doorId ?? 'rear-left';
  const dims = rotatedDims(targetDef.dims, target.rotationY);
  const env = computeDoorEnvelope(shell, doorId, dims.d);
  const halfW = dims.w / 2;
  const minCx = env.minX + halfW;
  const maxCx = env.maxX - halfW;
  const minCy = env.minY;
  const maxCy = env.maxY - dims.h;
  if (minCx > maxCx || minCy > maxCy) return null;
  const z = requiredDoorTouchZ(shell, dims.d);

  const others2 = others.filter(
    (o) => o.id !== target.id && surfaceOf(defsById[o.defId]) === 'door' && (o.doorId ?? 'rear-left') === doorId
  );

  function isValid(x: number, y: number): boolean {
    const box: AABB = { minX: x - halfW, maxX: x + halfW, minY: y, maxY: y + dims.h, minZ: z - dims.d / 2, maxZ: z + dims.d / 2 };
    for (const other of others2) {
      const oDef = defsById[other.defId];
      if (!oDef) continue;
      const oBox = instanceAABB(other, oDef);
      if (aabbIntersects(box, oBox) && !overlapIsAllowed(target, targetDef, other, oDef, matrix)) return false;
    }
    return true;
  }

  const startX = clamp(target.pos.x, minCx, maxCx);
  const startY = clamp(target.pos.y, minCy, maxCy);
  if (isValid(startX, startY)) return { x: startX, y: startY, z };

  const maxRadius = Math.max(env.width, env.height) + stepIn;
  for (let r = stepIn; r <= maxRadius; r += stepIn) {
    const candidates: { x: number; y: number; dist: number }[] = [];
    for (let dx = -r; dx <= r; dx += stepIn) {
      for (let dy = -r; dy <= r; dy += stepIn) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < r - stepIn / 2) continue;
        const x = clamp(startX + dx, minCx, maxCx);
        const y = clamp(startY + dy, minCy, maxCy);
        candidates.push({ x, y, dist: Math.hypot(dx, dy) });
      }
    }
    candidates.sort((a, b) => a.dist - b.dist);
    for (const c of candidates) {
      if (isValid(c.x, c.y)) return { x: c.x, y: c.y, z };
    }
  }
  return null;
}

/** Wall-mount variant of findNearestValidPosition: X is never searched (it's
 * pinned flush by clampToWall/computeWallEnvelope) — only Y/Z, the two axes
 * an item can actually slide along on the wall's face, and only against
 * interior-plane obstacles (wall items collide with floor/ceiling items). */
function findNearestValidWallPosition(
  target: PlacedInstance,
  targetDef: ComponentDef,
  others: PlacedInstance[],
  defsById: Record<string, ComponentDef>,
  shell: VanShell,
  matrix: OverlapMatrix,
  stepIn: number
): Vec3 | null {
  const wallSide = target.wallSide ?? 'left';
  const dims = rotatedDims(targetDef.dims, target.rotationY);
  const env = computeWallEnvelope(shell, wallSide, dims.w);
  const halfD = dims.d / 2;
  const minCz = env.minZ + halfD;
  const maxCz = env.maxZ - halfD;
  const minCy = env.minY;
  const maxCy = env.maxY - dims.h;
  if (minCz > maxCz || minCy > maxCy) return null;
  const x = requiredWallTouchX(shell, wallSide, dims.w);

  const cabZone = computeCabZone(shell);
  const wheelWellZones = computeWheelWellZones(shell);
  const others2 = others.filter(
    (o) => o.id !== target.id && physicalPlane(surfaceOf(defsById[o.defId])) === 'interior'
  );

  function isValid(y: number, z: number): boolean {
    const box: AABB = {
      minX: x - dims.w / 2,
      maxX: x + dims.w / 2,
      minY: y,
      maxY: y + dims.h,
      minZ: z - halfD,
      maxZ: z + halfD,
    };
    if (aabbIntersects(box, cabZone)) return false;
    if (!targetDef.wheelWellCutout) {
      for (const zone of wheelWellZones) {
        if (aabbIntersects(box, zone.box)) return false;
      }
    }
    for (const other of others2) {
      const oDef = defsById[other.defId];
      if (!oDef) continue;
      const oBox = instanceAABB(other, oDef);
      if (aabbIntersects(box, oBox) && !overlapIsAllowed(target, targetDef, other, oDef, matrix)) return false;
    }
    return true;
  }

  const startZ = clamp(target.pos.z, minCz, maxCz);
  const startY = clamp(target.pos.y, minCy, maxCy);
  if (isValid(startY, startZ)) return { x, y: startY, z: startZ };

  const maxRadius = Math.max(env.length, env.height) + stepIn;
  for (let r = stepIn; r <= maxRadius; r += stepIn) {
    const candidates: { y: number; z: number; dist: number }[] = [];
    for (let dz = -r; dz <= r; dz += stepIn) {
      for (let dy = -r; dy <= r; dy += stepIn) {
        if (Math.max(Math.abs(dz), Math.abs(dy)) < r - stepIn / 2) continue;
        const z = clamp(startZ + dz, minCz, maxCz);
        const y = clamp(startY + dy, minCy, maxCy);
        candidates.push({ y, z, dist: Math.hypot(dz, dy) });
      }
    }
    candidates.sort((a, b) => a.dist - b.dist);
    for (const c of candidates) {
      if (isValid(c.y, c.z)) return { x, y: c.y, z: c.z };
    }
  }
  return null;
}

export function findNearestValidPosition(
  target: PlacedInstance,
  targetDef: ComponentDef,
  others: PlacedInstance[],
  defsById: Record<string, ComponentDef>,
  shell: VanShell,
  matrix: OverlapMatrix,
  stepIn = 50 // mm — was 2 in
): Vec3 | null {
  const surface = surfaceOf(targetDef);
  if (surface === 'door') {
    return findNearestValidDoorPosition(target, targetDef, others, defsById, shell, matrix, stepIn);
  }
  if (surface === 'wall') {
    return findNearestValidWallPosition(target, targetDef, others, defsById, shell, matrix, stepIn);
  }
  const env = envelopeFor(shell, targetDef.mountSurface);
  const isCeiling = surface === 'ceiling';
  const obstacles: AABB[] =
    physicalPlane(surface) === 'interior'
      ? [
          computeCabZone(shell),
          ...(targetDef.wheelWellCutout ? [] : computeWheelWellZones(shell).map((z) => z.box)),
        ]
      : [];
  const dims = rotatedDims(targetDef.dims, target.rotationY);
  const halfW = dims.w / 2;
  const halfD = dims.d / 2;

  const minCx = env.minX + halfW;
  const maxCx = env.maxX - halfW;
  const minCz = env.minZ + halfD;
  const maxCz = env.maxZ - halfD;
  const minY = env.minY;
  const maxY = env.maxY - dims.h;
  if (minCx > maxCx || minCz > maxCz || minY > maxY) return null; // doesn't fit at all

  const others2 = others.filter((o) => o.id !== target.id && samePlane(defsById[o.defId], targetDef));

  // Ceiling items have no free Y — it's whatever the hang rule says at
  // this X/Z, so every candidate re-derives it instead of sweeping heights.
  const hangYAt = (x: number, z: number) =>
    Math.max(env.minY, ceilingHangY(shell, dims, x, z, target, targetDef, others, defsById) - dims.h);

  function isValid(x: number, yIn: number, z: number): boolean {
    const y = isCeiling ? hangYAt(x, z) : yIn;
    const box: AABB = { minX: x - halfW, maxX: x + halfW, minY: y, maxY: y + dims.h, minZ: z - halfD, maxZ: z + halfD };
    if (!aabbWithinEnvelope(box, env)) return false;
    for (const obs of obstacles) if (aabbIntersects(box, obs)) return false;
    for (const other of others2) {
      const oDef = defsById[other.defId];
      if (!oDef) continue;
      const oBox = instanceAABB(other, oDef);
      if (aabbIntersects(box, oBox) && !overlapIsAllowed(target, targetDef, other, oDef, matrix)) return false;
    }
    return true;
  }

  const startX = clamp(target.pos.x, minCx, maxCx);
  const startZ = clamp(target.pos.z, minCz, maxCz);
  const startY = clamp(target.pos.y, minY, maxY);

  const yFor = (x: number, z: number) => (isCeiling ? hangYAt(x, z) : startY);
  if (isValid(startX, startY, startZ)) return { x: startX, y: yFor(startX, startZ), z: startZ };

  const maxRadius = Math.max(env.width, env.length) + stepIn;
  for (let r = stepIn; r <= maxRadius; r += stepIn) {
    const candidates: { x: number; z: number; dist: number }[] = [];
    for (let dx = -r; dx <= r; dx += stepIn) {
      for (let dz = -r; dz <= r; dz += stepIn) {
        // Only the outer ring at this radius — inner points were already tried.
        if (Math.max(Math.abs(dx), Math.abs(dz)) < r - stepIn / 2) continue;
        const x = clamp(startX + dx, minCx, maxCx);
        const z = clamp(startZ + dz, minCz, maxCz);
        candidates.push({ x, z, dist: Math.hypot(dx, dz) });
      }
    }
    candidates.sort((a, b) => a.dist - b.dist);
    for (const c of candidates) {
      if (isValid(c.x, startY, c.z)) return { x: c.x, y: yFor(c.x, c.z), z: c.z };
    }
  }
  if (isCeiling) return null; // no other heights to try — Y isn't ours to choose

  // Last resort: sweep other floor heights too (rare — very cluttered van).
  const yStep = Math.max(stepIn, Math.min(dims.h, 150)); // mm — the 6-in cap was
  for (let y = minY; y <= maxY + 1e-6; y += yStep) {
    for (let x = minCx; x <= maxCx + 1e-6; x += stepIn * 2) {
      for (let z = minCz; z <= maxCz + 1e-6; z += stepIn * 2) {
        if (isValid(x, y, z)) return { x, y, z };
      }
    }
  }

  return null;
}
