import { describe, expect, it } from 'vitest';
import { DEFAULT_SHELL } from './defaultData';
import {
  aabbIntersects,
  clamp,
  clampToCeiling,
  clampToWall,
  computeCabZone,
  computeEnvelope,
  computeWallEnvelope,
  computeWheelWellZones,
  ceilingHangY,
  findNearestValidPosition,
  physicalPlane,
  requiredWallTouchX,
  snap,
} from './geometry';
import type { ComponentDef, PlacedInstance } from './types';

describe('computeEnvelope', () => {
  it('subtracts wall, floor, and ceiling build-up from the ProMaster shell', () => {
    const env = computeEnvelope(DEFAULT_SHELL);
    const wall = DEFAULT_SHELL.wallFramingThickness + DEFAULT_SHELL.insulationThickness;
    expect(env.minX).toBe(wall);
    expect(env.maxX).toBe(DEFAULT_SHELL.interiorWidth - wall);
    expect(env.minY).toBe(DEFAULT_SHELL.floorBuildUpThickness);
    expect(env.maxY).toBe(DEFAULT_SHELL.interiorHeight - DEFAULT_SHELL.ceilingFramingThickness);
    expect(env.width).toBeGreaterThan(0);
    expect(env.length).toBeGreaterThan(0);
  });
});

describe('physicalPlane', () => {
  it('maps mount surfaces onto the four physical planes', () => {
    expect(physicalPlane('floor')).toBe('interior');
    expect(physicalPlane('ceiling')).toBe('interior');
    expect(physicalPlane('roof')).toBe('roof');
    expect(physicalPlane('underbody')).toBe('underbody');
    expect(physicalPlane('door')).toBe('door');
  });
});

describe('aabbIntersects', () => {
  it('detects overlapping boxes and ignores separated ones', () => {
    const a = { minX: 0, maxX: 250, minY: 0, maxY: 250, minZ: 0, maxZ: 250 };
    const b = { minX: 125, maxX: 375, minY: 0, maxY: 250, minZ: 0, maxZ: 250 };
    const c = { minX: 500, maxX: 750, minY: 0, maxY: 250, minZ: 0, maxZ: 250 };
    expect(aabbIntersects(a, b)).toBe(true);
    expect(aabbIntersects(a, c)).toBe(false);
  });
});

describe('snap / clamp', () => {
  it('snaps to the 5 mm grid and clamps into range', () => {
    expect(snap(10.24, 5)).toBe(10);
    expect(snap(10.26, 5)).toBe(10);
    expect(snap(13.4, 5)).toBe(15);
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });
});

describe('cab and wheel-well exclusion', () => {
  it('cab zone occupies the front cabDepth of the interior', () => {
    const cab = computeCabZone(DEFAULT_SHELL);
    expect(cab.minZ).toBe(0);
    expect(cab.maxZ).toBe(DEFAULT_SHELL.cabDepth);
  });
  it('wheel wells intrude from both side walls', () => {
    const wells = computeWheelWellZones(DEFAULT_SHELL);
    expect(wells.length).toBe(2);
    expect(wells[0].box.minX).toBe(0);
    expect(wells[1].box.maxX).toBe(DEFAULT_SHELL.interiorWidth);
  });
});

describe('ceiling hang', () => {
  const def: ComponentDef = {
    id: 'rail',
    name: 'Rail',
    category: 'other',
    standard: true,
    dims: { w: 250, d: 250, h: 100 },
    mountSurface: 'ceiling',
  };
  const target: PlacedInstance = {
    id: 'a',
    defId: 'rail',
    pos: { x: 762, y: 1270, z: 2032 },
    rotationY: 0,
  };

  it('hangs from the interior ceiling when nothing is above', () => {
    const hang = ceilingHangY(DEFAULT_SHELL, def.dims, 762, 2032, target, def, [], { rail: def });
    const env = computeEnvelope(DEFAULT_SHELL);
    expect(hang).toBe(env.maxY);
  });

  it('clampToCeiling sets Y so the top is pressed against the hang height', () => {
    const pos = clampToCeiling(DEFAULT_SHELL, def.dims, { x: 762, y: 0, z: 2032 }, target, def, [], {
      rail: def,
    });
    const env = computeEnvelope(DEFAULT_SHELL);
    expect(pos.y).toBeCloseTo(env.maxY - def.dims.h);
  });
});

