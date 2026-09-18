import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { CATEGORIES, CATEGORY_COLORS } from '../types';
import { formatLength, UNIT_LABEL } from '../lib/units';
import type { Category, ComponentDef, InventoryStatus, MountSurface } from '../types';

const INVENTORY_STATUSES: InventoryStatus[] = ['proposed', 'ordered', 'owned', 'placed', 'superseded'];

/** Full-screen spreadsheet view of the component catalog — the same defs the
 * left-hand Catalog panel lists, but laid out as a sortable/filterable table
 * with every field visible at once: dims, unit cost, placed qty, line total,
 * status, product URL, overlap group, notes. Cost / status / URL are editable
 * inline; everything writes straight to the store (and so to the bridge file
 * + MCP server) like the panel's edit form does. Open it from the Catalog
 * panel header, the top bar, or by loading the app with ?catalog. */

type SortKey =
  | 'name'
  | 'category'
  | 'mount'
  | 'w'
  | 'd'
  | 'h'
  | 'cost'
  | 'qty'
  | 'total'
  | 'status'
  | 'url'
  | 'overlapGroup';

const URL_RE = /https?:\/\/[^\s)>\]"']+/g;

/** Any http(s) links sitting in free-text notes — the fallback for defs
 * that predate the dedicated `url` field. */
function linksInNotes(notes: string | undefined): string[] {
  if (!notes) return [];
  const found = notes.match(URL_RE) ?? [];
  return Array.from(new Set(found.map((u) => u.replace(/[.,;:]+$/, ''))));
}

function shortUrl(u: string): string {
  try {
    const { hostname, pathname } = new URL(u);
    const host = hostname.replace(/^www\./, '');
    const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : '';
    const s = host + path;
    return s.length > 42 ? s.slice(0, 40) + '…' : s;
  } catch {
    return u.length > 42 ? u.slice(0, 40) + '…' : u;
  }
}

