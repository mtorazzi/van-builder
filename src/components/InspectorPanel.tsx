import { useCallback, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useStore, GRID_SNAP } from '../store';
import { CATEGORY_COLORS, PORT_COLORS } from '../types';
import { formatLength, parseLength, UNIT_LABEL } from '../lib/units';

const HOLD_DELAY_MS = 400;
const HOLD_REPEAT_MS = 120;

/** Press-and-hold-to-repeat for the D-pad/Up/Down buttons: fires `onStep`
 * once immediately on press, then keeps firing on an interval while held,
 * so a long press walks the item across the room instead of needing one
 * click per 5 mm step. Falls back to a plain onClick for keyboard
 * activation (Enter/Space don't emit pointer events), guarded so a real
 * pointer click doesn't double-fire. */
function useHoldRepeat(onStep: () => void) {
  const timeoutRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);
  const firedByPointerRef = useRef(false);

  const clear = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return; // primary button/touch only
      firedByPointerRef.current = true;
      onStep();
      clear();
      timeoutRef.current = window.setTimeout(() => {
        intervalRef.current = window.setInterval(onStep, HOLD_REPEAT_MS);
      }, HOLD_DELAY_MS);
    },
    [onStep, clear]
  );

  const onClick = useCallback(() => {
    if (firedByPointerRef.current) {
      firedByPointerRef.current = false;
      return;
    }
    onStep();
  }, [onStep]);

  return { onPointerDown, onPointerUp: clear, onPointerLeave: clear, onPointerCancel: clear, onClick };
}

