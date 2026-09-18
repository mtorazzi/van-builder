// Shared MCP server setup — tool registration independent of transport.
// Both stdio (index.ts) and HTTP (http.ts) import this to get the same
// configured McpServer instance with all tools registered.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ComponentDef, PlacedInstance, ProjectState, Vec3, Category } from '../src/types.js';
import { CATEGORIES } from '../src/types.js';
import * as ops from '../src/projectOps.js';
import { readProject, writeProject, saveVariant, loadVariant, listVariants } from './projectFile.js';

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function fail(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function describeInstance(project: ProjectState, inst: PlacedInstance) {
  const def = project.defs.find((d) => d.id === inst.defId);
  return {
    id: inst.id,
    defId: inst.defId,
    componentName: def?.name ?? '(unknown component)',
    mountSurface: def?.mountSurface ?? 'floor',
    label: inst.label,
    pos: inst.pos,
    rotationY: inst.rotationY,
    locked: inst.locked ?? false,
    doorId: def?.mountSurface === 'door' ? inst.doorId ?? 'rear-left' : undefined,
    wallSide: def?.mountSurface === 'wall' ? inst.wallSide ?? 'left' : undefined,
  };
}

function violationsFor(project: ProjectState, instanceId?: string) {
  const all = ops.getViolations(project);
  return instanceId ? all.filter((v) => v.instanceIds.includes(instanceId)) : all;
}

function inferInventoryStatus(def: ComponentDef, placedCount: number): string {
  if (def.inventoryStatus) return def.inventoryStatus;
  if ((def.status ?? 'final') === 'placeholder') return 'proposed';
  if (placedCount > 0) return 'owned';
  return 'proposed';
}

function describeDef(project: ProjectState, def: ComponentDef) {
  const placedCount = project.instances.filter((i) => i.defId === def.id).length;
  return {
    id: def.id,
    name: def.name,
    category: def.category,
    mountSurface: def.mountSurface ?? 'floor',
    dims: def.dims,
    overlapGroup: def.overlapGroup,
    estCost: def.estCost,
    status: def.status ?? 'final',
    notes: def.notes,
    url: def.url,
    wheelWellCutout: def.wheelWellCutout,
    ports: def.ports,
    placedCount,
    inventoryStatus: inferInventoryStatus(def, placedCount),
    orderUrl: def.orderUrl,
    orderDate: def.orderDate,
    vendor: def.vendor,
    tags: def.tags ?? [],
  };
}

// ---------------------------------------------------------------------------
// Checklist parsing (same as original)
// ---------------------------------------------------------------------------

interface ChecklistRow {
  category: string;
  item: string;
  qty: number;
  w: number | null;
  d: number | null;
  h: number | null;
  mountSurface: string | null;
  cost: number | null;
  status: string | null;
  inventoryStatus: string | null;
  tags: string;
  vendor: string;
  orderUrl: string;
  orderDate: string;
  notes: string;
  url: string;
}

const HEADER_ALIASES: Record<string, keyof ChecklistRow | 'skip'> = {
  category: 'category',
  item: 'item', name: 'item',
  qty: 'qty', quantity: 'qty',
  w: 'w', width: 'w',
  d: 'd', depth: 'd', length: 'd',
  h: 'h', height: 'h',
  mountsurface: 'mountSurface', mount: 'mountSurface', surface: 'mountSurface',
  cost: 'cost', price: 'cost', estcost: 'cost',
  status: 'status',
  inventorystatus: 'inventoryStatus', inventory: 'inventoryStatus',
  tags: 'tags', tag: 'tags',
  vendor: 'vendor', supplier: 'vendor',
  orderurl: 'orderUrl', orderlink: 'orderUrl',
  orderdate: 'orderDate',
  notes: 'notes', note: 'notes',
  url: 'url', link: 'url', urls: 'url',
};

function splitTableRow(line: string): string[] {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|')) t = t.slice(0, -1);
  return t.split('|').map((c) => c.trim());
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => c === '' || /^:?-+:?$/.test(c));
}