function fmtMoney(n: number | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function CatalogSheetView() {
  const defs = useStore((s) => s.defs);
  const instances = useStore((s) => s.instances);
  const updateDef = useStore((s) => s.updateDef);
  const addInstance = useStore((s) => s.addInstance);
  const close = useStore((s) => s.setCatalogSheetOpen);
  const shellName = useStore((s) => s.shell.name);
  const unit = useStore((s) => s.displayUnit);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [mount, setMount] = useState<MountSurface | 'all'>('all');
  const [status, setStatus] = useState<'all' | 'final' | 'placeholder' | 'unpriced'>('all');
  const [placedOnly, setPlacedOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('category');
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const qtyByDef = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of instances) m.set(i.defId, (m.get(i.defId) ?? 0) + 1);
    return m;
  }, [instances]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = defs.filter((d) => {
      if (category !== 'all' && d.category !== category) return false;
      if (mount !== 'all' && (d.mountSurface ?? 'floor') !== mount) return false;
      if (status === 'final' && (d.status ?? 'final') !== 'final') return false;
      if (status === 'placeholder' && (d.status ?? 'final') !== 'placeholder') return false;
      if (status === 'unpriced' && d.estCost != null) return false;
      if (placedOnly && !(qtyByDef.get(d.id) ?? 0)) return false;
      if (q) {
        const hay = `${d.name} ${d.category} ${d.notes ?? ''} ${d.url ?? ''} ${d.overlapGroup ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const val = (d: ComponentDef): string | number => {
      const qty = qtyByDef.get(d.id) ?? 0;
      switch (sortKey) {
        case 'name': return d.name.toLowerCase();
        case 'category': return d.category;
        case 'mount': return d.mountSurface ?? 'floor';
        case 'w': return d.dims.w;
        case 'd': return d.dims.d;
        case 'h': return d.dims.h;
        case 'cost': return d.estCost ?? -1;
        case 'qty': return qty;
        case 'total': return d.estCost != null ? d.estCost * qty : -1;
        case 'status': return d.status ?? 'final';
        case 'url': return (d.url ?? linksInNotes(d.notes)[0] ?? '').toLowerCase();
        case 'overlapGroup': return d.overlapGroup ?? '';
      }
    };
    return [...filtered].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      let c = 0;
      if (typeof va === 'number' && typeof vb === 'number') c = va - vb;
      else c = String(va).localeCompare(String(vb));
      if (c === 0 && sortKey !== 'name') c = a.name.localeCompare(b.name);
      return c * sortDir;
    });
  }, [defs, qtyByDef, query, category, mount, status, placedOnly, sortKey, sortDir]);

  const totals = useMemo(() => {
    let unitSum = 0;
    let placedSum = 0;
    let unpriced = 0;
    let placedUnpriced = 0;
    let placedCount = 0;
    for (const d of rows) {
      const qty = qtyByDef.get(d.id) ?? 0;
      placedCount += qty;
      if (d.estCost == null) {
        unpriced++;
        if (qty > 0) placedUnpriced++;
      } else {
        unitSum += d.estCost;
        placedSum += d.estCost * qty;
      }
    }
    return { unitSum, placedSum, unpriced, placedUnpriced, placedCount };
  }, [rows, qtyByDef]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(k);
      setSortDir(1);
    }
  }

  function exportCsv() {
    const header = ['Category', 'Item', 'Mount', 'W', 'D', 'H', 'Unit cost', 'Qty placed', 'Line total', 'Status', 'URL', 'Links in notes', 'Overlap group', 'Notes'];
    const lines = [header.map(csvCell).join(',')];
    for (const d of rows) {
      const qty = qtyByDef.get(d.id) ?? 0;
      lines.push(
        [
          d.category,
          d.name,
          d.mountSurface ?? 'floor',
          d.dims.w,
          d.dims.d,
          d.dims.h,
          d.estCost ?? '',
          qty,
          d.estCost != null ? d.estCost * qty : '',
          d.status ?? 'final',
          d.url ?? '',
          linksInNotes(d.notes).join(' '),
          d.overlapGroup ?? '',
          d.notes ?? '',
        ]
          .map(csvCell)
          .join(','),
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(shellName || 'van').replace(/[^a-z0-9-_]+/gi, '_')}-catalog.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const Th = ({ k, label, num }: { k: SortKey; label: string; num?: boolean }) => (
    <th className={`${num ? 'num' : ''} ${sortKey === k ? 'sorted' : ''}`} onClick={() => toggleSort(k)}>
      {label}
      {sortKey === k && <span className="sort-arrow">{sortDir === 1 ? '▲' : '▼'}</span>}
    </th>
  );

  return (
    <div className="sheet-overlay" role="dialog" aria-label="Component catalog sheet">
      <div className="sheet-toolbar">
        <h2>Component Catalog — Sheet</h2>
        <span className="hint" style={{ margin: 0 }}>
          {rows.length} of {defs.length} parts · {totals.placedCount} placed
        </span>
        <div className="spacer" />
        <input
          type="search"
          className="sheet-search"
          placeholder="Filter name / notes / URL…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <select value={category} onChange={(e) => setCategory(e.target.value as Category | 'all')}>
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={mount} onChange={(e) => setMount(e.target.value as MountSurface | 'all')}>
          <option value="all">All planes</option>
          <option value="floor">floor</option>
          <option value="ceiling">ceiling</option>
          <option value="roof">roof</option>
          <option value="underbody">underbody</option>
          <option value="door">door</option>
          <option value="wall">wall</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="all">Any status</option>
          <option value="final">final</option>
          <option value="placeholder">placeholder</option>
          <option value="unpriced">unpriced</option>
        </select>
        <label className="hint" style={{ display: 'flex', alignItems: 'center', gap: 4, margin: 0 }}>
          <input type="checkbox" checked={placedOnly} onChange={(e) => setPlacedOnly(e.target.checked)} />
          Placed only
        </label>
        <button onClick={exportCsv}>Export CSV</button>
        <a className="sheet-newtab" href="?catalog" target="_blank" rel="noopener" title="Open this sheet in its own tab">
          Open in new tab ↗
        </a>
        <button onClick={() => close(false)} title="Close (Esc)">
          ✕ Close
        </button>
      </div>

      <div className="sheet-scroll">
        <table className="sheet-table">
          <thead>
            <tr>
              <Th k="name" label="Item" />
              <Th k="category" label="Category" />
              <Th k="mount" label="Plane" />
              <Th k="w" label={`W (${UNIT_LABEL[unit]})`} num />
              <Th k="d" label={`D (${UNIT_LABEL[unit]})`} num />
              <Th k="h" label={`H (${UNIT_LABEL[unit]})`} num />
              <Th k="cost" label="Unit cost" num />
              <Th k="qty" label="Qty" num />
              <Th k="total" label="Line total" num />
              <Th k="status" label="Status" />
              <Th k="url" label="URL" />
              <Th k="overlapGroup" label="Overlap grp" />
              <th>Notes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const qty = qtyByDef.get(d.id) ?? 0;
              const noteLinks = d.url ? linksInNotes(d.notes).filter((u) => u !== d.url) : linksInNotes(d.notes);
              const isOpen = expanded.has(d.id);
              const notes = d.notes ?? '';
              const long = notes.length > 140;
              return (
                <tr key={d.id} className={(d.status ?? 'final') === 'placeholder' ? 'placeholder-row' : ''}>
                  <td className="cell-name">
                    <span className="swatch" style={{ background: d.color ?? CATEGORY_COLORS[d.category] }} />
                    {d.name}
                  </td>
                  <td>{d.category}</td>
                  <td>{d.mountSurface ?? 'floor'}</td>
                  <td className="num">{formatLength(d.dims.w, unit)}</td>
                  <td className="num">{formatLength(d.dims.d, unit)}</td>
                  <td className="num">{formatLength(d.dims.h, unit)}</td>
                  <td className="num">
                    <input
                      type="number"
                      className="cell-input num"
                      placeholder="—"
                      value={d.estCost ?? ''}
                      onChange={(e) =>
                        updateDef(d.id, { estCost: e.target.value === '' ? undefined : parseFloat(e.target.value) || 0 })
                      }
                    />
                  </td>
                  <td className="num">{qty}</td>
                  <td className="num">{d.estCost != null && qty > 0 ? fmtMoney(d.estCost * qty) : '—'}</td>
                  <td>
                    <select
                      className="cell-input"
                      value={d.status ?? 'final'}
                      onChange={(e) => updateDef(d.id, { status: e.target.value as 'final' | 'placeholder' })}
                    >
                      <option value="final">final</option>
                      <option value="placeholder">placeholder</option>
                    </select>
                  </td>
                  <td className="cell-url">
                    <input
                      type="url"
                      className="cell-input"
                      placeholder="paste product link"
                      value={d.url ?? ''}
                      onChange={(e) => updateDef(d.id, { url: e.target.value.trim() || undefined })}
                    />
                    <div className="cell-links">
                      {d.url && (
                        <a href={d.url} target="_blank" rel="noopener noreferrer" title={d.url}>
                          {shortUrl(d.url)} ↗
                        </a>
                      )}
                      {noteLinks.map((u) => (
                        <a key={u} href={u} target="_blank" rel="noopener noreferrer" title={`from notes: ${u}`} className="from-notes">
                          {shortUrl(u)} ↗
                        </a>
                      ))}
                    </div>
                  </td>
                  <td>{d.overlapGroup ?? ''}</td>
                  <td className={`cell-notes ${isOpen ? 'open' : ''}`}>
                    {long && !isOpen ? notes.slice(0, 140) + '…' : notes}
                    {long && (
                      <button
                        className="link-btn"
                        onClick={() =>
                          setExpanded((s) => {
                            const n = new Set(s);
                            if (n.has(d.id)) n.delete(d.id);
                            else n.add(d.id);
                            return n;
                          })
                        }
                      >
                        {isOpen ? 'less' : 'more'}
                      </button>
                    )}
                  </td>
                  <td>
                    <button className="icon-btn" title="Add to van" onClick={() => addInstance(d.id)}>
                      ＋
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6}>
                Totals ({rows.length} parts shown){totals.unpriced > 0 && ` · ${totals.unpriced} unpriced`}
              </td>
              <td className="num" title="Sum of unit cost, one of each part shown">
                {fmtMoney(totals.unitSum)}
              </td>
              <td className="num">{totals.placedCount}</td>
              <td className="num" title="Sum of unit cost × placed qty">
                {fmtMoney(totals.placedSum)}
                {totals.placedUnpriced > 0 && <span className="hint" style={{ margin: 0 }}> +{totals.placedUnpriced} unpriced</span>}
              </td>
              <td colSpan={5} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