describe('findNearestValidPosition', () => {
  it('returns a position inside the envelope for a small floor item', () => {
    const boxDef: ComponentDef = {
      id: 'box',
      name: 'Box',
      category: 'storage',
      standard: true,
      dims: { w: 300, d: 300, h: 300 },
      mountSurface: 'floor',
    };
    const inst: PlacedInstance = {
      id: 'b1',
      defId: 'box',
      pos: { x: 5080, y: 38, z: 5080 },
      rotationY: 0,
    };
    const found = findNearestValidPosition(
      inst,
      boxDef,
      [],
      { box: boxDef },
      DEFAULT_SHELL,
      {},
      100
    );
    expect(found).not.toBeNull();
    const env = computeEnvelope(DEFAULT_SHELL);
    expect(found!.x).toBeGreaterThanOrEqual(env.minX);
    expect(found!.x).toBeLessThanOrEqual(env.maxX);
    expect(found!.z).toBeGreaterThanOrEqual(DEFAULT_SHELL.cabDepth);
  });
});

describe('wall mount surface', () => {
  it('physicalPlane maps wall to interior (same collision space as floor/ceiling)', () => {
    expect(physicalPlane('wall')).toBe('interior');
  });

  it('computeWallEnvelope returns correct bounds for left wall', () => {
    const itemWidth = 150; // mm
    const env = computeWallEnvelope(DEFAULT_SHELL, 'left', itemWidth);
    const wallEat = DEFAULT_SHELL.wallFramingThickness + DEFAULT_SHELL.insulationThickness;
    expect(env.minX).toBe(wallEat);
    expect(env.maxX).toBe(wallEat + itemWidth);
    expect(env.minZ).toBeGreaterThanOrEqual(DEFAULT_SHELL.cabDepth);
    expect(env.minY).toBe(DEFAULT_SHELL.floorBuildUpThickness);
  });

  it('computeWallEnvelope returns correct bounds for right wall', () => {
    const itemWidth = 150; // mm
    const env = computeWallEnvelope(DEFAULT_SHELL, 'right', itemWidth);
    const wallEat = DEFAULT_SHELL.wallFramingThickness + DEFAULT_SHELL.insulationThickness;
    expect(env.maxX).toBe(DEFAULT_SHELL.interiorWidth - wallEat);
    expect(env.minX).toBe(DEFAULT_SHELL.interiorWidth - wallEat - itemWidth);
  });

  it('requiredWallTouchX returns the correct X for flush mounting', () => {
    const itemWidth = 254; // mm
    const wallEat = DEFAULT_SHELL.wallFramingThickness + DEFAULT_SHELL.insulationThickness;
    const leftX = requiredWallTouchX(DEFAULT_SHELL, 'left', itemWidth);
    expect(leftX).toBe(wallEat + itemWidth / 2);
    const rightX = requiredWallTouchX(DEFAULT_SHELL, 'right', itemWidth);
    expect(rightX).toBe(DEFAULT_SHELL.interiorWidth - wallEat - itemWidth / 2);
  });

  it('clampToWall constrains position to wall bounds and sets X flush', () => {
    const dims = { w: 200, d: 150, h: 250 };
    const pos = { x: 1270, y: 2540, z: 12700 };
    const clamped = clampToWall(DEFAULT_SHELL, 'left', dims, pos);
    const wallEat = DEFAULT_SHELL.wallFramingThickness + DEFAULT_SHELL.insulationThickness;
    expect(clamped.x).toBe(wallEat + dims.w / 2);
    expect(clamped.y).toBeLessThanOrEqual(DEFAULT_SHELL.interiorHeight - DEFAULT_SHELL.ceilingFramingThickness - dims.h);
    expect(clamped.z).toBeLessThanOrEqual(DEFAULT_SHELL.interiorLength - wallEat - dims.d / 2);
  });

  it('findNearestValidPosition handles wall mount items', () => {
    const wallDef: ComponentDef = {
      id: 'panel',
      name: 'Wall Panel',
      category: 'other',
      standard: true,
      dims: { w: 100, d: 150, h: 200 },
      mountSurface: 'wall',
    };
    const inst: PlacedInstance = {
      id: 'w1',
      defId: 'panel',
      pos: { x: 1270, y: 508, z: 2032 },
      rotationY: 0,
      wallSide: 'left',
    };
    const found = findNearestValidPosition(
      inst,
      wallDef,
      [],
      { panel: wallDef },
      DEFAULT_SHELL,
      {},
      100
    );
    expect(found).not.toBeNull();
    const wallEat = DEFAULT_SHELL.wallFramingThickness + DEFAULT_SHELL.insulationThickness;
    expect(found!.x).toBe(wallEat + wallDef.dims.w / 2);
  });
});
