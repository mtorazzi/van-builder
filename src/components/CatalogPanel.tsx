import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { CATEGORIES, CATEGORY_COLORS } from '../types';
import { formatLength, parseLength, UNIT_LABEL } from '../lib/units';
import type { Category, InventoryStatus, MountSurface } from '../types';

const INVENTORY_STATUSES: InventoryStatus[] = ['proposed', 'ordered', 'owned', 'placed', 'superseded'];

const DEFAULT_DIMS_MM = { w: 300, d: 300, h: 300 }; // ~12" per side, metric

export default function CatalogPanel() {
  const defs = useStore((s) => s.defs);
  const addDef = useStore((s) => s.addDef);
  const updateDef = useStore((s) => s.updateDef);
  const removeDef = useStore((s) => s.removeDef);
  const addInstance = useStore((s) => s.addInstance);
  const instances = useStore((s) => s.instances);
  const selectedInstanceId = useStore((s) => s.selectedInstanceId);
  const openSheet = useStore((s) => s.setCatalogSheetOpen);
  const unit = useStore((s) => s.displayUnit);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    category: 'other' as Category,
    mountSurface: 'floor' as MountSurface,
    ...DEFAULT_DIMS_MM,
    overlapGroup: '',
  });
  const itemRefs = useRef(new Map<string, HTMLDivElement>());

  // Selecting an item in the 3D view (or the Placed Items list) jumps the
  // catalog to its component type, opens it for editing, and scrolls it
  // into view — so name/size/cost/etc are one click away from the 3D pick.
  useEffect(() => {
    if (!selectedInstanceId) return;
    const inst = instances.find((i) => i.id === selectedInstanceId);
    if (!inst) return;
    setEditingId(inst.defId);
    itemRefs.current.get(inst.defId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedInstanceId, instances]);

  function resetForm() {
    setForm({ name: '', category: 'other', mountSurface: 'floor', ...DEFAULT_DIMS_MM, overlapGroup: '' });
  }

  function handleCreate() {
    if (!form.name.trim()) return;
    addDef({
      name: form.name.trim(),
      category: form.category,
      mountSurface: form.mountSurface,
      dims: { w: form.w, d: form.d, h: form.h },
      overlapGroup: form.overlapGroup.trim() || undefined,
    });
    resetForm();
    setShowNewForm(false);
  }

  return (
    <div className="section">
      <div className="section-header-row">
        <h2>Component Catalog</h2>
        <button className="link-btn" title="Open every part as a sortable spreadsheet — pricing, dims, links, notes" onClick={() => openSheet(true)}>
          ⊞ Sheet view
        </button>
      </div>
      <div className="catalog-list">
        {defs.map((d) => {
          const usageCount = instances.filter((i) => i.defId === d.id).length;
          const editing = editingId === d.id;
          const pickedFrom3d = instances.find((i) => i.id === selectedInstanceId)?.defId === d.id;
          return (
            <div
              key={d.id}
              ref={(el) => {
                if (el) itemRefs.current.set(d.id, el);
                else itemRefs.current.delete(d.id);
              }}
            >
              <div className={`catalog-item ${editing ? 'selected' : ''} ${pickedFrom3d && !editing ? 'picked' : ''}`}>
                <span className="swatch" style={{ background: d.color ?? CATEGORY_COLORS[d.category] }} />
                <div className="catalog-item-main">
                  <div className="catalog-item-name-row">
                    <span className="name">{d.name}</span>
                    {d.mountSurface === 'roof' && <span className="roof-badge">roof</span>}
                    {d.mountSurface === 'underbody' && <span className="roof-badge underbody-badge">underbody</span>}
                    {d.mountSurface === 'door' && <span className="roof-badge">door</span>}
                    {d.mountSurface === 'ceiling' && <span className="roof-badge">ceiling</span>}
                    {d.mountSurface === 'wall' && <span className="roof-badge">wall</span>}
                    {d.inventoryStatus && d.inventoryStatus !== 'owned' && (
                      <span className={`roof-badge inv-${d.inventoryStatus}`}>{d.inventoryStatus}</span>
                    )}
                  </div>
                  <span className="dims">
                    {formatLength(d.dims.w, unit)}×{formatLength(d.dims.d, unit)}×{formatLength(d.dims.h, unit)}{' '}
                    {UNIT_LABEL[unit]}
                    {d.tags && d.tags.length > 0 && <span className="tags-hint"> · {d.tags.slice(0, 2).join(', ')}{d.tags.length > 2 ? '…' : ''}</span>}
                  </span>
                </div>
                <div className="catalog-item-actions">
                  <button className="icon-btn" title="Add to van" onClick={() => addInstance(d.id)}>
                    ＋
                  </button>
                  <button className="icon-btn" title="Edit" onClick={() => setEditingId(editing ? null : d.id)}>
                    ✎
                  </button>
                  <button
                    className="icon-btn"
                    title={usageCount > 0 ? `Delete (${usageCount} placed will be removed)` : 'Delete'}
                    onClick={() => {
                      const msg =
                        usageCount > 0
                          ? `Delete "${d.name}"? This will also remove ${usageCount} placed instance(s) from the van.`
                          : `Delete "${d.name}"?`;
                      if (confirm(msg)) removeDef(d.id);
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
              {editing && (
                <div className="add-form" style={{ padding: '6px 8px 10px 8px' }}>
                  <div className="field-row">
                    <label>Name</label>
                    <input
                      type="text"
                      value={d.name}
                      onChange={(e) => updateDef(d.id, { name: e.target.value })}
                    />
                  </div>
                  <div className="field-row">
                    <label>Category</label>
                    <select
                      value={d.category}
                      onChange={(e) => updateDef(d.id, { category: e.target.value as Category })}
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field-row">
                    <label>W × D × H ({UNIT_LABEL[unit]})</label>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input
                        type="number"
                        style={{ width: 46 }}
                        value={formatLength(d.dims.w, unit)}
                        onChange={(e) => updateDef(d.id, { dims: { ...d.dims, w: parseLength(e.target.value, unit) } })}
                      />
                      <input
                        type="number"
                        style={{ width: 46 }}
                        value={formatLength(d.dims.d, unit)}
                        onChange={(e) => updateDef(d.id, { dims: { ...d.dims, d: parseLength(e.target.value, unit) } })}
                      />
                      <input
                        type="number"
                        style={{ width: 46 }}
                        value={formatLength(d.dims.h, unit)}
                        onChange={(e) => updateDef(d.id, { dims: { ...d.dims, h: parseLength(e.target.value, unit) } })}
                      />
                    </div>
                  </div>
                  <div className="field-row">
                    <label>Mounts on</label>
                    <select
                      value={d.mountSurface ?? 'floor'}
                      onChange={(e) => updateDef(d.id, { mountSurface: e.target.value as MountSurface })}
                    >
                      <option value="floor">Floor / interior</option>
                      <option value="roof">Roof (own layout plane)</option>
                      <option value="underbody">Underbody (own layout plane)</option>
                      <option value="door">Rear door (swings open with the door)</option>
                      <option value="ceiling">Ceiling (hangs from above, hugs ceiling / bed underside)</option>
                      <option value="wall">Wall (side wall mount, flush against wall)</option>
                    </select>
                  </div>
                  <div className="field-row">
                    <label>Color</label>
                    <input
                      type="color"
                      value={d.color ?? CATEGORY_COLORS[d.category]}
                      onChange={(e) => updateDef(d.id, { color: e.target.value })}
                    />
                  </div>
                  <div className="field-row">
                    <label>Est. cost (USD)</label>
                    <input
                      type="number"
                      placeholder="unpriced"
                      value={d.estCost ?? ''}
                      onChange={(e) =>
                        updateDef(d.id, { estCost: e.target.value === '' ? undefined : parseFloat(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div className="field-row">
                    <label>URL</label>
                    <input
                      type="url"
                      placeholder="product / spec link"
                      value={d.url ?? ''}
                      onChange={(e) => updateDef(d.id, { url: e.target.value.trim() || undefined })}
                    />
                  </div>
                  <div className="field-row">
                    <label>Status</label>
                    <select
                      value={d.status ?? 'final'}
                      onChange={(e) => updateDef(d.id, { status: e.target.value as 'final' | 'placeholder' })}
                    >
                      <option value="final">Final</option>
                      <option value="placeholder">Placeholder</option>
                    </select>
                  </div>
                  <div className="field-row">
                    <label>Inventory</label>
                    <select
                      value={d.inventoryStatus ?? 'proposed'}
                      onChange={(e) => updateDef(d.id, { inventoryStatus: e.target.value as InventoryStatus })}
                    >
                      {INVENTORY_STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field-row">
                    <label>Tags</label>
                    <input
                      type="text"
                      placeholder="electrical, fait, capture…"
                      value={(d.tags ?? []).join(', ')}
                      onChange={(e) => updateDef(d.id, { tags: e.target.value ? e.target.value.split(',').map(t => t.trim()).filter(Boolean) : undefined })}
                    />
                  </div>
                  <div className="field-row">
                    <label>Vendor</label>
                    <input
                      type="text"
                      placeholder="Amazon, Home Depot…"
                      value={d.vendor ?? ''}
                      onChange={(e) => updateDef(d.id, { vendor: e.target.value || undefined })}
                    />
                  </div>
                  <div className="field-row">
                    <label>Order URL</label>
                    <input
                      type="url"
                      placeholder="order receipt/tracking link"
                      value={d.orderUrl ?? ''}
                      onChange={(e) => updateDef(d.id, { orderUrl: e.target.value.trim() || undefined })}
                    />
                  </div>
                  <div className="field-row">
                    <label>Order date</label>
                    <input
                      type="date"
                      value={d.orderDate ?? ''}
                      onChange={(e) => updateDef(d.id, { orderDate: e.target.value || undefined })}
                    />
                  </div>
                  <div className="field-row">
                    <label>Overlap group</label>
                    <input
                      type="text"
                      placeholder="e.g. sink-option"
                      value={d.overlapGroup ?? ''}
                      onChange={(e) => updateDef(d.id, { overlapGroup: e.target.value || undefined })}
                    />
                  </div>
                  <div className="field-row" style={{ alignItems: 'flex-start' }}>
                    <label>Notes</label>
                    <textarea
                      rows={3}
                      style={{
                        flex: 1,
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                        borderRadius: 5,
                        padding: '4px 6px',
                        fontSize: 12.5,
                        fontFamily: 'inherit',
                        resize: 'vertical',
                      }}
                      value={d.notes ?? ''}
                      onChange={(e) => updateDef(d.id, { notes: e.target.value || undefined })}
                    />
                  </div>
                  <div className="hint">
                    Components sharing an overlap group (e.g. alternate sink options) are always allowed to overlap
                    each other, regardless of category rules.
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showNewForm ? (
        <div className="add-form" style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          <div className="field-row">
            <label>Name</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field-row">
            <label>Category</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as Category })}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="field-row">
            <label>W × D × H ({UNIT_LABEL[unit]})</label>
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                type="number"
                style={{ width: 46 }}
                value={formatLength(form.w, unit)}
                onChange={(e) => setForm({ ...form, w: parseLength(e.target.value, unit) })}
              />
              <input
                type="number"
                style={{ width: 46 }}
                value={formatLength(form.d, unit)}
                onChange={(e) => setForm({ ...form, d: parseLength(e.target.value, unit) })}
              />
              <input
                type="number"
                style={{ width: 46 }}
                value={formatLength(form.h, unit)}
                onChange={(e) => setForm({ ...form, h: parseLength(e.target.value, unit) })}
              />
            </div>
          </div>
          <div className="field-row">
            <label>Mounts on</label>
            <select
              value={form.mountSurface}
              onChange={(e) => setForm({ ...form, mountSurface: e.target.value as MountSurface })}
            >
              <option value="floor">Floor / interior</option>
              <option value="roof">Roof (own layout plane)</option>
              <option value="underbody">Underbody (own layout plane)</option>
              <option value="door">Rear door (swings open with the door)</option>
              <option value="ceiling">Ceiling (hangs from above, hugs ceiling / bed underside)</option>
              <option value="wall">Wall (side wall mount, flush against wall)</option>
            </select>
          </div>
          <div className="field-row">
            <label>Overlap group</label>
            <input
              type="text"
              placeholder="optional"
              value={form.overlapGroup}
              onChange={(e) => setForm({ ...form, overlapGroup: e.target.value })}
            />
          </div>
          <div className="button-row">
            <button className="primary" onClick={handleCreate}>
              Create
            </button>
            <button
              onClick={() => {
                setShowNewForm(false);
                resetForm();
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button style={{ marginTop: 10, width: '100%' }} onClick={() => setShowNewForm(true)}>
          + New component type
        </button>
      )}
    </div>
  );
}