function parseChecklist(markdown: string): { rows: ChecklistRow[]; warnings: string[] } {
  const lines = markdown.split(/\r?\n/);
  const rows: ChecklistRow[] = [];
  const warnings: string[] = [];
  let columnMap: (keyof ChecklistRow | 'skip' | null)[] | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\s*\|.*\|\s*$/.test(line)) continue;
    const cells = splitTableRow(line);
    const next = lines[i + 1];
    const nextIsSeparator = next && /^\s*\|.*\|\s*$/.test(next) && isSeparatorRow(splitTableRow(next));

    if (nextIsSeparator) {
      columnMap = cells.map((h) => HEADER_ALIASES[h.toLowerCase().replace(/[^a-z]/g, '')] ?? null);
      if (!columnMap.includes('category') || !columnMap.includes('item')) {
        warnings.push(`Table header at line ${i + 1} is missing a "Category" or "Item" column — skipping this table.`);
        columnMap = null;
      }
      i++;
      continue;
    }
    if (isSeparatorRow(cells)) continue;
    if (!columnMap) continue;

    const get = (key: keyof ChecklistRow): string => {
      const idx = columnMap!.indexOf(key);
      return idx >= 0 && idx < cells.length ? cells[idx] : '';
    };
    const item = get('item');
    if (!item) continue;

    const parseNum = (s: string): number | null => {
      const cleaned = s.replace(/[$,]/g, '').trim();
      if (!cleaned || /^tbd$/i.test(cleaned)) return null;
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : null;
    };
    const qtyRaw = parseNum(get('qty'));

    rows.push({
      category: get('category').toLowerCase(),
      item,
      qty: qtyRaw && qtyRaw > 0 ? Math.round(qtyRaw) : 1,
      inventoryStatus: get('inventoryStatus').toLowerCase() || null,
      tags: get('tags'),
      vendor: get('vendor'),
      orderUrl: get('orderUrl'),
      orderDate: get('orderDate'),
      w: parseNum(get('w')),
      d: parseNum(get('d')),
      h: parseNum(get('h')),
      mountSurface: get('mountSurface').toLowerCase() || null,
      cost: parseNum(get('cost')),
      status: get('status').toLowerCase() || null,
      notes: get('notes'),
      url: get('url'),
    });
  }
  return { rows, warnings };
}

// ---------------------------------------------------------------------------
// Tool schemas
// ---------------------------------------------------------------------------

const rotationSchema = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]);
const categorySchema = z.enum([
  'structure', 'bed', 'seating', 'kitchen', 'sink', 'vanity', 'shower', 'toilet',
  'storage', 'cabinet', 'appliance', 'electrical', 'water', 'plumbing', 'lighting', 'roof', 'other',
]);
const statusSchema = z.enum(['final', 'placeholder']);
const inventoryStatusSchema = z.enum(['owned', 'ordered', 'proposed', 'placed', 'superseded']);
const mountSurfaceSchema = z.enum(['floor', 'roof', 'underbody', 'door', 'ceiling', 'wall']);
const doorIdSchema = z.enum(['rear-left', 'rear-right']);
const wallSideSchema = z.enum(['left', 'right']);
const portKindSchema = z.enum(['fill', 'vent', 'outlet', 'inlet', 'drain', 'electrical', 'other']);
const tagsSchema = z.array(z.string()).optional().describe(
  'Free-form string tags for filtering/organization. Suggested vocabulary: fait, capture, structural, ' +
    'electrical, plumbing, kitchen, furniture, exterior, consumable. Any string is accepted.'
);
const portsSchema = z
  .array(
    z.object({
      kind: portKindSchema,
      label: z.string().optional().describe('Optional override label, e.g. \'1-1/2" BSPT fill/vent\'. Falls back to the kind name if omitted.'),
      x: z.number(),
      y: z.number(),
      z: z.number(),
    })
  )
  .optional()
  .describe(
    'Labeled plumbing/electrical connection points (fill, vent, drain, etc) — rendered as small ' +
      'colored markers in the 3D view and listed in the Inspector, purely for reference; never ' +
      'collision-checked. Position is in the component\'s own local frame at rotation 0, same ' +
      'convention as dims: x/z are centered on the footprint (-w/2..w/2, -d/2..d/2), y is height ' +
      'from the component\'s base (0..h).'
  );

const placeItemShape = {
  componentId: z.string().describe('A def id from list_catalog.'),
  plane: z
    .enum(['floor', 'roof', 'underbody', 'door', 'ceiling', 'wall'])
    .optional()
    .describe(
      'Optional sanity check, not a placement choice — each component already has a fixed mount ' +
        'surface (see list_catalog). If given, it must match that component\'s actual surface or the ' +
        'call fails with an error instead of silently placing it on the wrong plane.'
    ),
  x: z.number().describe('Footprint center, millimeters (mm) from the left wall (x=0). For "wall" components this is IGNORED — it\'s auto-computed so the item sits flush against the wall.'),
  y: z.number().describe('Base height, millimeters (mm). 0 = that plane\'s floor (van floor for "floor", roof surface for "roof", van floor underside for "underbody", height on the door panel for "door"), where negative values go further down. IGNORED for "ceiling" components — y is auto-derived so the top hugs the ceiling / the item above.'),
  z: z.number().describe('Footprint center, millimeters (mm) from the front/cab wall (z=0). For "door" components this is IGNORED — it\'s auto-computed so the item sits flush against the door; pass x/y as if the door were closed.'),
  doorId: doorIdSchema.optional().describe('Which rear door panel to mount on — only used when the component\'s mountSurface is "door" (defaults to "rear-left" if omitted). Ignored otherwise. An item can\'t straddle both panels.'),
  wallSide: wallSideSchema.optional().describe('Which interior side wall to mount on — only used when the component\'s mountSurface is "wall" (defaults to "left" if omitted). Ignored otherwise.'),
  rotation: rotationSchema.optional().default(0).describe('Yaw in degrees, one of 0/90/180/270.'),
  label: z.string().optional().describe('Optional display label override for this instance.'),
};

