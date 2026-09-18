import { create } from 'zustand';
import type { CameraView, ComponentDef, OverlapMatrix, PlacedInstance, ProjectState, VanShell, Vec3 } from './types';
import { DEFAULT_DEFS, DEFAULT_SHELL, buildDefaultOverlapMatrix } from './defaultData';
import { type Clearances, type Violation } from './geometry';
import * as ops from './projectOps';

const STORAGE_KEY = 'van-builder-project-v1';
export const GRID_SNAP = ops.GRID_SNAP;

const DEFAULTS: ops.ProjectDefaults = {
  shell: DEFAULT_SHELL,
  defs: DEFAULT_DEFS,
  buildOverlapMatrix: buildDefaultOverlapMatrix,
};

interface StoreState {
  shell: VanShell;
  defs: ComponentDef[];
  instances: PlacedInstance[];
  overlapMatrix: OverlapMatrix;
  selectedInstanceId: string | null;

  /** Door open/closed state for space-clearance simulation. Transient UI
   * state — not persisted with the project. */
  doorsOpen: { rear: boolean; side: boolean };
  toggleDoor: (which: 'rear' | 'side') => void;

  /** Whether the selected item's 6-direction clearance gauges draw in the
   * 3D view. Off by default — six lines + labels per item gets busy fast.
   * Transient UI state, not persisted. */
  showClearances: boolean;
  toggleClearances: () => void;

  /** Whether every placed item shows a floating label (its override label,
   * else its component name) in the 3D view. Off by default — a fully
   * loaded van gets visually noisy fast. Transient UI state, not
   * persisted. */
  showLabels: boolean;
  toggleLabels: () => void;
  /** Read-only "walk-around" mode (phones / ?viewer): the 3D view can be
   * orbited and labels toggled, but nothing can be selected, dragged or
   * edited, and nothing is written back to the bridge file. Transient. */
  viewerMode: boolean;
  setViewerMode: (on: boolean) => void;

  /** Whether the full-screen Catalog Sheet (spreadsheet view of every
   * component def — pricing, dims, links, notes) is open over the editor.
   * Transient UI state; ?catalog in the URL opens it on load. */
  catalogSheetOpen: boolean;
  setCatalogSheetOpen: (on: boolean) => void;

  /** One-shot camera-snap request consumed by the Scene. Always a fresh
   * object so requesting the same view twice in a row still fires. */
  cameraViewRequest: { view: CameraView; nonce: number } | null;
  requestCameraView: (view: CameraView) => void;

  setShell: (patch: Partial<VanShell>) => void;

  addDef: (def: Omit<ComponentDef, 'id'>) => string;
  updateDef: (id: string, patch: Partial<ComponentDef>) => void;
  removeDef: (id: string) => void;

  addInstance: (defId: string) => string;
  updateInstance: (id: string, patch: Partial<Omit<PlacedInstance, 'id'>>) => void;
  moveInstance: (id: string, delta: Partial<Vec3>) => void;
  removeInstance: (id: string) => void;
  selectInstance: (id: string | null) => void;
  duplicateInstance: (id: string) => void;
  /** Snap an out-of-bounds/colliding instance to the nearest conflict-free
   * position (same rotation). Returns false if none could be found. */
  resolveInstance: (id: string) => boolean;

  setOverlapAllowed: (catA: string, catB: string, allowed: boolean) => void;

  violations: () => Violation[];
  clearances: (id: string) => Clearances | null;
  defsById: () => Record<string, ComponentDef>;

  exportProject: () => ProjectState;
  importProject: (data: ProjectState) => void;
  resetToDefaults: () => void;
}

function loadInitial(): Pick<StoreState, 'shell' | 'defs' | 'instances' | 'overlapMatrix'> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return ops.normalizeProject(JSON.parse(raw), DEFAULTS);
  } catch {
    // ignore corrupt storage
  }
  return ops.normalizeProject(null, DEFAULTS);
}

function persist(state: Pick<StoreState, 'shell' | 'defs' | 'instances' | 'overlapMatrix'>) {
  const project: ProjectState = {
    version: ops.PROJECT_SCHEMA_VERSION,
    shell: state.shell,
    defs: state.defs,
    instances: state.instances,
    overlapMatrix: state.overlapMatrix,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  } catch {
    // storage full/unavailable — ignore
  }
}

