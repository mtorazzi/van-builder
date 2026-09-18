// Framework-agnostic core: pure functions that read/mutate a ProjectState,
// with zero React/zustand/DOM/Node dependencies (same spirit as geometry.ts,
// which this module builds on). This is the ONE place placement, editing,
// and normalization logic lives — src/store.ts (the browser app) and
// mcp-server/ (the MCP file-bridge server) both call these functions rather
// than each having their own copy, so the two can't silently drift.
//
// Phase-2 note: because this file and geometry.ts have no browser- or
// Node-specific imports, a future live-sync server (WebSocket push instead
// of the Phase-1 file-watch bridge) can import them directly too — nothing
// here needs to be extracted or rewritten to get there.

import { v4 as uuid } from 'uuid';
import type { ComponentDef, DoorId, OverlapMatrix, PlacedInstance, ProjectState, VanShell, Vec3, WallSide } from './types';
import {
  clamp,
  clampToCeiling,
  clampToDoorPanel,
  clampToWall,
  computeClearances,
  computeDoorEnvelope,
  computeWallEnvelope,
  envelopeFor,
  findNearestValidPosition,
  findViolations,
  requiredDoorTouchZ,
  requiredWallTouchX,
  rotatedDims,
  snap,
  type Clearances,
  type Violation,
} from './geometry';

/** Constrained-mount instances (door, wall, ceiling) must stay flush against
 * their mounting surface — this re-clamps position into bounds and forces
 * the constrained axis back to the touching position after ANY change.
 * Not just a validity check: the constraint is enforced here so "moved away
 * from the mount surface" is unreachable, not just flagged red. No-op for
 * floor/roof/underbody surfaces. */
function reclampConstrainedInstance(project: ProjectState, inst: PlacedInstance): PlacedInstance {
  const def = project.defs.find((d) => d.id === inst.defId);
  if (!def) return inst;
  const surface = def.mountSurface ?? 'floor';
  if (surface === 'ceiling') {
    const dims = rotatedDims(def.dims, inst.rotationY);
    const pos = clampToCeiling(project.shell, dims, inst.pos, inst, def, project.instances, defsById(project));
    return { ...inst, pos };
  }
  if (surface === 'door') {
    const doorId: DoorId = inst.doorId ?? 'rear-left';
    const dims = rotatedDims(def.dims, inst.rotationY);
    const pos = clampToDoorPanel(project.shell, doorId, dims, inst.pos);
    return { ...inst, doorId, pos };
  }
  if (surface === 'wall') {
    const wallSide: WallSide = inst.wallSide ?? 'left';
    const dims = rotatedDims(def.dims, inst.rotationY);
    const pos = clampToWall(project.shell, wallSide, dims, inst.pos);
    return { ...inst, wallSide, pos };
  }
  return inst;
}

/** Ceiling-hung items derive their Y from whatever is above them, so ANY
 * change to the layout (a bed platform lowered, a cabinet removed, a def's
 * dims/mountSurface edited, the shell's ceiling build-up changed) can
 * change where they must sit. Every mutation below runs its result through
 * this so ceiling items are always re-hung — that's what makes a rail
 * bolted under a lift bed follow the bed down. Cheap: a no-op pass when
 * nothing is ceiling-mounted. */
function rehangCeilingInstances(project: ProjectState): ProjectState {
  const byId = defsById(project);
  if (!project.instances.some((i) => (byId[i.defId]?.mountSurface ?? 'floor') === 'ceiling')) return project;
  let changed = false;
  const instances = project.instances.map((inst) => {
    const def = byId[inst.defId];
    if (!def || (def.mountSurface ?? 'floor') !== 'ceiling') return inst;
    const dims = rotatedDims(def.dims, inst.rotationY);
    const pos = clampToCeiling(project.shell, dims, inst.pos, inst, def, project.instances, byId);
    if (pos.x === inst.pos.x && pos.y === inst.pos.y && pos.z === inst.pos.z) return inst;
    changed = true;
    return { ...inst, pos };
  });
  return changed ? { ...project, instances } : project;
}

export const GRID_SNAP = 5; // mm — shared placement/nudge grid (was 0.5 in)

/** Current project schema version. Version 1 (or a missing version field)
 * means a legacy project in inches; version 2 is millimeters. */
export const PROJECT_SCHEMA_VERSION = 2;

const MM_PER_INCH = 25.4;
/** Legacy-inch → mm conversion policy: nearest whole millimeter. */
const mmFromInch = (inch: number) => Math.round(inch * MM_PER_INCH);