function placeOne(
  project: ProjectState,
  args: { componentId: string; plane?: string; x: number; y: number; z: number; doorId?: 'rear-left' | 'rear-right'; wallSide?: 'left' | 'right'; rotation?: number; label?: string }
): { project: ProjectState; result: unknown; error?: string } {
  const def = project.defs.find((d) => d.id === args.componentId);
  if (!def) {
    return { project, result: null, error: `No component with id "${args.componentId}". Call list_catalog for valid ids.` };
  }
  const actualSurface = def.mountSurface ?? 'floor';
  if (args.plane && args.plane !== actualSurface) {
    return {
      project,
      result: null,
      error: `"${def.name}" mounts on "${actualSurface}", not "${args.plane}". Omit plane or pass the correct one.`,
    };
  }
  const rotationY = (args.rotation ?? 0) as 0 | 90 | 180 | 270;
  const placed = ops.placeInstanceAt(project, args.componentId, { x: args.x, y: args.y, z: args.z }, rotationY, args.doorId, args.wallSide);
  if ('error' in placed) return { project, result: null, error: placed.error };
  let next = placed.project;
  if (args.label) next = ops.updateInstance(next, placed.instance.id, { label: args.label });
  const finalInstance = next.instances.find((i) => i.id === placed.instance.id)!;
  return {
    project: next,
    result: {
      instance: describeInstance(next, finalInstance),
      violations: violationsFor(next, finalInstance.id),
    },
  };
}

// ---------------------------------------------------------------------------
// Create and configure the server
// ---------------------------------------------------------------------------

