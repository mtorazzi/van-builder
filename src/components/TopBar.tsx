import { useRef } from 'react';
import { useStore } from '../store';
import { DISPLAY_UNITS, UNIT_LABEL, type DisplayUnit } from '../lib/units';
import type { ProjectState } from '../types';

export default function TopBar() {
  const shellName = useStore((s) => s.shell.name);
  const exportProject = useStore((s) => s.exportProject);
  const importProject = useStore((s) => s.importProject);
  const resetToDefaults = useStore((s) => s.resetToDefaults);
  const showLabels = useStore((s) => s.showLabels);
  const toggleLabels = useStore((s) => s.toggleLabels);
  const openSheet = useStore((s) => s.setCatalogSheetOpen);
  const violations = useStore((s) => s.violations());
  const displayUnit = useStore((s) => s.displayUnit);
  const setDisplayUnit = useStore((s) => s.setDisplayUnit);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleExport() {
    const data = exportProject();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = (shellName || 'van').replace(/[^a-z0-9-_]+/gi, '_');
    a.download = `${safeName}-layout.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as ProjectState;
        importProject(data);
      } catch {
        alert('Could not read that file — is it a Van Builder project JSON export?');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  return (
    <div className="topbar">
      <h1>🚐 Van Builder</h1>
      <span className="hint" style={{ marginBottom: 0 }}>
        {shellName}
      </span>
      <div className="spacer" />
      <span className={`violations-badge ${violations.length === 0 ? 'ok' : ''}`}>
        {violations.length === 0 ? 'No conflicts' : `${violations.length} conflict${violations.length === 1 ? '' : 's'}`}
      </span>
      <label className="hint" style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 0 }}>
        Units
        <select
          value={displayUnit}
          onChange={(e) => setDisplayUnit(e.target.value as DisplayUnit)}
          title="Display unit for all length values — internal data is always millimeters"
          style={{ width: 66 }}
        >
          {DISPLAY_UNITS.map((u) => (
            <option key={u} value={u}>
              {UNIT_LABEL[u] === '"' ? 'inch ("' : UNIT_LABEL[u] === 'cm' ? 'cm' : 'mm'}
            </option>
          ))}
        </select>
      </label>
      <label className="hint" style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 0 }}>
        <input type="checkbox" checked={showLabels} onChange={toggleLabels} />
        Labels
      </label>
      <button onClick={() => openSheet(true)} title="Catalog as a spreadsheet — pricing, dims, links, notes">
        ⊞ Catalog sheet
      </button>
      <button onClick={handleExport}>Export JSON</button>
      <button onClick={handleImportClick}>Import JSON</button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      <button
        className="danger"
        onClick={() => {
          if (confirm('Reset the entire project to the default van shell and starter catalog? This clears your layout.')) {
            resetToDefaults();
          }
        }}
      >
        Reset
      </button>
    </div>
  );
}