/** Linear fields of a legacy (inches) project that must be scaled. */
const SHELL_LINEAR_KEYS = [
  'interiorLength',
  'interiorWidth',
  'interiorHeight',
  'wallFramingThickness',
  'insulationThickness',
  'ceilingFramingThickness',
  'floorBuildUpThickness',
  'cabDepth',
  'cabSeatWidth',
  'cabSeatDepth',
  'cabSeatHeight',
  'rearDoorWidth',
  'rearDoorHeight',
  'sideDoorWidth',
  'sideDoorHeight',
  'sideDoorOffsetZ',
  'roofClearance',
  'underbodyClearance',
  'wheelWellWidth',
  'wheelWellHeight',
  'wheelWellLength',
  'rearWheelWellCenterZ',
] as const;

/**
 * Convert every linear value of a possibly-partial legacy (inches) project
 * object into millimeters (×25.4, rounded to the nearest whole mm) and stamp
 * it with the current schema version. Prices/USD, statuses, ids, colors,
 * names, and the overlap matrix (no linear values in it) are untouched.
 * Exported so it can be unit-tested directly; wired into normalizeProject
 * below, which is the one serialization/import boundary for store,
 * JSON import/export, and the MCP file-bridge alike.
 */
export function migrateInchesToMm(data: unknown): unknown {
  const p = data as Partial<ProjectState> | null | undefined;
  if (!p || typeof p !== 'object') return data;
  const shell = { ...((p.shell ?? {}) as Record<string, unknown>) };
  for (const k of SHELL_LINEAR_KEYS) {
    if (typeof shell[k] === 'number') shell[k] = mmFromInch(shell[k] as number);
  }
  const defs = Array.isArray(p.defs)
    ? p.defs.map((d) => {
        if (!d || typeof d !== 'object') return d;
        const dims = d.dims;
        return {
          ...d,
          dims:
            dims && typeof dims === 'object'
              ? {
                  w: typeof dims.w === 'number' ? mmFromInch(dims.w) : dims.w,
                  d: typeof dims.d === 'number' ? mmFromInch(dims.d) : dims.d,
                  h: typeof dims.h === 'number' ? mmFromInch(dims.h) : dims.h,
                }
              : dims,
          ...(d.ports && Array.isArray(d.ports)
            ? { ports: d.ports.map((port) => ({ ...port, x: mmFromInch(port.x), y: mmFromInch(port.y), z: mmFromInch(port.z) })) }
            : {}),
        };
      })
    : p.defs;
  const instances = Array.isArray(p.instances)
    ? p.instances.map((i) => {
        if (!i || typeof i !== 'object' || !i.pos) return i;
        return {
          ...i,
          pos: {
            x: typeof i.pos.x === 'number' ? mmFromInch(i.pos.x) : i.pos.x,
            y: typeof i.pos.y === 'number' ? mmFromInch(i.pos.y) : i.pos.y,
            z: typeof i.pos.z === 'number' ? mmFromInch(i.pos.z) : i.pos.z,
          },
        };
      })
    : p.instances;
  return { ...p, version: PROJECT_SCHEMA_VERSION, shell, defs, instances };
}

export interface ProjectDefaults {
  shell: VanShell;
  defs: ComponentDef[];
  /** Factory, not a value — callers must get a fresh object each time so
   * separate projects never share (and accidentally mutate) one matrix. */
  buildOverlapMatrix: () => OverlapMatrix;
}

/**
 * Merge possibly-partial / older-schema project data onto current defaults,
 * so a project saved before a shell field existed (or with defs/instances
 * missing) loads without `undefined`s. This is THE serialization/import
 * boundary for the whole app: the browser's localStorage load, its
 * Export/Import JSON feature, and the MCP file-bridge all call this same
 * function instead of each reimplementing the merge.
 */
export function normalizeProject(data: unknown, defaults: ProjectDefaults): ProjectState {
  const parsed = data as Partial<ProjectState> | null | undefined;
  if (!parsed || typeof parsed !== 'object' || !parsed.shell || !parsed.defs) {
    return {
      version: PROJECT_SCHEMA_VERSION,
      shell: defaults.shell,
      defs: defaults.defs,
      instances: [],
      overlapMatrix: defaults.buildOverlapMatrix(),
    };
  }
  // Legacy inch-era projects (no version field, or version 1) are converted
  // to millimeters before anything reads them; already-mm projects pass
  // through untouched.
  const legacy = (parsed.version ?? 1) < PROJECT_SCHEMA_VERSION;
  const converted = (legacy ? migrateInchesToMm(parsed) : parsed) as Partial<ProjectState>;
  return {
    version: PROJECT_SCHEMA_VERSION,
    shell: { ...defaults.shell, ...converted.shell },
    defs: converted.defs ?? [],
    instances: converted.instances ?? [],
    overlapMatrix: converted.overlapMatrix ?? defaults.buildOverlapMatrix(),
  };
}

export function defsById(project: ProjectState): Record<string, ComponentDef> {
  return Object.fromEntries(project.defs.map((d) => [d.id, d]));
}

