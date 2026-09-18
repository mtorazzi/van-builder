import { useMemo } from 'react';
import * as THREE from 'three';
import type { VanShell } from '../types';
import { computeCabZone, computeWheelWellZones, REAR_DOOR_THICKNESS, REAR_DOOR_OPEN_ANGLE_DEG } from '../geometry';

const CAB_COLOR = '#ffb703';
const SEAT_COLOR = '#3a3a3a';
const DOOR_COLOR = '#8d99ae';
const SIDE_DOOR_COLOR = '#4a919e';
// Not amber (CAB_COLOR) or violation-red (see types.ts's hue-reservation
// note) — a neutral slate so an empty wheel well zone never reads as an
// active conflict at rest.
const WHEEL_WELL_COLOR = '#6c757d';

/** One wheel well cutout — a flat-topped exclusion box, same visual
 * treatment as the cab zone (translucent fill + wireframe edges) so it
 * reads as "don't build here" rather than a real solid object. */
function WheelWellBox({ box, label }: { box: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }; label: string }) {
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  const d = box.maxZ - box.minZ;
  const geo = useMemo(() => new THREE.BoxGeometry(w, h, d), [w, h, d]);
  return (
    <group position={[box.minX + w / 2, box.minY + h / 2, box.minZ + d / 2]} name={label}>
      <mesh geometry={geo}>
        <meshBasicMaterial color={WHEEL_WELL_COLOR} transparent opacity={0.1} depthWrite={false} />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[geo]} />
        <lineBasicMaterial color={WHEEL_WELL_COLOR} transparent opacity={0.5} />
      </lineSegments>
    </group>
  );
}

/** One approximate captain's chair, swiveled to face the rear of the van (a
 * common camper-conversion move) — backrest toward the front, cushion
 * extending back to the rear edge of the cab zone. Positioned against that
 * rear edge (the boundary into the living area) rather than the front wall:
 * the windshield/dash/steering wheel live in the front portion of the cab
 * depth and aren't modeled, but they're exactly why the seat itself sits
 * back from z=0 — `zFront` is the seat assembly's own front (backrest) edge,
 * passed in by the caller so it can reserve that dash space. */
function CabSeat({
  x,
  zFront,
  width,
  depth,
  height,
}: {
  x: number;
  zFront: number;
  width: number;
  depth: number;
  height: number;
}) {
  const backThickness = Math.min(100, depth * 0.25); // mm (was 4 in)
  const seatHeight = Math.min(450, height * 0.45); // mm (was 18 in)

  const backGeo = useMemo(() => new THREE.BoxGeometry(width, height, backThickness), [width, height, backThickness]);
  const seatGeo = useMemo(
    () => new THREE.BoxGeometry(width, seatHeight, Math.max(0, depth - backThickness)),
    [width, seatHeight, depth, backThickness]
  );

  return (
    <group position={[x, 0, zFront]}>
      <mesh position={[0, height / 2, backThickness / 2]} geometry={backGeo}>
        <meshStandardMaterial color={SEAT_COLOR} />
      </mesh>
      <lineSegments position={[0, height / 2, backThickness / 2]}>
        <edgesGeometry args={[backGeo]} />
        <lineBasicMaterial color="#000000" transparent opacity={0.3} />
      </lineSegments>

      <mesh position={[0, seatHeight / 2, backThickness + (depth - backThickness) / 2]} geometry={seatGeo}>
        <meshStandardMaterial color={SEAT_COLOR} />
      </mesh>
      <lineSegments position={[0, seatHeight / 2, backThickness + (depth - backThickness) / 2]}>
        <edgesGeometry args={[seatGeo]} />
        <lineBasicMaterial color="#000000" transparent opacity={0.3} />
      </lineSegments>
    </group>
  );
}

/** One rear swing-door panel, hinged at the outer rear corner and shown
 * propped open so you can see whether cabinetry clears the opening. */