/** Pulls the project-shaped slice out of full store state, for handing to
 * projectOps.ts functions (which only know about ProjectState, not the
 * store's UI-only fields like selectedInstanceId). */
function toProject(s: Pick<StoreState, 'shell' | 'defs' | 'instances' | 'overlapMatrix'>): ProjectState {
  return { version: ops.PROJECT_SCHEMA_VERSION, shell: s.shell, defs: s.defs, instances: s.instances, overlapMatrix: s.overlapMatrix };
}

export const useStore = create<StoreState>((set, get) => ({
  ...loadInitial(),
  selectedInstanceId: null,

  doorsOpen: { rear: false, side: false },
  toggleDoor: (which) => set((s) => ({ doorsOpen: { ...s.doorsOpen, [which]: !s.doorsOpen[which] } })),

  showClearances: false,
  toggleClearances: () => set((s) => ({ showClearances: !s.showClearances })),

  showLabels: false,
  toggleLabels: () => set((s) => ({ showLabels: !s.showLabels })),

  viewerMode: false,
  setViewerMode: (on) => set({ viewerMode: on, selectedInstanceId: null }),

  catalogSheetOpen: false,
  setCatalogSheetOpen: (on) => set({ catalogSheetOpen: on }),

  cameraViewRequest: null,
  requestCameraView: (view) => set({ cameraViewRequest: { view, nonce: Date.now() + Math.random() } }),

  setShell: (patch) =>
    set((s) => {
      const next = ops.setShell(toProject(s), patch);
      persist(next);
      return next;
    }),

  addDef: (def) => {
    let newId = '';
    set((s) => {
      const { project, id } = ops.addDef(toProject(s), def);
      newId = id;
      persist(project);
      return project;
    });
    return newId;
  },

  updateDef: (id, patch) =>
    set((s) => {
      const next = ops.updateDef(toProject(s), id, patch);
      persist(next);
      return next;
    }),

  removeDef: (id) =>
    set((s) => {
      const next = ops.removeDef(toProject(s), id);
      persist(next);
      return next;
    }),

  addInstance: (defId) => {
    let newId = '';
    set((s) => {
      const result = ops.addInstance(toProject(s), defId);
      if ('error' in result) return s;
      newId = result.instance.id;
      persist(result.project);
      return { ...result.project, selectedInstanceId: newId };
    });
    return newId;
  },

  updateInstance: (id, patch) =>
    set((s) => {
      const next = ops.updateInstance(toProject(s), id, patch);
      persist(next);
      return next;
    }),

  moveInstance: (id, delta) =>
    set((s) => {
      const next = ops.moveInstanceDelta(toProject(s), id, delta);
      persist(next);
      return next;
    }),

  removeInstance: (id) =>
    set((s) => {
      const next = ops.removeInstance(toProject(s), id);
      persist(next);
      return { ...next, selectedInstanceId: s.selectedInstanceId === id ? null : s.selectedInstanceId };
    }),

  selectInstance: (id) => set({ selectedInstanceId: id }),

  duplicateInstance: (id) =>
    set((s) => {
      const result = ops.duplicateInstance(toProject(s), id);
      if ('error' in result) return s;
      persist(result.project);
      return { ...result.project, selectedInstanceId: result.instance.id };
    }),

  resolveInstance: (id) => {
    let moved = false;
    set((s) => {
      const result = ops.resolveInstance(toProject(s), id);
      moved = result.moved;
      if (!result.moved) return s;
      persist(result.project);
      return result.project;
    });
    return moved;
  },

  setOverlapAllowed: (catA, catB, allowed) =>
    set((s) => {
      const next = ops.setOverlapAllowed(toProject(s), catA, catB, allowed);
      persist(next);
      return next;
    }),

  violations: () => ops.getViolations(toProject(get())),
  clearances: (id) => ops.getClearances(toProject(get()), id),

  defsById: () => ops.defsById(toProject(get())),

  exportProject: () => toProject(get()),

  importProject: (data) =>
    set((s) => {
      const next = ops.normalizeProject(data, DEFAULTS);
      persist(next);
      return { ...next, selectedInstanceId: null };
    }),

  resetToDefaults: () =>
    set(() => {
      const next = ops.normalizeProject(null, DEFAULTS);
      persist(next);
      return { ...next, selectedInstanceId: null };
    }),
}));