/** Reuses geometry.ts's findViolations directly — never reimplemented. */
export function getViolations(project: ProjectState): Violation[] {
  return findViolations(project.instances, defsById(project), project.shell, project.overlapMatrix);
}

/** Distance from a placed instance to its nearest same-plane obstacle (or
 * envelope wall) in each of the 6 directions. Reuses geometry.ts's
 * computeClearances directly. Returns null if the instance doesn't exist. */
export function getClearances(project: ProjectState, instanceId: string): Clearances | null {
  const target = project.instances.find((i) => i.id === instanceId);
  const def = project.defs.find((d) => d.id === target?.defId);
  if (!target || !def) return null;
  return computeClearances(target, def, project.instances, defsById(project), project.shell, project.overlapMatrix);
}

export function setShell(project: ProjectState, patch: Partial<VanShell>): ProjectState {
  return rehangCeilingInstances({ ...project, shell: { ...project.shell, ...patch } });
}

export function addDef(project: ProjectState, def: Omit<ComponentDef, 'id'>): { project: ProjectState; id: string } {
  const id = uuid();
  return { project: { ...project, defs: [...project.defs, { ...def, id }] }, id };
}

export function updateDef(project: ProjectState, id: string, patch: Partial<ComponentDef>): ProjectState {
  return rehangCeilingInstances({ ...project, defs: project.defs.map((d) => (d.id === id ? { ...d, ...patch } : d)) });
}

export function removeDef(project: ProjectState, id: string): ProjectState {
  return rehangCeilingInstances({
    ...project,
    defs: project.defs.filter((d) => d.id !== id),
    instances: project.instances.filter((i) => i.defId !== id),
  });
}

export interface InstanceResult {
  project: ProjectState;
  instance: PlacedInstance;
}
export interface OpError {
  error: string;
}

/** Same corner-staggered auto-placement the Catalog panel's "+" button uses
 * (repeated adds of the same type nudge apart instead of stacking exactly). */
export function addInstance(project: ProjectState, defId: string): InstanceResult | OpError {
  const def = project.defs.find((d) => d.id === defId);
  if (!def) return { error: `No component def with id "${defId}"` };

  if ((def.mountSurface ?? 'floor') === 'door') {
    const doorId: DoorId = 'rear-left';
    const count = project.instances.filter((i) => i.defId === defId && (i.doorId ?? 'rear-left') === doorId).length;
    const env = computeDoorEnvelope(project.shell, doorId, def.dims.d);
    const halfW = def.dims.w / 2;
    const cx = clamp(env.minX + halfW + count * 100, env.minX + halfW, Math.max(env.minX + halfW, env.maxX - halfW));
    const z = requiredDoorTouchZ(project.shell, def.dims.d);
    const instance: PlacedInstance = {
      id: uuid(),
      defId,
      pos: { x: snap(cx, GRID_SNAP), y: snap(env.minY, GRID_SNAP), z },
      rotationY: 0,
      doorId,
    };
    return { project: { ...project, instances: [...project.instances, instance] }, instance };
  }

  if ((def.mountSurface ?? 'floor') === 'wall') {
    const wallSide: WallSide = 'left';
    const count = project.instances.filter((i) => i.defId === defId && (i.wallSide ?? 'left') === wallSide).length;
    const env = computeWallEnvelope(project.shell, wallSide, def.dims.w);
    const halfD = def.dims.d / 2;
    const cz = clamp(env.minZ + halfD + count * 100, env.minZ + halfD, Math.max(env.minZ + halfD, env.maxZ - halfD));
    const x = requiredWallTouchX(project.shell, wallSide, def.dims.w);
    const instance: PlacedInstance = {
      id: uuid(),
      defId,
      pos: { x, y: snap(env.minY, GRID_SNAP), z: snap(cz, GRID_SNAP) },
      rotationY: 0,
      wallSide,
    };
    return { project: { ...project, instances: [...project.instances, instance] }, instance };
  }

  const env = envelopeFor(project.shell, def.mountSurface);
  const count = project.instances.filter((i) => i.defId === defId).length;
  const w = def.dims.w;
  const d = def.dims.d;
  const cx = env.minX + w / 2;
  const cz = env.minZ + d / 2;
  // Snapping to the grid can round a corner-hugging position a hair outside
  // the envelope — clamp again after snapping so a freshly-added instance
  // never starts out of bounds.
  const x = clamp(
    snap(Math.min(cx + count * 100, Math.max(cx, env.maxX - w / 2)), GRID_SNAP),
    env.minX + w / 2,
    env.maxX - w / 2
  );
  const z = clamp(
    snap(Math.min(cz + count * 100, Math.max(cz, env.maxZ - d / 2)), GRID_SNAP),
    env.minZ + d / 2,
    env.maxZ - d / 2
  );
  const y = clamp(snap(env.minY, GRID_SNAP), env.minY, env.maxY);
  // Ceiling items: Y is derived (top pressed against the ceiling / what's
  // above), so re-clamp the fresh instance instead of leaving it on the floor.
  const instance: PlacedInstance = reclampConstrainedInstance(project, { id: uuid(), defId, pos: { x, y, z }, rotationY: 0 });
  return { project: { ...project, instances: [...project.instances, instance] }, instance };
}

