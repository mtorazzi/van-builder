import { useStore } from '../store';
import { computeEnvelope } from '../geometry';
import type { VanShell } from '../types';
import { formatLength, parseLength, UNIT_LABEL } from '../lib/units';

const FIELDS: { key: keyof VanShell; label: string; step?: number }[] = [
  { key: 'interiorLength', label: 'Interior length (front-back)', step: 25 },
  { key: 'interiorWidth', label: 'Interior width (wall-wall)', step: 25 },
  { key: 'interiorHeight', label: 'Interior height (floor-ceiling)', step: 25 },
  { key: 'wallFramingThickness', label: 'Wall scaffold/framing', step: 5 },
  { key: 'insulationThickness', label: 'Insulation thickness', step: 5 },
  { key: 'ceilingFramingThickness', label: 'Ceiling framing + insulation', step: 5 },
  { key: 'floorBuildUpThickness', label: 'Floor build-up', step: 5 },
];

export default function VanDimensionsPanel() {
  const shell = useStore((s) => s.shell);
  const setShell = useStore((s) => s.setShell);
  const unit = useStore((s) => s.displayUnit);
  const env = computeEnvelope(shell);

  // Input values are stored in millimeters internally; they are shown (and
  // typed) in the active display unit.
  function num(key: keyof VanShell) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setShell({ [key]: parseLength(e.target.value, unit) } as Partial<VanShell>);
  }

  return (
    <div className="section">
      <h2>Van Shell</h2>
      <div className="field-row">
        <label>Name</label>
        <input
          type="text"
          value={shell.name}
          style={{ width: 150 }}
          onChange={(e) => setShell({ name: e.target.value })}
        />
      </div>
      {FIELDS.map((f) => (
        <div className="field-row" key={f.key}>
          <label>{f.label} ({UNIT_LABEL[unit]})</label>
          <input
            type="number"
            step={f.step}
            value={formatLength(shell[f.key] as number, unit)}
            onChange={num(f.key)}
          />
        </div>
      ))}
      <div className="hint">
        Buildable envelope: {formatLength(env.width, unit)} × {formatLength(env.length, unit)} ×{' '}
        {formatLength(env.height, unit)} {UNIT_LABEL[unit]} (W × L × H)
        <br />
        (raw shell minus wall framing + insulation + floor/ceiling build-up)
      </div>
    </div>
  );
}
