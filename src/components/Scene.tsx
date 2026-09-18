import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useStore } from '../store';
import {
  computeEnvelope,
  computeRoofEnvelope,
  computeUnderbodyEnvelope,
  instanceAABB,
  findViolations,
  type Envelope,
} from '../geometry';
import VanShellMesh from './VanShellMesh';
import VanFeaturesMesh from './VanFeaturesMesh';
import RoofPlaneMesh from './RoofPlaneMesh';
import UnderbodyPlaneMesh from './UnderbodyPlaneMesh';
import PlacedItemMesh from './PlacedItemMesh';
import ClearanceGauges from './ClearanceGauges';

/** Applies one-shot camera-snap requests (top/front/back/left/right/roof/...)
 * from the store. Lives inside the Canvas so it can use useThree(). */
function CameraRig({
  floorEnv,
  roofEnv,
  underbodyEnv,
  controlsRef,
}: {
  floorEnv: Envelope;
  roofEnv: Envelope;
  underbodyEnv: Envelope;
  controlsRef: React.RefObject<any>;
}) {
  const { camera } = useThree();
  const request = useStore((s) => s.cameraViewRequest);

  useEffect(() => {
    if (!request) return;
    const sceneMinY = underbodyEnv.minY;
    const sceneMaxY = roofEnv.maxY;
    const center = new THREE.Vector3(
      (floorEnv.minX + floorEnv.maxX) / 2,
      (sceneMinY + sceneMaxY) / 2,
      (floorEnv.minZ + floorEnv.maxZ) / 2
    );
    const size = Math.max(floorEnv.width, floorEnv.length, sceneMaxY - sceneMinY, 1000);
    const dist = size * 1.6;
    let target = center;

    switch (request.view) {
      case 'front':
        camera.position.set(center.x, center.y, floorEnv.minZ - dist);
        break;
      case 'back':
        camera.position.set(center.x, center.y, floorEnv.maxZ + dist);
        break;
      case 'left':
        camera.position.set(floorEnv.minX - dist, center.y, center.z);
        break;
      case 'right':
        camera.position.set(floorEnv.maxX + dist, center.y, center.z);
        break;
      case 'top':
        camera.position.set(center.x, sceneMaxY + dist, center.z + 0.001);
        break;
      case 'bottom':
        camera.position.set(center.x, sceneMinY - dist, center.z + 0.001);
        break;
      case 'roof': {
        const roofCenter = new THREE.Vector3(
          (roofEnv.minX + roofEnv.maxX) / 2,
          (roofEnv.minY + roofEnv.maxY) / 2,
          (roofEnv.minZ + roofEnv.maxZ) / 2
        );
        const roofDist = Math.max(roofEnv.width, roofEnv.length, 800) * 1.5;
        camera.position.set(roofCenter.x, roofCenter.y + roofDist, roofCenter.z + 0.001);
        target = roofCenter;
        break;
      }
      case 'underbody': {
        const ubCenter = new THREE.Vector3(
          (underbodyEnv.minX + underbodyEnv.maxX) / 2,
          (underbodyEnv.minY + underbodyEnv.maxY) / 2,
          (underbodyEnv.minZ + underbodyEnv.maxZ) / 2
        );
        const ubDist = Math.max(underbodyEnv.width, underbodyEnv.length, 800) * 1.5;
        camera.position.set(ubCenter.x, ubCenter.y - ubDist, ubCenter.z + 0.001);
        target = ubCenter;
        break;
      }
      case 'iso':
      default:
        camera.position.set(center.x + size * 0.9, center.y + size * 0.9, center.z + size * 1.1);
        break;
    }

    camera.lookAt(target);
    if (controlsRef.current) {
      controlsRef.current.target.copy(target);
      controlsRef.current.update();
    }
  }, [request]);

  return null;
}

export default function Scene() {
  const shell = useStore((s) => s.shell);
  const defs = useStore((s) => s.defs);
  const instances = useStore((s) => s.instances);
  const overlapMatrix = useStore((s) => s.overlapMatrix);
  const selectedInstanceId = useStore((s) => s.selectedInstanceId);
  const selectInstance = useStore((s) => s.selectInstance);
  const doorsOpen = useStore((s) => s.doorsOpen);

  const controlsRef = useRef<any>(null);

  const defsById = useMemo(() => Object.fromEntries(defs.map((d) => [d.id, d])), [defs]);
  const floorEnv = computeEnvelope(shell);
  const roofEnv = computeRoofEnvelope(shell);
  const underbodyEnv = computeUnderbodyEnvelope(shell);
  const violations = useMemo(
    () => findViolations(instances, defsById, shell, overlapMatrix),
    [instances, defsById, shell, overlapMatrix]
  );
  const violatingIds = useMemo(() => {
    const set = new Set<string>();
    violations.forEach((v) => v.instanceIds.forEach((id) => set.add(id)));
    return set;
  }, [violations]);

  const target: [number, number, number] = [
    (floorEnv.minX + floorEnv.maxX) / 2,
    (underbodyEnv.minY + roofEnv.maxY) / 2,
    (floorEnv.minZ + floorEnv.maxZ) / 2,
  ];
  const camDistance = Math.max(floorEnv.width, floorEnv.length, 2000) * 1.4;

  return (
    <Canvas
      camera={{
        position: [target[0] + camDistance * 0.5, target[1] + camDistance * 0.5, target[2] + camDistance * 0.8],
        fov: 50,
        near: 1,
        far: 60000,
      }}
      onPointerMissed={() => selectInstance(null)}
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[2500, 5000, 2500]} intensity={0.8} />
      <directionalLight position={[-2500, 2500, -2500]} intensity={0.3} />

      <VanShellMesh shell={shell} />
      <VanFeaturesMesh shell={shell} doorsOpen={doorsOpen} />
      <RoofPlaneMesh shell={shell} />
      <UnderbodyPlaneMesh shell={shell} />

      {instances.map((inst) => {
        const def = defsById[inst.defId];
        if (!def) return null;
        return (
          <PlacedItemMesh
            key={inst.id}
            instance={inst}
            def={def}
            selected={inst.id === selectedInstanceId}
            violating={violatingIds.has(inst.id)}
          />
        );
      })}

      <ClearanceGauges />

      <CameraRig floorEnv={floorEnv} roofEnv={roofEnv} underbodyEnv={underbodyEnv} controlsRef={controlsRef} />
      <OrbitControls ref={controlsRef} makeDefault target={target} minDistance={200} maxDistance={25000} />
    </Canvas>
  );
}

// Re-exported for potential external use (e.g. debug overlays).
export { instanceAABB };
