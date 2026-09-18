import { Html } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { useStore } from '../store';
import { computeClearances, instanceAABB } from '../geometry';

const GAUGE_COLOR = '#ffffff';
const MIN_VISIBLE = 1; // mm (was 0.05 in) — anything smaller isn't worth drawing

function GaugeLine({
  from,
  to,
  value,
}: {
  from: [number, number, number];
  to: [number, number, number];
  value: number;
}) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setFromPoints([new THREE.Vector3(...from), new THREE.Vector3(...to)]);
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from[0], from[1], from[2], to[0], to[1], to[2]]);

  if (value < MIN_VISIBLE) return null;

  const mid: [number, number, number] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];

  return (
    <group>
      <lineSegments geometry={geo}>
        <lineBasicMaterial color={GAUGE_COLOR} transparent opacity={0.85} />
      </lineSegments>
      <Html position={mid} center distanceFactor={60} occlude={false}>
        <div
          style={{
            background: 'rgba(10,14,18,0.85)',
            color: '#fff',
            fontSize: 11,
            padding: '2px 6px',
            borderRadius: 4,
            border: '1px solid rgba(255,255,255,0.3)',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {value.toFixed(1)}"
        </div>
      </Html>
    </group>
  );
}

/** Draws the selected item's 6-direction clearance gauges — dashed lines +
 * labels from each face to the nearest same-plane obstacle or envelope
 * wall. Only ever drawn for the ONE selected item, and only when the
 * "show in 3D" toggle is on, since six lines+labels per item gets busy
 * fast if applied to everything at once. */
export default function ClearanceGauges() {
  const showClearances = useStore((s) => s.showClearances);
  const selectedId = useStore((s) => s.selectedInstanceId);
  const instances = useStore((s) => s.instances);
  const defs = useStore((s) => s.defs);
  const shell = useStore((s) => s.shell);
  const overlapMatrix = useStore((s) => s.overlapMatrix);

  if (!showClearances || !selectedId) return null;
  const target = instances.find((i) => i.id === selectedId);
  const defsById = Object.fromEntries(defs.map((d) => [d.id, d]));
  const def = target ? defsById[target.defId] : null;
  if (!target || !def) return null;

  const box = instanceAABB(target, def);
  const c = computeClearances(target, def, instances, defsById, shell, overlapMatrix);

  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const cz = (box.minZ + box.maxZ) / 2;

  return (
    <group>
      <GaugeLine from={[box.minX, cy, cz]} to={[box.minX - c.left, cy, cz]} value={c.left} />
      <GaugeLine from={[box.maxX, cy, cz]} to={[box.maxX + c.right, cy, cz]} value={c.right} />
      <GaugeLine from={[cx, box.maxY, cz]} to={[cx, box.maxY + c.up, cz]} value={c.up} />
      <GaugeLine from={[cx, box.minY, cz]} to={[cx, box.minY - c.down, cz]} value={c.down} />
      <GaugeLine from={[cx, cy, box.minZ]} to={[cx, cy, box.minZ - c.forward]} value={c.forward} />
      <GaugeLine from={[cx, cy, box.maxZ]} to={[cx, cy, box.maxZ + c.back]} value={c.back} />
    </group>
  );
}
