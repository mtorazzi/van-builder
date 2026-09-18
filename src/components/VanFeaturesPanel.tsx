import { useState } from 'react';
import { useStore } from '../store';
import type { VanShell } from '../types';
import { formatLength, parseLength, UNIT_LABEL } from '../lib/units';

export default function VanFeaturesPanel() {
  const shell = useStore((s) => s.shell);
  const setShell = useStore((s) => s.setShell);
  const doorsOpen = useStore((s) => s.doorsOpen);
  const toggleDoor = useStore((s) => s.toggleDoor);
  const [open, setOpen] = useState(false);
  const unit = useStore((s) => s.displayUnit);

  function num(key: keyof VanShell) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setShell({ [key]: parseLength(e.target.value, unit) } as Partial<VanShell>);
  }

  return (
    <div className="section">
      <h2 style={{ cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        Cab, Doors &amp; Layers {open ? '▾' : '▸'}
      </h2>

      <div className="hint" style={{ marginTop: 0 }}>
        Open doors to check build clearance
      </div>
      <div className="button-row" style={{ marginBottom: 10 }}>
        <button onClick={() => toggleDoor('rear')}>
          {doorsOpen.rear ? '🚪 Close rear doors' : '🚪 Open rear doors'}
        </button>
        <button onClick={() => toggleDoor('side')}>
          {doorsOpen.side ? '🚪 Close side door' : '🚪 Open side door'}
        </button>
      </div>

      {!open ? (
        <div className="hint" style={{ marginBottom: 0 }}>
          Rear doors, side slider, the front cab/seat exclusion zone, and clearance for the roof + underbody layout
          planes.
        </div>
      ) : (
        <>
          <div className="hint" style={{ marginTop: 0 }}>
            Cab area (driver/passenger seats, swiveled to face the rear). Nothing may be built inside this zone.
          </div>
          <div className="field-row">
            <label>Cab depth from front ({UNIT_LABEL[unit]})</label>
            <input
              type="number"
              step={25}
              value={formatLength(shell.cabDepth, unit)}
              onChange={num('cabDepth')}
            />
          </div>
          <div className="field-row">
            <label>Seat width ({UNIT_LABEL[unit]})</label>
            <input type="number" step={25} value={formatLength(shell.cabSeatWidth, unit)} onChange={num('cabSeatWidth')} />
          </div>
          <div className="field-row">
            <label>Seat depth ({UNIT_LABEL[unit]})</label>
            <input type="number" step={25} value={formatLength(shell.cabSeatDepth, unit)} onChange={num('cabSeatDepth')} />
          </div>
          <div className="field-row">
            <label>Seat height ({UNIT_LABEL[unit]})</label>
            <input type="number" step={25} value={formatLength(shell.cabSeatHeight, unit)} onChange={num('cabSeatHeight')} />
          </div>

          <div className="hint">Rear swing doors (shown propped open)</div>
          <div className="field-row">
            <label>Rear door width ({UNIT_LABEL[unit]})</label>
            <input type="number" step={25} value={formatLength(shell.rearDoorWidth, unit)} onChange={num('rearDoorWidth')} />
          </div>
          <div className="field-row">
            <label>Rear door height ({UNIT_LABEL[unit]})</label>
            <input type="number" step={25} value={formatLength(shell.rearDoorHeight, unit)} onChange={num('rearDoorHeight')} />
          </div>

          <div className="hint">Side sliding door — dimensions vary by van, adjust as needed</div>
          <div className="field-row">
            <label>Side door width ({UNIT_LABEL[unit]})</label>
            <input type="number" step={25} value={formatLength(shell.sideDoorWidth, unit)} onChange={num('sideDoorWidth')} />
          </div>
          <div className="field-row">
            <label>Side door height ({UNIT_LABEL[unit]})</label>
            <input type="number" step={25} value={formatLength(shell.sideDoorHeight, unit)} onChange={num('sideDoorHeight')} />
          </div>
          <div className="field-row">
            <label>Offset from front ({UNIT_LABEL[unit]})</label>
            <input type="number" step={25} value={formatLength(shell.sideDoorOffsetZ, unit)} onChange={num('sideDoorOffsetZ')} />
          </div>
          <div className="field-row">
            <label>Side</label>
            <select
              value={shell.sideDoorSide}
              onChange={(e) => setShell({ sideDoorSide: e.target.value as 'left' | 'right' })}
            >
              <option value="left">Left (driver)</option>
              <option value="right">Right (passenger)</option>
            </select>
          </div>

          <div className="hint">Roof layer — solar, Starlink, vents, roof A/C (its own layout plane)</div>
          <div className="field-row">
            <label>Roof equipment clearance ({UNIT_LABEL[unit]})</label>
            <input type="number" step={25} value={formatLength(shell.roofClearance, unit)} onChange={num('roofClearance')} />
          </div>

          <div className="hint">
            Underbody layer — tanks and other chassis-mounted gear (also auto-clears the front cab depth, a rough
            stand-in for the engine/transmission area)
          </div>
          <div className="field-row">
            <label>Underbody clearance ({UNIT_LABEL[unit]})</label>
            <input type="number" step={25} value={formatLength(shell.underbodyClearance, unit)} onChange={num('underbodyClearance')} />
          </div>

          <div className="hint">
            Rear wheel wells (both sides) — a floor build exclusion, same as the cab zone. Front wheel wells aren't
            modeled; they fall inside the cab zone, which is already off-limits. Defaults approximate a Ram
            ProMaster 159" EXT — true these up with a tape measure. Set width or height to 0 to disable.
          </div>
          <div className="field-row">
            <label>Intrusion from side wall ({UNIT_LABEL[unit]})</label>
            <input type="number" step={25} value={formatLength(shell.wheelWellWidth, unit)} onChange={num('wheelWellWidth')} />
          </div>
          <div className="field-row">
            <label>Height off floor ({UNIT_LABEL[unit]})</label>
            <input type="number" step={25} value={formatLength(shell.wheelWellHeight, unit)} onChange={num('wheelWellHeight')} />
          </div>
          <div className="field-row">
            <label>Length, front-to-back ({UNIT_LABEL[unit]})</label>
            <input type="number" step={25} value={formatLength(shell.wheelWellLength, unit)} onChange={num('wheelWellLength')} />
          </div>
          <div className="field-row">
            <label>Rear wheel well center, from front wall ({UNIT_LABEL[unit]})</label>
            <input type="number" step={25} value={formatLength(shell.rearWheelWellCenterZ, unit)} onChange={num('rearWheelWellCenterZ')} />
          </div>
        </>
      )}
    </div>
  );
}
