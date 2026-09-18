import { describe, expect, it } from 'vitest';
import { DEFAULT_SHELL } from './defaultData';
import { PROJECT_SCHEMA_VERSION, migrateInchesToMm, normalizeProject, type ProjectDefaults } from './projectOps';
import type { ProjectState, VanShell } from './types';

const defaults: ProjectDefaults = {
  shell: DEFAULT_SHELL,
  defs: [],
  buildOverlapMatrix: () => ({}),
};

function legacyProject(): unknown {
  // Hand-written legacy (inches) project, saved by the pre-mm app.
  return {
    // no version field — legacy inch-era data
    shell: {
      name: 'My Van',
      interiorLength: 100, // -> 2540
      interiorWidth: 10.00005, // -> 254
      interiorHeight: 20, // -> 508
      cabDepth: 1.5, // -> 38.1 -> 38
      insulationThickness: 0.25, // -> 6.35 -> 6
      estNeverTouched: 5,
    },
    defs: [
      {
        id: 'def1',
        name: 'Bed',
        category: 'bed',
        dims: { w: 54, d: 72, h: 9 }, // -> 1372, 1829, 229
        estCost: 123.45,
      },
    ],
    instances: [
      { id: 'i1', defId: 'def1', pos: { x: 10, y: 2, z: 30 }, rotationY: 0 }, // -> 254, 51, 762
      { id: 'i2', defId: 'def1', pos: { x: 0, y: 0, z: 0 }, rotationY: 90 },
    ],
    overlapMatrix: { bed: { bed: true } },
  };
}

describe('migrateInchesToMm', () => {
  it('converts shell, dims and instance positions ×25.4, rounded to nearest mm', () => {
    const out = migrateInchesToMm(legacyProject()) as Partial<ProjectState>;
    const shell = out.shell as unknown as Record<string, unknown>;
    expect(shell.interiorLength).toBe(2540);
    expect(shell.interiorWidth).toBe(254);
    expect(shell.interiorHeight).toBe(508);
    expect(shell.cabDepth).toBe(38); // 38.1 rounds down
    expect(shell.insulationThickness).toBe(6); // 6.35 rounds up
    expect(shell.estNeverTouched).toBe(5); // non-linear keys untouched
    const dims = (out.defs as { dims: { w: number; d: number; h: number } }[])[0].dims;
    expect(dims.w).toBe(1372);
    expect(dims.d).toBe(1829);
    expect(dims.h).toBe(229);
    const pos = (out.instances as { pos: { x: number; y: number; z: number } }[])[0].pos;
    expect(pos.x).toBe(254);
    expect(pos.y).toBe(51);
    expect(pos.z).toBe(762);
  });

  it('stamps the current schema version and leaves prices/categories alone', () => {
    const out = migrateInchesToMm(legacyProject()) as Partial<ProjectState>;
    expect(out.version).toBe(PROJECT_SCHEMA_VERSION);
    const def = (out.defs as { estCost: number; category: string }[])[0];
    expect(def.estCost).toBe(123.45);
    expect(def.category).toBe('bed');
  });

  it('handles null/undefined input defensively', () => {
    expect(migrateInchesToMm(null)).toBeNull();
    expect(migrateInchesToMm(undefined)).toBeUndefined();
  });
});

describe('normalizeProject inch→mm migration', () => {
  it('migrates a legacy unversioned project loaded from storage', () => {
    const project = normalizeProject(legacyProject(), defaults);
    expect(project.version).toBe(PROJECT_SCHEMA_VERSION);
    expect(project.shell.interiorLength).toBe(2540);
    expect(project.defs[0].dims.w).toBe(1372);
    expect((project.instances[0].pos)).toMatchObject({ x: 254, y: 51, z: 762 });
  });

  it('migrates an explicitly version-1 (inch) project loaded from storage', () => {
    const inchV1 = { ...(legacyProject() as object), version: 1 };
    const project = normalizeProject(inchV1, defaults);
    expect(project.version).toBe(PROJECT_SCHEMA_VERSION);
    expect(project.shell.interiorWidth).toBe(254);
    expect(project.overlapMatrix).toMatchObject({ bed: { bed: true } });
  });

  it('leaves an already-versioned (mm) project untouched', () => {
    const mmProject: ProjectState = {
      version: PROJECT_SCHEMA_VERSION,
      shell: { ...DEFAULT_SHELL, interiorLength: 4069 },
      defs: [
        { id: 'def1', name: 'Bed', category: 'bed', dims: { w: 1372, d: 1829, h: 229 } },
      ],
      instances: [
        { id: 'i1', defId: 'def1', pos: { x: 254, y: 51, z: 762 }, rotationY: 0 },
      ],
      overlapMatrix: {},
    };
    const project = normalizeProject(mmProject, defaults);
    expect(project.version).toBe(PROJECT_SCHEMA_VERSION);
    expect(project.shell.interiorLength).toBe(4069); // would be huge if re-converted
    expect(project.defs[0].dims.w).toBe(1372);
    expect(project.instances[0].pos).toMatchObject({ x: 254, y: 51, z: 762 });
  });
});

describe('defaultData is in millimeters', () => {
  it('ProMaster shell defaults are the inch figures ×25.4', () => {
    // interiorLength 160.2 in -> 4069 mm
    expect(Math.round((160.2 * 25.4) as number)).toBe(DEFAULT_SHELL.interiorLength);
    expect(Math.round(75.6 * 25.4)).toBe(DEFAULT_SHELL.interiorWidth);
    expect(Math.round(40 * 25.4)).toBe(DEFAULT_SHELL.cabDepth);
    expect(Math.round(17 * 25.4)).toBe(DEFAULT_SHELL.wheelWellHeight);
    expect(Math.round(126.2 * 25.4)).toBe(DEFAULT_SHELL.rearWheelWellCenterZ);
  });

  it('every shell linear value is a positive mm number', () => {
    const shell = DEFAULT_SHELL as unknown as Record<string, unknown>;
    for (const k of ['interiorLength', 'interiorWidth', 'interiorHeight', 'wallFramingThickness', 'wheelWellHeight', 'rearWheelWellCenterZ']) {
      expect(typeof shell[k]).toBe('number');
      expect(shell[k] as number).toBeGreaterThan(0);
    }
  });
});

describe('van shell typing', () => {
  it('shell keys still match VanShell', () => {
    const shell: VanShell = { ...DEFAULT_SHELL };
    expect(shell.sideDoorSide).toBe('right');
  });
});