function RearDoorPanel({
  hingeX,
  z,
  width,
  height,
  openSign,
  open,
}: {
  hingeX: number;
  z: number;
  width: number;
  height: number;
  openSign: 1 | -1;
  open: boolean;
}) {
  const thickness = REAR_DOOR_THICKNESS;
  const geo = useMemo(() => new THREE.BoxGeometry(width, height, thickness), [width, height]);
  const openAngle = open ? openSign * ((REAR_DOOR_OPEN_ANGLE_DEG * Math.PI) / 180) : 0;
  const localX = -openSign * (width / 2); // panel extends away from hinge toward the van's centerline when closed

  return (
    <group position={[hingeX, 0, z]} rotation={[0, openAngle, 0]}>
      <mesh position={[localX, height / 2, 0]} geometry={geo}>
        <meshStandardMaterial color={DOOR_COLOR} transparent opacity={0.55} />
      </mesh>
      <lineSegments position={[localX, height / 2, 0]}>
        <edgesGeometry args={[geo]} />
        <lineBasicMaterial color="#1c2530" />
      </lineSegments>
    </group>
  );
}

export default function VanFeaturesMesh({
  shell,
  doorsOpen,
}: {
  shell: VanShell;
  doorsOpen: { rear: boolean; side: boolean };
}) {
  const cab = computeCabZone(shell);
  const cabW = cab.maxX - cab.minX;
  const cabH = cab.maxY - cab.minY;
  const cabD = cab.maxZ - cab.minZ;

  const cabGeo = useMemo(() => new THREE.BoxGeometry(cabW, cabH, cabD), [cabW, cabH, cabD]);
  const wheelWellZones = computeWheelWellZones(shell);

  const sideDoorX = shell.sideDoorSide === 'left' ? -19 : shell.interiorWidth + 19; // mm (was +-0.75 in)
  const sideDoorGeo = useMemo(
    () => new THREE.BoxGeometry(38, shell.sideDoorHeight, shell.sideDoorWidth),
    [shell.sideDoorHeight, shell.sideDoorWidth]
  );
  // Closed: flush over the opening. Open: slid backward along its track,
  // clear of the opening — a sliding door doesn't swing.
  const sideDoorZ = shell.sideDoorOffsetZ + shell.sideDoorWidth / 2 + (doorsOpen.side ? shell.sideDoorWidth : 0);
  const sideDoorY = shell.sideDoorHeight / 2;

  const panelWidth = shell.rearDoorWidth / 2;

  return (
    <group>
      {/* Cab / front-seat exclusion zone */}
      <group position={[cabW / 2, cabH / 2, cabD / 2]}>
        <mesh geometry={cabGeo}>
          <meshBasicMaterial color={CAB_COLOR} transparent opacity={0.06} depthWrite={false} />
        </mesh>
        <lineSegments>
          <edgesGeometry args={[cabGeo]} />
          <lineBasicMaterial color={CAB_COLOR} transparent opacity={0.6} />
        </lineSegments>
      </group>

      <CabSeat
        x={shell.cabSeatWidth / 2}
        zFront={Math.max(0, shell.cabDepth - shell.cabSeatDepth)}
        width={shell.cabSeatWidth}
        depth={shell.cabSeatDepth}
        height={shell.cabSeatHeight}
      />
      <CabSeat
        x={shell.interiorWidth - shell.cabSeatWidth / 2}
        zFront={Math.max(0, shell.cabDepth - shell.cabSeatDepth)}
        width={shell.cabSeatWidth}
        depth={shell.cabSeatDepth}
        height={shell.cabSeatHeight}
      />

      {/* Wheel well cutouts */}
      {wheelWellZones.map((zone) => (
        <WheelWellBox key={zone.label} box={zone.box} label={zone.label} />
      ))}

      {/* Rear swing doors */}
      <RearDoorPanel
        hingeX={0}
        z={shell.interiorLength}
        width={panelWidth}
        height={shell.rearDoorHeight}
        openSign={-1}
        open={doorsOpen.rear}
      />
      <RearDoorPanel
        hingeX={shell.interiorWidth}
        z={shell.interiorLength}
        width={panelWidth}
        height={shell.rearDoorHeight}
        openSign={1}
        open={doorsOpen.rear}
      />

      {/* Side sliding door marker */}
      <mesh position={[sideDoorX, sideDoorY, sideDoorZ]} geometry={sideDoorGeo}>
        <meshStandardMaterial color={SIDE_DOOR_COLOR} transparent opacity={0.4} />
      </mesh>
      <lineSegments position={[sideDoorX, sideDoorY, sideDoorZ]}>
        <edgesGeometry args={[sideDoorGeo]} />
        <lineBasicMaterial color={SIDE_DOOR_COLOR} />
      </lineSegments>
    </group>
  );
}