/** Place an instance at an EXACT position/rotation the caller chose — what
 * the MCP server's place_item/place_items use, as opposed to addInstance's
 * auto-staggered default corner placement. `pos` follows the same
 * convention as everywhere else: x/z are the footprint CENTER, y is the
 * BASE height on whichever plane the def's mountSurface resolves to. */
export function placeInstanceAt(
  project: ProjectState,
  defId: string,
  pos: Vec3,
  rotationY: 0 | 90 | 180 | 270 = 0,
  doorId?: DoorId,
  wallSide?: WallSide
): InstanceResult | OpError {
  const def = project.defs.find((d) => d.id === defId);
  if (!def) return { error: `No component def with id "${defId}"` };
  let instance: PlacedInstance = { id: uuid(), defId, pos, rotationY };
  if ((def.mountSurface ?? 'floor') === 'door') instance.doorId = doorId ?? 'rear-left';
  if ((def.mountSurface ?? 'floor') === 'wall') instance.wallSide = wallSide ?? 'left';
  instance = reclampConstrainedInstance(project, instance);
  const next = rehangCeilingInstances({ ...project, instances: [...project.instances, instance] });
  return { project: next, instance: next.instances.find((i) => i.id === instance.id) ?? instance };
}

export function updateInstance(
  project: ProjectState,
  id: string,
  patch: Partial<Omit<PlacedInstance, 'id'>>
): ProjectState {
  return rehangCeilingInstances({
    ...project,
    instances: project.instances.map((i) => (i.id === id ? reclampConstrainedInstance(project, { ...i, ...patch }) : i)),
  });
}

export function moveInstanceDelta(project: ProjectState, id: string, delta: Partial<Vec3>): ProjectState {
  return rehangCeilingInstances({
    ...project,
    instances: project.instances.map((i) => {
      if (i.id !== id) return i;
      const pos: Vec3 = {
        x: snap(i.pos.x + (delta.x ?? 0), GRID_SNAP),
        y: snap(i.pos.y + (delta.y ?? 0), GRID_SNAP),
        z: snap(i.pos.z + (delta.z ?? 0), GRID_SNAP),
      };
      return reclampConstrainedInstance(project, { ...i, pos });
    }),
  });
}

export function removeInstance(project: ProjectState, id: string): ProjectState {
  return rehangCeilingInstances({ ...project, instances: project.instances.filter((i) => i.id !== id) });
}

export function duplicateInstance(project: ProjectState, id: string): InstanceResult | OpError {
  const src = project.instances.find((i) => i.id === id);
  if (!src) return { error: `No placed instance with id "${id}"` };
  const copy = reclampConstrainedInstance(project, {
    ...src,
    id: uuid(),
    pos: { x: src.pos.x + 50, y: src.pos.y, z: src.pos.z + 50 },
  });
  const next = rehangCeilingInstances({ ...project, instances: [...project.instances, copy] });
  return { project: next, instance: next.instances.find((i) => i.id === copy.id) ?? copy };
}

export interface ResolveResult {
  project: ProjectState;
  moved: boolean;
  pos?: Vec3;
}

/** Snap an out-of-bounds/colliding instance to the nearest conflict-free
 * position (same rotation) — reuses geometry.ts's findNearestValidPosition
 * directly, never reimplemented. */
export function resolveInstance(project: ProjectState, id: string): ResolveResult {
  const target = project.instances.find((i) => i.id === id);
  const def = project.defs.find((d) => d.id === target?.defId);
  if (!target || !def) return { project, moved: false };
  const result = findNearestValidPosition(
    target,
    def,
    project.instances,
    defsById(project),
    project.shell,
    project.overlapMatrix
  );
  if (!result) return { project, moved: false };
  return { project: updateInstance(project, id, { pos: result }), moved: true, pos: result };
}

export function setOverlapAllowed(project: ProjectState, catA: string, catB: string, allowed: boolean): ProjectState {
  const overlapMatrix: OverlapMatrix = JSON.parse(JSON.stringify(project.overlapMatrix));
  (overlapMatrix[catA] ??= {})[catB] = allowed;
  (overlapMatrix[catB] ??= {})[catA] = allowed;
  return { ...project, overlapMatrix };
}