export function createVanBuilderServer(): McpServer {
  const server = new McpServer({ name: 'van-builder', version: '1.0.0' });

  server.tool(
    'list_catalog',
    'List every component type in the catalog (id, name, category, dimensions in millimeters (mm), ' +
      'mount surface, and overlap group). Call this first to get real componentId values before ' +
      'placing anything — place_item/place_items need an id from here, not a name.',
    {},
    async (): Promise<CallToolResult> => {
      const project = readProject();
      return ok({
        count: project.defs.length,
        components: project.defs.map((d: ComponentDef) => ({
          id: d.id,
          name: d.name,
          category: d.category,
          mountSurface: d.mountSurface ?? 'floor',
          dims: d.dims,
          overlapGroup: d.overlapGroup,
          estCost: d.estCost,
          status: d.status ?? 'final',
          notes: d.notes,
          url: d.url,
          wheelWellCutout: d.wheelWellCutout,
          ports: d.ports,
          placedCount: project.instances.filter((i) => i.defId === d.id).length,
        })),
      });
    }
  );

  server.tool(
    'get_layout',
    'Get the current van shell configuration, every placed component instance, and the live list ' +
      'of conflicts (collisions, out-of-bounds, cab-zone obstacles) — the same conflict detection ' +
      'the app itself uses. Coordinate frame: x = across width (0 = left wall), y = up (0 = van ' +
      'floor; negative = below floor on the underbody plane), z = along length (0 = front/cab wall). ' +
      'Units are millimeters (mm) — the MCP contract is mm, never inches. A placed item\'s x/z is its footprint CENTER (stable under rotation); y is ' +
      'its BASE height on whichever plane it mounts to (floor/roof/underbody); for "ceiling" items y is derived (top pressed against the ceiling or the item above), not chosen.',
    {},
    async (): Promise<CallToolResult> => {
      const project = readProject();
      return ok({
        shell: project.shell,
        instances: project.instances.map((i: PlacedInstance) => describeInstance(project, i)),
        overlapMatrix: project.overlapMatrix,
        violations: ops.getViolations(project),
      });
    }
  );

  server.tool(
    'add_def',
    'Add a new component type to the catalog — for a part that isn\'t one of the built-in starter ' +
      'components (a specific brand/model, or anything not covered yet). Dims/cost can be exact or a ' +
      'placeholder guess — set status to "placeholder" when they\'re not locked in yet so it\'s clear ' +
      'this needs follow-up before the build blueprint is final. Does not place an instance of it — ' +
      'follow with place_item/place_items.',
    {
      name: z.string().min(1),
      category: categorySchema,
      dims: z.object({ w: z.number().positive(), d: z.number().positive(), h: z.number().positive() })
        .describe('Footprint at rotation 0, millimeters (mm): w = across width, d = along length, h = up.'),
      mountSurface: mountSurfaceSchema.optional().describe(
        'Defaults to "floor" if omitted. "ceiling" hangs INSIDE the van from above: it can be placed anywhere in x/z but its y is derived so its top always hugs the finished ceiling, or the underside of whatever floor-plane item is directly above it (e.g. a raised lift bed) — and it follows that item if it moves. It collides with interior items like any floor item. "door" mounts to a rear door panel — it swings open with the ' +
          'door in the 3D view and is auto-clamped flush against it (see place_item\'s doorId param). "wall" mounts to an interior side wall — items are flush against the wall surface.'
      ),
      estCost: z.number().min(0).optional().describe('Estimated unit cost in USD. Omit if not priced yet.'),
      status: statusSchema.optional().default('placeholder')
        .describe('"final" once name/dims/cost are locked in; defaults to "placeholder".'),
      inventoryStatus: inventoryStatusSchema.optional().describe(
        'Purchase/inventory status: owned (in hand), ordered (awaiting delivery), proposed (planning), ' +
          'placed (installed), superseded (replaced). New items from Capture/FAIT default to "proposed".'
      ),
      orderUrl: z.string().optional().describe('Actual order/receipt URL if different from the spec/buy link in url.'),
      orderDate: z.string().optional().describe('ISO date string (YYYY-MM-DD) when the order was placed.'),
      vendor: z.string().optional().describe('Vendor/supplier name for this part.'),
      tags: tagsSchema,
      notes: z.string().optional(),
      url: z.string().optional().describe(
        'Product / spec-sheet link (Amazon listing, manufacturer page, install manual). Put the canonical ' +
          'buy/spec link here rather than burying it in notes — the catalog sheet view shows it as a link.'
      ),
      overlapGroup: z.string().optional()
        .describe('Instances of defs sharing this group are treated as alternates and may overlap each other (e.g. two sink options on one footprint).'),
      wheelWellCutout: z.boolean().optional().describe(
        'Set true when this component\'s real shape is hollowed/notched to fit around the rear wheel ' +
          'well by design (e.g. a wheel-well water tank) — its bounding box is then allowed to overlap ' +
          'the wheel-well exclusion zone without being flagged as a conflict. Everything else (other ' +
          'instances, the cab zone, envelope walls) still collides normally.'
      ),
      ports: portsSchema,
    },
    async (args): Promise<CallToolResult> => {
      const project = readProject();
      const { project: next, id } = ops.addDef(project, {
        name: args.name,
        category: args.category,
        dims: args.dims,
        mountSurface: args.mountSurface,
        estCost: args.estCost,
        status: args.status,
        inventoryStatus: args.inventoryStatus,
        orderUrl: args.orderUrl,
        orderDate: args.orderDate,
        vendor: args.vendor,
        tags: args.tags,
        notes: args.notes,
        url: args.url,
        overlapGroup: args.overlapGroup,
        wheelWellCutout: args.wheelWellCutout,
        ports: args.ports,
      });
      writeProject(next);
      const def = next.defs.find((d) => d.id === id)!;
      return ok({ def: describeDef(next, def) });
    }
  );

  server.tool(
    'update_def',
    'Patch an existing catalog component (e.g. fill in a real model\'s dims/cost once known, rename ' +
      'from a placeholder to a final name, or flip status to "final"). Only the fields you pass ' +
      'change. Existing placed instances of this def keep their position — dims changes affect their ' +
      'footprint in future conflict checks.',
    {
      id: z.string(),
      name: z.string().min(1).optional(),
      category: categorySchema.optional(),
      dims: z.object({ w: z.number().positive(), d: z.number().positive(), h: z.number().positive() }).optional(),
      mountSurface: mountSurfaceSchema.optional(),
      estCost: z.number().min(0).optional(),
      status: statusSchema.optional(),
      inventoryStatus: inventoryStatusSchema.optional().describe(
        'Purchase/inventory status: owned (in hand), ordered (awaiting delivery), proposed (planning), ' +
          'placed (installed), superseded (replaced).'
      ),
      orderUrl: z.string().optional().describe('Actual order/receipt URL. Pass empty string to clear.'),
      orderDate: z.string().optional().describe('ISO date string (YYYY-MM-DD). Pass empty string to clear.'),
      vendor: z.string().optional().describe('Vendor/supplier name. Pass empty string to clear.'),
      tags: tagsSchema,
      notes: z.string().optional(),
      url: z.string().optional().describe('Product / spec-sheet link. Pass an empty string to clear it.'),
      overlapGroup: z.string().optional(),
      wheelWellCutout: z.boolean().optional().describe(
        'Set true when this component\'s real shape is hollowed/notched to fit around the rear wheel ' +
          'well by design — its bounding box is then allowed to overlap the wheel-well exclusion zone ' +
          'without being flagged as a conflict.'
      ),
      ports: portsSchema,
    },
    async ({ id, ...patch }): Promise<CallToolResult> => {
      const project = readProject();
      if (!project.defs.some((d) => d.id === id)) {
        return fail(`No component def with id "${id}". Call list_catalog for valid ids.`);
      }
      const cleanPatch: Partial<ComponentDef> = { ...patch };
      if (patch.url !== undefined) cleanPatch.url = patch.url.trim() || undefined;
      if (patch.orderUrl !== undefined) cleanPatch.orderUrl = patch.orderUrl.trim() || undefined;
      if (patch.orderDate !== undefined) cleanPatch.orderDate = patch.orderDate.trim() || undefined;
      if (patch.vendor !== undefined) cleanPatch.vendor = patch.vendor.trim() || undefined;
      const next = ops.updateDef(project, id, cleanPatch);
      writeProject(next);
      const def = next.defs.find((d) => d.id === id)!;
      return ok({ def: describeDef(next, def), violations: ops.getViolations(next) });
    }
  );

  server.tool(
    'place_item',
    'Place one instance of a catalog component at an exact position/rotation. Returns the created ' +
      'instance and any conflicts it introduces (it is still placed even if it conflicts — check the ' +
      'returned violations, or call check_conflicts / snap_to_safe).',
    placeItemShape,
    async (args): Promise<CallToolResult> => {
      const project = readProject();
      const { project: next, result, error } = placeOne(project, args);
      if (error) return fail(error);
      writeProject(next);
      return ok(result);
    }
  );

  server.tool(
    'place_items',
    'Place several components in one call — the batch version of place_item, for laying out or ' +
      'speculating on a whole section at once. Best-effort: each entry is applied independently, so ' +
      'one bad componentId doesn\'t block the rest. Returns per-item results plus the full ' +
      'whole-layout conflict list after all placements.',
    { items: z.array(z.object(placeItemShape)).min(1) },
    async ({ items }): Promise<CallToolResult> => {
      let project = readProject();
      const results: unknown[] = [];
      for (const item of items) {
        const { project: next, result, error } = placeOne(project, item);
        project = next;
        results.push(error ? { componentId: item.componentId, error } : result);
      }
      writeProject(project);
      return ok({ results, violations: ops.getViolations(project) });
    }
  );

  server.tool(
    'move_item',
    'Move and/or rotate an existing placed instance. Only the fields you pass change — omit x/y/z/' +
      'rotation/doorId/wallSide to leave them as-is. Same coordinate convention as place_item. For a "door"-' +
      'mount instance, z is always auto-corrected back to flush-against-the-door regardless of what ' +
      'you pass — it physically can\'t be moved away from the mounting surface. For a "wall"-mount ' +
      'instance, x is auto-corrected to stay flush against the wall.',
    {
      instanceId: z.string(),
      x: z.number().optional(),
      y: z.number().optional(),
      z: z.number().optional(),
      doorId: doorIdSchema.optional().describe('Switch which rear door panel a "door"-mount instance rides on.'),
      wallSide: wallSideSchema.optional().describe('Switch which side wall a "wall"-mount instance is on.'),
      rotation: rotationSchema.optional(),
    },
    async ({ instanceId, x, y, z, doorId, wallSide, rotation }): Promise<CallToolResult> => {
      const project = readProject();
      const inst = project.instances.find((i) => i.id === instanceId);
      if (!inst) return fail(`No placed instance with id "${instanceId}". Call get_layout for valid ids.`);
      const pos: Vec3 = { x: x ?? inst.pos.x, y: y ?? inst.pos.y, z: z ?? inst.pos.z };
      const patch: Partial<Omit<PlacedInstance, 'id'>> = { pos };
      if (rotation !== undefined) patch.rotationY = rotation;
      if (doorId !== undefined) patch.doorId = doorId;
      if (wallSide !== undefined) patch.wallSide = wallSide;
      const next = ops.updateInstance(project, instanceId, patch);
      writeProject(next);
      const updated = next.instances.find((i) => i.id === instanceId)!;
      return ok({ instance: describeInstance(next, updated), violations: violationsFor(next, instanceId) });
    }
  );

  server.tool(
    'remove_item',
    'Remove a placed instance from the layout.',
    { instanceId: z.string() },
    async ({ instanceId }): Promise<CallToolResult> => {
      const project = readProject();
      if (!project.instances.some((i) => i.id === instanceId)) {
        return fail(`No placed instance with id "${instanceId}". Call get_layout for valid ids.`);
      }
      const next = ops.removeInstance(project, instanceId);
      writeProject(next);
      return ok({ removed: instanceId, violations: ops.getViolations(next) });
    }
  );

  server.tool(
    'check_conflicts',
    'Return the full list of current conflicts (collisions, out-of-bounds, cab-zone obstacles) — ' +
      'exactly the same detection the app\'s Conflicts panel uses.',
    {},
    async (): Promise<CallToolResult> => {
      const project = readProject();
      return ok({ violations: ops.getViolations(project) });
    }
  );

  server.tool(
    'snap_to_safe',
    'Move an out-of-bounds/colliding instance to the nearest position (same rotation, same mount ' +
      'plane) that resolves every conflict it\'s currently in — the exact search the app\'s "Snap to ' +
      'nearest safe spot" button uses. Returns moved:false if no valid position exists anywhere on ' +
      'its plane.',
    { instanceId: z.string() },
    async ({ instanceId }): Promise<CallToolResult> => {
      const project = readProject();
      if (!project.instances.some((i) => i.id === instanceId)) {
        return fail(`No placed instance with id "${instanceId}". Call get_layout for valid ids.`);
      }
      const result = ops.resolveInstance(project, instanceId);
      if (result.moved) writeProject(result.project);
      const updated = result.project.instances.find((i) => i.id === instanceId)!;
      return ok({
        moved: result.moved,
        instance: describeInstance(result.project, updated),
        violations: violationsFor(result.project, instanceId),
      });
    }
  );

  server.tool(
    'get_clearances',
    'Get the distance in millimeters (mm) from a placed item to the nearest obstacle or envelope wall in each ' +
      'of the 6 directions (left/right = across width, forward/back = toward cab/rear, up/down = ' +
      'height) — the exact same swept-distance query the app\'s toggleable clearance gauges show. Use ' +
      'this to verify practical operating room (walkway width, room to open a door/drawer, headroom) ' +
      'after placing items — check_conflicts only tells you yes/no on hard collisions, not how much ' +
      'space is actually left. Omit instanceId to get clearances for every placed item at once.',
    { instanceId: z.string().optional() },
    async ({ instanceId }): Promise<CallToolResult> => {
      const project = readProject();
      if (instanceId) {
        const inst = project.instances.find((i) => i.id === instanceId);
        if (!inst) return fail(`No placed instance with id "${instanceId}". Call get_layout for valid ids.`);
        return ok({ instance: describeInstance(project, inst), clearances: ops.getClearances(project, instanceId) });
      }
      return ok({
        results: project.instances.map((inst) => ({
          instance: describeInstance(project, inst),
          clearances: ops.getClearances(project, inst.id),
        })),
      });
    }
  );

  server.tool(
    'set_shell_dimensions',
    'Patch the van shell — interior length/width/height, wall framing + insulation thickness, ' +
      'ceiling framing, floor build-up, cab depth/seat size, rear/side door dimensions, roof/' +
      'underbody clearance, and wheel-well cutout size/position (a floor build-exclusion zone, same ' +
      'treatment as the cab zone). All fields optional; only what you pass changes. All values in millimeters (mm).',
    {
      name: z.string().optional(),
      interiorLength: z.number().positive().optional(),
      interiorWidth: z.number().positive().optional(),
      interiorHeight: z.number().positive().optional(),
      wallFramingThickness: z.number().min(0).optional(),
      insulationThickness: z.number().min(0).optional(),
      ceilingFramingThickness: z.number().min(0).optional(),
      floorBuildUpThickness: z.number().min(0).optional(),
      cabDepth: z.number().min(0).optional(),
      cabSeatWidth: z.number().min(0).optional(),
      cabSeatDepth: z.number().min(0).optional(),
      cabSeatHeight: z.number().min(0).optional(),
      rearDoorWidth: z.number().min(0).optional(),
      rearDoorHeight: z.number().min(0).optional(),
      sideDoorWidth: z.number().min(0).optional(),
      sideDoorHeight: z.number().min(0).optional(),
      sideDoorOffsetZ: z.number().min(0).optional(),
      sideDoorSide: z.enum(['left', 'right']).optional(),
      roofClearance: z.number().min(0).optional(),
      underbodyClearance: z.number().min(0).optional(),
      wheelWellWidth: z.number().min(0).optional().describe('Intrusion inward from each side wall. 0 disables the rear wheel-well exclusion zones.'),
      wheelWellHeight: z.number().min(0).optional().describe('Height off the floor. 0 disables the rear wheel-well exclusion zones.'),
      wheelWellLength: z.number().min(0).optional().describe('Front-to-back extent of each rear wheel well box.'),
      rearWheelWellCenterZ: z.number().optional().describe('Distance from the front wall (z=0) to the rear wheel wells\' center. Front wheel wells aren\'t modeled — they fall inside the already-off-limits cab zone.'),
    },
    async (patch): Promise<CallToolResult> => {
      const project = readProject();
      const next = ops.setShell(project, patch);
      writeProject(next);
      return ok({ shell: next.shell, violations: ops.getViolations(next) });
    }
  );

  server.tool(
    'save_variant',
    'Save the current live layout as a named snapshot, so you can compare multiple candidate ' +
      'layouts side by side instead of overwriting the one working layout every time.',
    { name: z.string().min(1) },
    async ({ name }): Promise<CallToolResult> => {
      const project = readProject();
      const saved = saveVariant(name, project);
      return ok({ saved });
    }
  );

  server.tool(
    'load_variant',
    'Load a previously saved variant and make it the active/live layout (this is what the running ' +
      'app and get_layout will show afterward).',
    { name: z.string().min(1) },
    async ({ name }): Promise<CallToolResult> => {
      let project: ProjectState;
      try {
        project = loadVariant(name);
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
      }
      writeProject(project);
      return ok({ loaded: name, shell: project.shell, instanceCount: project.instances.length, violations: ops.getViolations(project) });
    }
  );

  server.tool(
    'list_variants',
    'List all saved layout variants.',
    {},
    async (): Promise<CallToolResult> => {
      return ok({ variants: listVariants() });
    }
  );

  server.tool(
    'import_checklist',
    'Import a build checklist written in the Markdown table format from docs/checklist-template.md ' +
      '(Category | Item | Qty | W | D | H | MountSurface | Cost | Status | Notes — column order and ' +
      'omitted optional columns are tolerant; use "TBD" or leave a cell blank for anything not decided ' +
      'yet). For each row: matches an existing catalog component by exact (case-insensitive) name and ' +
      'reuses/updates it, or creates a new one via add_def if no match exists; then tops up placed ' +
      'instances to the row\'s Qty using rough auto-placement (corner-staggered, NOT spacing-checked — ' +
      'follow up with get_clearances/move_item to arrange things properly). Rows already at or above ' +
      'their requested Qty add nothing. Returns which defs were created/updated, how many instances ' +
      'were added, and a needsInput list of rows still missing dims/cost/final-status — a checklist of ' +
      'what to prompt the user for next. Safe to call multiple times as the source list grows: re-running ' +
      'it does not duplicate instances already at their target Qty, but WILL add more if Qty increased.',
    { markdown: z.string().min(1) },
    async ({ markdown }): Promise<CallToolResult> => {
      let project = readProject();
      const { rows, warnings } = parseChecklist(markdown);
      if (rows.length === 0) {
        return fail('No parseable checklist rows found. Expect a Markdown table with "Category" and "Item" columns — see docs/checklist-template.md.' + (warnings.length ? ' ' + warnings.join(' ') : ''));
      }

      const createdDefs: unknown[] = [];
      const updatedDefs: unknown[] = [];
      let instancesAdded = 0;
      const needsInput: unknown[] = [];
      const skipped: unknown[] = [];

      for (const row of rows) {
        const category = (CATEGORIES as readonly string[]).includes(row.category) ? (row.category as Category) : 'other';
        if (category !== row.category && row.category) {
          warnings.push(`"${row.item}": unrecognized category "${row.category}" — filed under "other".`);
        }
        const mountSurface =
          row.mountSurface && ['floor', 'roof', 'underbody', 'door', 'ceiling', 'wall'].includes(row.mountSurface)
            ? (row.mountSurface as 'floor' | 'roof' | 'underbody' | 'door' | 'ceiling' | 'wall')
            : undefined;

        const rowInventoryStatus =
          row.inventoryStatus && ['owned', 'ordered', 'proposed', 'placed', 'superseded'].includes(row.inventoryStatus)
            ? (row.inventoryStatus as 'owned' | 'ordered' | 'proposed' | 'placed' | 'superseded')
            : undefined;
        const rowTags = row.tags ? row.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined;

        let def = project.defs.find((d) => d.name.toLowerCase() === row.item.toLowerCase());
        const dimsGiven = row.w != null && row.d != null && row.h != null;
        const rowStatus: 'final' | 'placeholder' | undefined =
          row.status === 'final' ? 'final' : row.status === 'placeholder' ? 'placeholder' : undefined;
        let dimsArePlaceholder = false;

        if (def) {
          const patch: Partial<ComponentDef> = {};
          if (dimsGiven) patch.dims = { w: row.w!, d: row.d!, h: row.h! };
          if (row.cost != null) patch.estCost = row.cost;
          if (rowStatus) patch.status = rowStatus;
          if (rowInventoryStatus) patch.inventoryStatus = rowInventoryStatus;
          if (rowTags && rowTags.length > 0) patch.tags = rowTags;
          if (row.vendor) patch.vendor = row.vendor;
          if (row.orderUrl) patch.orderUrl = row.orderUrl;
          if (row.orderDate) patch.orderDate = row.orderDate;
          if (row.notes) patch.notes = row.notes;
          if (row.url) patch.url = row.url;
          if (mountSurface) patch.mountSurface = mountSurface;
          if (Object.keys(patch).length > 0) {
            project = ops.updateDef(project, def.id, patch);
            def = project.defs.find((d) => d.id === def!.id)!;
            updatedDefs.push(describeDef(project, def));
          }
        } else {
          const inferredStatus = rowStatus ?? (dimsGiven && row.cost != null ? 'final' : 'placeholder');
          const created = ops.addDef(project, {
            name: row.item,
            category,
            dims: dimsGiven ? { w: row.w!, d: row.d!, h: row.h! } : { w: 305, d: 305, h: 305 },
            mountSurface,
            estCost: row.cost ?? undefined,
            status: inferredStatus,
            inventoryStatus: rowInventoryStatus ?? (inferredStatus === 'placeholder' ? 'proposed' : undefined),
            tags: rowTags,
            vendor: row.vendor || undefined,
            orderUrl: row.orderUrl || undefined,
            orderDate: row.orderDate || undefined,
            notes: row.notes || undefined,
            url: row.url || undefined,
          });
          project = created.project;
          def = project.defs.find((d) => d.id === created.id)!;
          dimsArePlaceholder = !dimsGiven;
          if (dimsArePlaceholder) warnings.push(`"${row.item}": no dims given — created with a 305x305x305 mm placeholder footprint.`);
          createdDefs.push(describeDef(project, def));
        }

        const finalDef = def!;
        const existingCount = project.instances.filter((i) => i.defId === finalDef.id).length;
        const toAdd = row.qty - existingCount;
        for (let n = 0; n < toAdd; n++) {
          const placed = ops.addInstance(project, finalDef.id);
          if ('error' in placed) { warnings.push(`"${row.item}": ${placed.error}`); break; }
          project = placed.project;
          instancesAdded++;
        }
        if (toAdd <= 0 && existingCount > row.qty) {
          skipped.push({ item: row.item, note: `${existingCount} already placed, more than requested Qty ${row.qty} — none removed.` });
        }

        const missing = [
          dimsArePlaceholder ? 'dims (currently a 305x305x305 mm placeholder)' : null,
          finalDef.estCost == null ? 'cost' : null,
          (finalDef.status ?? 'final') !== 'final' ? 'final name/status confirmation' : null,
        ].filter((m): m is string => m !== null);
        if (missing.length > 0) {
          needsInput.push({ defId: finalDef.id, name: finalDef.name, category: finalDef.category, dims: finalDef.dims, missing });
        }
      }

      writeProject(project);
      return ok({
        rowsParsed: rows.length,
        createdDefs,
        updatedDefs,
        instancesAdded,
        skipped,
        needsInput,
        warnings,
        violations: ops.getViolations(project),
      });
    }
  );

  server.tool(
    'export_checklist',
    'Render the current live catalog + placed counts as a Markdown checklist table in the same ' +
      'format import_checklist reads (docs/checklist-template.md) — the running "what have we ' +
      'covered" blueprint. Includes every catalog def, even ones with zero placed instances yet ' +
      '(Qty 0 = planned but not placed). Includes InventoryStatus, Tags, Vendor, OrderUrl, OrderDate columns.',
    {},
    async (): Promise<CallToolResult> => {
      const project = readProject();
      const header = '| Category | Item | Qty | W | D | H | MountSurface | Cost | Status | InventoryStatus | Tags | Vendor | OrderUrl | OrderDate | URL | Notes |';
      const sep = '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|';
      const lines = [header, sep];
      for (const d of [...project.defs].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))) {
        const placedCount = project.instances.filter((i) => i.defId === d.id).length;
        const cost = d.estCost != null ? String(d.estCost) : 'TBD';
        const invStatus = inferInventoryStatus(d, placedCount);
        const tagsStr = (d.tags ?? []).join(', ');
        lines.push(
          `| ${d.category} | ${d.name} | ${placedCount} | ${d.dims.w} | ${d.dims.d} | ${d.dims.h} | ${d.mountSurface ?? 'floor'} | ${cost} | ${d.status ?? 'final'} | ${invStatus} | ${tagsStr} | ${d.vendor ?? ''} | ${d.orderUrl ?? ''} | ${d.orderDate ?? ''} | ${d.url ?? ''} | ${d.notes ?? ''} |`
        );
      }
      return ok({ markdown: lines.join('\n'), defCount: project.defs.length, totalInstances: project.instances.length });
    }
  );

  return server;
}
