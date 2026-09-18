import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Group } from 'three';
import { Html, TransformControls } from '@react-three/drei';
import type { ComponentDef, PlacedInstance } from '../types';
import { CATEGORY_COLORS, PORT_COLORS } from '../types';
import { useStore, GRID_SNAP } from '../store';
import { computeEnvelope, clamp, clampToCeiling, clampToDoorPanel, rotatedDims, snap, REAR_DOOR_OPEN_ANGLE_DEG } from '../geometry';

interface Props {
  instance: PlacedInstance;
  def: ComponentDef;
  selected: boolean;
  violating: boolean;
}

export default function PlacedItemMesh({ instance, def, selected, violating }: Props) {
  const groupRef = useRef<Group>(null);
  const selectInstance = useStore((s) => s.selectInstance);
  const updateInstance = useStore((s) => s.updateInstance);
  const shell = useStore((s) => s.shell);
  const instances = useStore((s) => s.instances);
  const defsById = useStore((s) => s.defsById());
  const doorsOpen = useStore((s) => s.doorsOpen);
  const showLabels = useStore((s) => s.showLabels);
  const viewerMode = useStore((s) => s.viewerMode);

  const color = violating ? '#e05a4e' : def.color ?? CATEGORY_COLORS[def.category];
  const boxGeo = useMemo(
    () => new THREE.BoxGeometry(def.dims.w, def.dims.h, def.dims.d),
    [def.dims.w, def.dims.h, def.dims.d]
  );

  const portGeo = useMemo(() => new THREE.SphereGeometry(36, 12, 8), []); // mm (was 1.4 in)

  const isDoor = def.mountSurface === 'door';
  const isCeiling = def.mountSurface === 'ceiling';
  const doorId = instance.doorId ?? 'rear-left';
  // Same hinge convention as VanFeaturesMesh's RearDoorPanel: left panel
  // hinges at x=0 (swings toward +angle... openSign -1), right panel hinges
  // at x=interiorWidth (openSign +1). Nesting this item's group inside an
  // identically-transformed outer group is what makes it swing WITH the
  // door instead of staying fixed in the van's world space.
  const hingeX = doorId === 'rear-left' ? 0 : shell.interiorWidth;
  const hingeZ = shell.interiorLength;
  const openSign = doorId === 'rear-left' ? -1 : 1;
  const doorOpenAngle = isDoor && doorsOpen.rear ? openSign * ((REAR_DOOR_OPEN_ANGLE_DEG * Math.PI) / 180) : 0;
  // instance.pos is always expressed in the door-CLOSED world frame (same
  // convention as every other mount surface); subtracting the hinge gives
  // the position relative to the hinge, which is what the outer rotated
  // group needs so it lands in the right place at any door angle.
  const localX = isDoor ? instance.pos.x - hingeX : instance.pos.x;
  const localY = instance.pos.y;
  const localZ = isDoor ? instance.pos.z - hingeZ : instance.pos.z;

  // Dragging a door-mounted item only makes geometric sense while the door
  // is closed (the gizmo operates in the hinge group's local space, which
  // only equals world space at angle 0). Position is still freely editable
  // via the Inspector's X/Y fields regardless of door state.
  const draggable = !viewerMode && selected && !instance.locked && !(isDoor && doorsOpen.rear);

  function handleDragEnd() {
    const g = groupRef.current;
    if (!g) return;
    const dims = rotatedDims(def.dims, instance.rotationY);
    if (isDoor) {
      const clamped = clampToDoorPanel(shell, doorId, dims, {
        x: g.position.x + hingeX,
        y: g.position.y,
        z: g.position.z + hingeZ,
      });
      g.position.set(clamped.x - hingeX, clamped.y, clamped.z - hingeZ);
      updateInstance(instance.id, { pos: clamped });
      return;
    }
    if (isCeiling) {
      // Drag anywhere in X/Z; Y snaps back up so the top hugs the ceiling
      // (or the underside of whatever's directly above — e.g. the bed).
      const raw = { x: snap(g.position.x, GRID_SNAP), y: g.position.y, z: snap(g.position.z, GRID_SNAP) };
      const clamped = clampToCeiling(shell, dims, raw, instance, def, instances, defsById);
      g.position.set(clamped.x, clamped.y, clamped.z);
      updateInstance(instance.id, { pos: clamped });
      return;
    }
    const env = computeEnvelope(shell);
    const x = snap(clamp(g.position.x, env.minX + dims.w / 2, env.maxX - dims.w / 2), GRID_SNAP);
    const y = snap(clamp(g.position.y, env.minY, env.maxY - dims.h), GRID_SNAP);
    const z = snap(clamp(g.position.z, env.minZ + dims.d / 2, env.maxZ - dims.d / 2), GRID_SNAP);
    g.position.set(x, y, z);
    updateInstance(instance.id, { pos: { x, y, z } });
  }

  return (
    <>
      <group position={isDoor ? [hingeX, 0, hingeZ] : [0, 0, 0]} rotation={isDoor ? [0, doorOpenAngle, 0] : [0, 0, 0]}>
        <group
          ref={groupRef}
          position={[localX, localY, localZ]}
          rotation={[0, (instance.rotationY * Math.PI) / 180, 0]}
          onClick={(e) => {
            if (viewerMode) return; // look, don't touch
            e.stopPropagation();
            selectInstance(instance.id);
          }}
        >
          <mesh position={[0, def.dims.h / 2, 0]} geometry={boxGeo}>
            <meshStandardMaterial color={color} transparent opacity={selected ? 0.85 : 0.65} />
          </mesh>
          <lineSegments position={[0, def.dims.h / 2, 0]}>
            <edgesGeometry args={[boxGeo]} />
            <lineBasicMaterial color={selected ? '#ffffff' : '#000000'} transparent opacity={selected ? 1 : 0.35} />
          </lineSegments>
          {def.ports?.map((port, i) => (
            <mesh key={i} position={[port.x, port.y, port.z]} geometry={portGeo}>
              <meshStandardMaterial
                color={PORT_COLORS[port.kind]}
                emissive={PORT_COLORS[port.kind]}
                emissiveIntensity={0.5}
              />
            </mesh>
          ))}
          {showLabels && (
            <Html position={[0, isCeiling ? -76 : def.dims.h + 76, 0]} center distanceFactor={80} zIndexRange={[0, 0]}>
              <div
                style={{
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: 'rgba(15, 17, 21, 0.82)',
                  color: '#fff',
                  fontSize: 12,
                  fontFamily: 'sans-serif',
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  border: selected ? '1px solid #fff' : '1px solid rgba(255,255,255,0.15)',
                }}
              >
                {instance.label ?? def.name}
              </div>
            </Html>
          )}
        </group>
      </group>
      {draggable && (
        <TransformControls
          object={groupRef.current ?? undefined}
          mode="translate"
          translationSnap={GRID_SNAP}
          onMouseUp={handleDragEnd}
        />
      )}
    </>
  );
}
