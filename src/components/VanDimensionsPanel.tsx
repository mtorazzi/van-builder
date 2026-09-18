import { useStore } from '../store';
import { computeEnvelope } from '../geometry';
import type { VanShell } from '../types';

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
  const env = computeEnvelope(shell);

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
          <label>{f.label} (in)</label>
          <input
            type="number"
            step={f.step ?? 1}
            value={shell[f.key] as number}
            onChange={(e) => setShell({ [f.key]: parseFloat(e.target.value) || 0 } as Partial<VanShell>)}
          />
        </div>
      ))}
      <div className="hint">
        Buildable envelope: {env.width.toFixed(1)}"W × {env.length.toFixed(1)}"L × {env.height.toFixed(1)}"H
        <br />
        (raw shell minus wall framing + insulation + floor/ceiling build-up)
      </div>
    </div>
  );
}