export default function InspectorPanel() {
  const instances = useStore((s) => s.instances);
  const defsById = useStore((s) => s.defsById());
  const selectedId = useStore((s) => s.selectedInstanceId);
  const selectInstance = useStore((s) => s.selectInstance);
  const updateInstance = useStore((s) => s.updateInstance);
  const moveInstance = useStore((s) => s.moveInstance);
  const removeInstance = useStore((s) => s.removeInstance);
  const duplicateInstance = useStore((s) => s.duplicateInstance);
  const resolveInstance = useStore((s) => s.resolveInstance);
  const violations = useStore((s) => s.violations());
  const clearances = useStore((s) => (selectedId ? s.clearances(selectedId) : null));
  const showClearances = useStore((s) => s.showClearances);
  const toggleClearances = useStore((s) => s.toggleClearances);
  const doorsOpen = useStore((s) => s.doorsOpen);
  const unit = useStore((s) => s.displayUnit);

  const selected = instances.find((i) => i.id === selectedId) ?? null;
  const def = selected ? defsById[selected.defId] : null;
  const selectedViolations = selected ? violations.filter((v) => v.instanceIds.includes(selected.id)) : [];
  const isDoorMount = def?.mountSurface === 'door';
  const isCeilingMount = def?.mountSurface === 'ceiling';

  // Called unconditionally (Rules of Hooks) — each no-ops if nothing's selected.
  const fwdHold = useHoldRepeat(() => selected && moveInstance(selected.id, { z: -GRID_SNAP }));
  const backHold = useHoldRepeat(() => selected && moveInstance(selected.id, { z: GRID_SNAP }));
  const leftHold = useHoldRepeat(() => selected && moveInstance(selected.id, { x: -GRID_SNAP }));
  const rightHold = useHoldRepeat(() => selected && moveInstance(selected.id, { x: GRID_SNAP }));
  const upHold = useHoldRepeat(() => selected && moveInstance(selected.id, { y: GRID_SNAP }));
  const downHold = useHoldRepeat(() => selected && moveInstance(selected.id, { y: -GRID_SNAP }));

  function handleResolve() {
    if (!selected) return;
    const ok = resolveInstance(selected.id);
    if (!ok) alert('No conflict-free spot found nearby — try moving it manually or freeing up space first.');
  }

  return (
    <>
      <div className="section">
        <h2>Selected Item</h2>
        {!selected || !def ? (
          <div className="empty-state">Click an item in the 3D view, or add one from the catalog.</div>
        ) : (
          <>
            <div className="field-row">
              <label>Type</label>
              <span style={{ fontSize: 12.5 }}>{def.name}</span>
            </div>
            <div className="field-row">
              <label>Label</label>
              <input
                type="text"
                placeholder={def.name}
                value={selected.label ?? ''}
                onChange={(e) => updateInstance(selected.id, { label: e.target.value || undefined })}
              />
            </div>

            {isDoorMount && (
              <div className="field-row">
                <label>Door panel</label>
                <select
                  value={selected.doorId ?? 'rear-left'}
                  onChange={(e) => updateInstance(selected.id, { doorId: e.target.value as 'rear-left' | 'rear-right' })}
                >
                  <option value="rear-left">Left rear door</option>
                  <option value="rear-right">Right rear door</option>
                </select>
              </div>
            )}

            <div className="hint">
              {isDoorMount
                ? `Position (${UNIT_LABEL[unit]}) — X: side-to-side on the door, Y: height on the door. Z is locked flush against the door — it can't be moved away from touching it.`
                : isCeilingMount
                  ? `Position (${UNIT_LABEL[unit]}) — X: width, Z: length. Y is derived: the top always hugs the ceiling, or the underside of whatever interior item is directly above it (e.g. the bed) — and follows it if that moves.`
                  : `Position (${UNIT_LABEL[unit]}) — X: width, Y: height off floor, Z: length`}
            </div>
            <div className="field-row">
              <label>X</label>
              <input
                type="number"
                value={formatLength(selected.pos.x, unit)}
                onChange={(e) =>
                  updateInstance(selected.id, { pos: { ...selected.pos, x: parseLength(e.target.value, unit) } })
                }
              />
            </div>
            <div className="field-row">
              <label>Y</label>
              <input
                type="number"
                value={formatLength(selected.pos.y, unit)}
                onChange={(e) =>
                  updateInstance(selected.id, { pos: { ...selected.pos, y: parseLength(e.target.value, unit) } })
                }
              />
            </div>
            <div className="field-row">
              <label>Z</label>
              <input
                type="number"
                value={formatLength(selected.pos.z, unit)}
                disabled={isDoorMount}
                title={isDoorMount ? 'Locked — exterior-mounted items stay flush against the door' : undefined}
                onChange={(e) =>
                  updateInstance(selected.id, { pos: { ...selected.pos, z: parseLength(e.target.value, unit) } })
                }
              />
            </div>
            {def.ports && def.ports.length > 0 && (
              <>
                <div className="hint">Ports (marked in the 3D view)</div>
                <div className="instance-list" style={{ marginBottom: 8 }}>
                  {def.ports.map((port, i) => (
                    <div key={i} className="catalog-item" style={{ cursor: 'default' }}>
                      <span className="swatch" style={{ background: PORT_COLORS[port.kind] }} />
                      <span className="name">{port.label ?? port.kind}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {isDoorMount && doorsOpen.rear && (
              <div className="hint" style={{ color: '#ffd166' }}>
                ⚠ Rear doors are open — drag-to-move in the 3D view is disabled while open (the X/Y fields above
                still work). Close the doors from the Van Features panel to drag it directly.
              </div>
            )}

            <div className="hint">Move (± {GRID_SNAP} mm per step / hold) — floor plane, and height</div>
            <div className="dpad-row">
              <div className="dpad">
                <button className="dpad-btn dpad-fwd" title="Forward (hold to keep moving)" {...fwdHold}>
                  ▲
                </button>
                <button className="dpad-btn dpad-left" title="Left (hold to keep moving)" {...leftHold}>
                  ◀
                </button>
                <button className="dpad-btn dpad-right" title="Right (hold to keep moving)" {...rightHold}>
                  ▶
                </button>
                <button className="dpad-btn dpad-back" title="Back (hold to keep moving)" {...backHold}>
                  ▼
                </button>
              </div>
              <div className="vpad">
                <button title="Up (hold to keep moving)" {...upHold}>
                  ⤒ Up
                </button>
                <button title="Down (hold to keep moving)" {...downHold}>
                  ⤓ Down
                </button>
              </div>
            </div>

            {selectedViolations.length > 0 && (
              <div className="hint" style={{ color: '#ffb703' }}>
                ⚠ {selectedViolations.length} conflict{selectedViolations.length === 1 ? '' : 's'} on this item
              </div>
            )}
            <button
              className={selectedViolations.length > 0 ? 'danger' : ''}
              style={{ width: '100%', marginBottom: 8 }}
              onClick={handleResolve}
            >
              📍 Snap to nearest safe spot
            </button>

            <div className="hint" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Clearance to nearest obstacle ({UNIT_LABEL[unit]})</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <input type="checkbox" checked={showClearances} onChange={toggleClearances} />
                show in 3D
              </label>
            </div>
            {clearances && (
              <div className="clearance-grid">
                <div className="clearance-cell" style={{ gridArea: 'fwd' }}>
                  <span className="clearance-label">Fwd</span>
                  <span className="clearance-value">{formatLength(clearances.forward, unit)} {UNIT_LABEL[unit]}</span>
                </div>
                <div className="clearance-cell" style={{ gridArea: 'left' }}>
                  <span className="clearance-label">Left</span>
                  <span className="clearance-value">{formatLength(clearances.left, unit)} {UNIT_LABEL[unit]}</span>
                </div>
                <div className="clearance-cell" style={{ gridArea: 'right' }}>
                  <span className="clearance-label">Right</span>
                  <span className="clearance-value">{formatLength(clearances.right, unit)} {UNIT_LABEL[unit]}</span>
                </div>
                <div className="clearance-cell" style={{ gridArea: 'back' }}>
                  <span className="clearance-label">Back</span>
                  <span className="clearance-value">{formatLength(clearances.back, unit)} {UNIT_LABEL[unit]}</span>
                </div>
                <div className="clearance-cell" style={{ gridArea: 'up' }}>
                  <span className="clearance-label">Up</span>
                  <span className="clearance-value">{formatLength(clearances.up, unit)} {UNIT_LABEL[unit]}</span>
                </div>
                <div className="clearance-cell" style={{ gridArea: 'down' }}>
                  <span className="clearance-label">Down</span>
                  <span className="clearance-value">{formatLength(clearances.down, unit)} {UNIT_LABEL[unit]}</span>
                </div>
              </div>
            )}

            <div className="field-row" style={{ marginTop: 10 }}>
              <label>Rotation</label>
              <div className="button-row">
                <button
                  onClick={() =>
                    updateInstance(selected.id, { rotationY: (((selected.rotationY - 90) % 360) + 360) % 360 as any })
                  }
                >
                  ⟲ 90°
                </button>
                <button
                  onClick={() => updateInstance(selected.id, { rotationY: ((selected.rotationY + 90) % 360) as any })}
                >
                  ⟳ 90°
                </button>
              </div>
            </div>

            <div className="field-row">
              <label>Locked</label>
              <input
                type="checkbox"
                checked={!!selected.locked}
                onChange={(e) => updateInstance(selected.id, { locked: e.target.checked })}
              />
            </div>

            <div className="button-row" style={{ marginTop: 8 }}>
              <button onClick={() => duplicateInstance(selected.id)}>Duplicate</button>
              <button className="danger" onClick={() => removeInstance(selected.id)}>
                Delete
              </button>
            </div>
          </>
        )}
      </div>

      <div className="section">
        <h2>Placed Items ({instances.length})</h2>
        <div className="instance-list">
          {instances.length === 0 && <div className="empty-state">Nothing placed yet.</div>}
          {instances.map((inst) => {
            const d = defsById[inst.defId];
            if (!d) return null;
            return (
              <div
                key={inst.id}
                className={`catalog-item ${inst.id === selectedId ? 'selected' : ''}`}
                onClick={() => selectInstance(inst.id)}
              >
                <span className="swatch" style={{ background: d.color ?? CATEGORY_COLORS[d.category] }} />
                <span className="name">{inst.label || d.name}</span>
                {inst.locked && <span title="Locked">🔒</span>}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
