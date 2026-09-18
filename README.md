# Van Builder

A parametric 3D adventure-van layout tool. Set your van's interior
dimensions, build out a catalog of standardized components across three
layout planes (interior, roof, undercarriage), and drag them into place with
automatic conflict detection.

## Running it

```bash
npm install
npm run dev
```

Then open the printed local URL (usually `http://localhost:5173`).

Geometry tests: `npm test` (vitest).

## How it's modeled

**Van shell → buildable envelope.** You enter the van's raw interior
dimensions (length/width/height) plus wall scaffold/framing thickness,
insulation thickness, ceiling framing allowance, and floor build-up. The app
subtracts those from the raw shell to get the actual **buildable envelope** —
the space components can occupy. Change any of those numbers (e.g. thicker
insulation) and the envelope — and every placement constraint — recomputes
live. See [src/geometry.ts](src/geometry.ts) `computeEnvelope`.

**Three layout planes, one combined scene.** Most components mount on the
interior **floor**. Roof-mounted gear (solar, Starlink, vents, roof A/C) and
undercarriage gear (water tanks, other chassis-mounted equipment) each get
their **own** layout plane with independent collision checking — a roof
solar panel never "collides" with a floor bed — but all three render
combined in the same 3D scene, stacked in their real physical relationship.
Set a component's plane via **Mounts on** in the catalog editor. See
`computeEnvelope` / `computeRoofEnvelope` / `computeUnderbodyEnvelope` /
`envelopeFor` in [src/geometry.ts](src/geometry.ts).
- The **undercarriage** plane is deliberately simple: a shallow box under the
  floor that also auto-clears the front `cabDepth`, a rough stand-in for the
  engine/transmission area. Exact drivetrain geometry isn't modeled.

**Cab / front seats — a hard exclusion zone.** The front `cabDepth`
(millimeters) of
the van (driver + passenger area) is always off-limits to placed components,
regardless of the envelope math — nothing can be built there. Two
approximate captain's chairs are drawn swiveled to face the rear, positioned
against the *rear* edge of that reserved zone (bordering the living area),
leaving the front open for the windshield/dash/steering wheel, which aren't
modeled. Configurable in the **Cab, Doors & Layers** panel.

**Wheel wells — another hard exclusion zone.** Two flat-topped boxes (rear,
left + right) intrude from the side walls into the floor plane — same
treatment as the cab zone: an always-off-limits region layered on top of
the envelope, not subtracted from `interiorWidth`. Front wheel wells aren't
modeled; they fall inside the cab zone, which is already off-limits, so
there's nothing extra to build around there. All four dimensions (intrusion
from the wall, height, front-to-back length, and the pair's position along
the van) are configurable in **Cab, Doors & Layers**; set width or height to
0 to disable them entirely. The shipped defaults approximate a Ram
ProMaster 159" EXT High Roof from community-measured van-conversion sources
(Ram doesn't publish interior wheel-well dimensions) — true them up with
your own tape measure before cutting anything. See `computeWheelWellZones`
in [src/geometry.ts](src/geometry.ts).

**Rear doors & side slider.** Reference geometry only — doesn't constrain
the envelope. Rear doors are hinged swing panels; the side door is a
sliding-door marker (dimensions/position configurable, since they vary van
to van). Use the **Open/Close** buttons in **Cab, Doors & Layers** to check
build clearance against them.

**Component catalog.** A starter set of standardized components ships in
[src/defaultData.ts](src/defaultData.ts) — bed, dinette, galley, sinks,
vanity, shower, toilet, cabinets, storage, a power system (batteries,
inverter, charge controller, fuse panel), plumbing fixtures (pump, tankless
heater, faucets, filter, inlet), lighting, roof gear, and undercarriage
tanks/accessory box. Add, rename, resize, recolor, or delete types from the
**Component Catalog** panel — this is meant to grow into your own
standardized parts list over time.

**Placing & moving.** Click "+" on a catalog entry to drop an instance into
the van. Select it (click in the 3D view or in "Placed Items") and either:
- drag its on-screen gizmo (snaps to 5 mm),
- type exact X/Y/Z millimeters (or cm/inch with the display-unit toggle) in the
  Inspector,
- use the directional pad (floor plane) and Up/Down buttons, or
- rotate it 90° at a time.

X/Z track the item's footprint *center* (so rotation doesn't shift it), Y
tracks its *base* height off its plane's floor (so you can mount something
on a shelf at, say, Y=30, or a tank hanging below the floor at Y=-6).

**Quick camera views.** The Quick Views panel snaps the camera to Iso,
Front, Back, Left, Right, Top, Bottom, a framed Roof-plane view, or a framed
Underbody view — you can still freely orbit/zoom from wherever it lands.

**"Snap to nearest safe spot."** If an item is out of bounds or colliding,
click this in the Inspector (or "Fix" next to any conflict in the Conflicts
panel) to move it — same rotation — to the closest position that resolves
every conflict, searching outward in a ring pattern on its own plane first.
See `findNearestValidPosition` in [src/geometry.ts](src/geometry.ts).

**Overlap rules — "designed to overlap" vs. real collisions.** Every pair of
placed items *on the same layout plane* is checked with AABB (rotation-aware)
intersection. An overlap is only flagged as a conflict if it's *not*
explicitly allowed:

1. **Category matrix** (Overlap Rules panel): e.g. `sink ↔ vanity`, `sink ↔
   kitchen`, `plumbing ↔ sink/vanity/shower/water`, `lighting ↔
   cabinet/storage/bed` are allowed by default, since those things are
   designed to sit in/on each other. `shower ↔ bed` is not, so that always
   flags. Toggle any category pair on/off yourself.
2. **Overlap group** (per component, in the catalog editor): components
   sharing a group string (e.g. `sink-option`) are always allowed to overlap
   each other — for comparing alternate options in the same slot, like two
   different sink sizes on the same vanity cut-out.
3. **Per-instance whitelist** (`overlapWhitelist` in the data model) for
   one-off exceptions, settable via import/export JSON today.

Anything outside its plane's envelope is flagged too, and anything on the
floor plane overlapping the cab zone or a wheel well is flagged as an
obstacle conflict.
All three show up live in the **Conflicts** panel and highlight red in the
3D view; click a conflict (or its "Fix" button) to jump to / resolve the
offending item.

**Persistence.** The project (shell + catalog + placed items + overlap
rules) autosaves to `localStorage`. Door open/closed state and the current
camera-view request are transient UI state, not saved. Use **Export JSON** /
**Import JSON** in the top bar to save named layouts to disk or share them.

## MCP server — drive it from an external Claude instance

An MCP server lets a Claude instance running elsewhere (not just this app's
UI) list the catalog, place/move/remove components, check conflicts, and
speculate on whole layouts. It shares one JSON file (`van-builder-project.json`,
gitignored — the same `ProjectState` schema as Export/Import JSON) with the
running dev app:

```
you edit in the UI  ─┐                          ┌─ MCP tool calls
                      ├─► van-builder-project.json ◄─┤
running app hot-reloads ┘   (file-watch + HTTP bridge)  └─ external Claude
```

### Two transports: stdio (local) and HTTP (remote)

| Transport | Command | Use case |
|-----------|---------|----------|
| **stdio** | `npm run mcp` | Claude Desktop/Code via `.mcp.json` |
| **HTTP** | `npm run mcp:http` | Remote agents (Grok Bot, Parts Bot) via Tailscale Funnel |

Both transports share the exact same tools and project file.

#### stdio transport (default)

- `npm run mcp` runs it standalone over stdio
- Already registered for Claude Code via `.mcp.json` at the repo root — just
  restart `claude` in this project and the `van-builder` server is available
- Cowork reaches this stdio server through Claude Desktop's local MCP proxy

#### HTTP transport (for remote agents)

For agents that can't run stdio locally (Grok Bot, Parts Bot on Core), the
HTTP transport exposes the same MCP tools over Streamable HTTP:

```bash
# Start the HTTP server (default port 8767, loopback only)
npm run mcp:http

# With custom port
VAN_BUILDER_MCP_PORT=9000 npm run mcp:http

# With bearer token authentication
VAN_BUILDER_MCP_TOKEN=your-secret-token npm run mcp:http
```

**Endpoints:**
- `/mcp` — MCP Streamable HTTP endpoint (POST/GET)
- `/health` — Health check (GET)

**Expose via Tailscale Funnel:**

```bash
# Run the MCP server
npm run mcp:http

# In another terminal, expose via Tailscale Funnel
tailscale funnel --bg --https=8444 localhost:8767
```

This creates a public HTTPS URL like `https://your-machine.tail12345.ts.net:8444`.

**Configure Grok Bot / Parts Bot:**
- **URL:** `https://your-machine.tail12345.ts.net:8444/mcp`
- **Auth:** Bearer token if you set `VAN_BUILDER_MCP_TOKEN` (recommended when
  exposing over the internet; loopback-only with Funnel is also secure)

**Environment variables:**
| Variable | Default | Description |
|----------|---------|-------------|
| `VAN_BUILDER_MCP_PORT` | `8767` | HTTP server port |
| `VAN_BUILDER_MCP_TOKEN` | (none) | Bearer token for auth (optional) |

### Common details (both transports)

- **Units: millimeters.** The MCP contract is millimeters (mm) for every
  linear value — positions, dims, clearances, shell dimensions. Prices stay
  USD. Legacy inch-era project files (schema version 1 or missing) are
  auto-migrated to mm (×25.4, nearest whole mm) on read by
  `normalizeProject`'s `migrateInchesToMm`.
- **While `npm run dev` is also running**, changes the MCP server makes
  hot-reload straight into the open browser tab (no refresh), and your own
  UI edits get written back to the same file — so the two stay in sync in
  both directions. Without the dev server, the file just updates directly.
- **Tools:** `list_catalog`, `get_layout` (shell + instances + live
  conflicts), `add_def`, `update_def`, `place_item` / `place_items` (batch),
  `move_item`, `remove_item`, `check_conflicts`, `snap_to_safe`,
  `get_clearances`, `set_shell_dimensions`, `save_variant` / `load_variant` /
  `list_variants` (named snapshots), `import_checklist` / `export_checklist`.
- **One source of truth for the logic:** every tool calls straight into
  [src/projectOps.ts](src/projectOps.ts) and [src/geometry.ts](src/geometry.ts)
  — the exact same placement/collision/resolve functions `store.ts` (the
  browser app) uses. Nothing about conflict detection or placement is
  reimplemented for the MCP server; there's one implementation, not two that
  can drift.
- **`place_item`'s `plane` argument** is a sanity check, not a placement
  choice — each catalog component already has a fixed `mountSurface` (see
  `list_catalog`). Passing a `plane` that doesn't match the component's real
  surface fails with a clear error instead of silently placing it wrong.

**Phase 2 (not built yet):** a live-sync version (WebSocket push instead of
this file-watch bridge) would let an external agent and the browser stay in
sync with zero latency instead of a debounce/file-watch round trip. It isn't
built, but nothing here blocks it — `src/projectOps.ts` and
`src/geometry.ts` are already framework/runtime-agnostic (no browser or Node
imports), so that future server would import them directly too. See the
comment at the top of [src/projectOps.ts](src/projectOps.ts).

## Project structure

```
src/
  types.ts          domain model (VanShell, ComponentDef, PlacedInstance, MountSurface, ...)
  geometry.ts        envelope math (floor/roof/underbody), AABB collision, rotation,
                     snapping, nearest-safe-spot resolver
  projectOps.ts      framework-agnostic project mutations (add/move/remove/resolve/...) —
                     shared by store.ts AND the MCP server, so they can't drift
  defaultData.ts     starter van shell + component catalog + overlap matrix
  store.ts           zustand store: thin wrapper over projectOps.ts + localStorage persistence
  devSync.ts         dev-only two-way sync between the store and the MCP bridge file
  components/
    Scene.tsx              R3F canvas, camera, lighting, CameraRig (quick-view snapping)
    VanShellMesh.tsx        shell wireframe + envelope wireframe + floor grid
    VanFeaturesMesh.tsx     cab zone + seats + rear/side doors (open/close aware)
    RoofPlaneMesh.tsx       roof layout plane wireframe + grid
    UnderbodyPlaneMesh.tsx  undercarriage layout plane wireframe
    PlacedItemMesh.tsx      one placed component + its drag gizmo
    TopBar.tsx              export/import/reset
    VanDimensionsPanel.tsx
    VanFeaturesPanel.tsx    cab/door/roof/underbody config + door open/close buttons
    CameraViewPanel.tsx     quick-view buttons
    OverlapMatrixPanel.tsx
    CatalogPanel.tsx        add/edit/delete component types, incl. mount surface
    InspectorPanel.tsx      selected item's position/rotation/lock + snap-to-safe + placed list
    ViolationsPanel.tsx

mcp-server/
  server.ts          Shared MCP server setup — tool registration independent of transport
  index.ts           stdio transport entrypoint (for Claude Desktop/Code)
  http.ts            HTTP transport entrypoint (for remote agents via Tailscale Funnel)
  projectFile.ts      Node-side read/write of the bridge file + save/load/list variants

bridge-paths.ts        Node-only file paths (bridge file, variants dir) — repo root, NOT src/,
                       since src/ is bundled for the browser and must never import fs/path
bridge-protocol.ts     isomorphic HTTP path + HMR event name constants, shared by the browser
                       (devSync.ts) and Node side (vite-project-bridge.ts, mcp-server/)
vite-project-bridge.ts dev-only Vite plugin: GET/POST /api/project + file-watch → HMR push
.mcp.json              registers the MCP server for Claude Code in this project
```

## Inventory tracking, tags & wall mounts

**Inventory status.** Each catalog component can track its purchase/inventory
lifecycle via `inventoryStatus`:
- `proposed` — wishlist / planning item, not yet committed
- `ordered` — purchase placed, awaiting delivery
- `owned` — in hand, ready to install
- `placed` — installed in the van
- `superseded` — replaced by another part, kept for reference

When reading legacy JSON missing this field, the app infers: `proposed` if
status is `placeholder`, `owned` if `placedCount > 0`, else `proposed`.
Optional fields `orderUrl`, `orderDate` (ISO string), and `vendor` track
purchase details.

**Tags.** Free-form string array for filtering/organization. Suggested
vocabulary (not enforced): `fait`, `capture`, `structural`, `electrical`,
`plumbing`, `kitchen`, `furniture`, `exterior`, `consumable`. Filterable in
the UI; required in MCP `add_def`/`update_def`/`list_catalog`/`export_checklist`.

**Wall mount surface.** `mountSurface: 'wall'` mounts items flush against an
interior side wall (left or right, selected via `wallSide` on the instance).
Wall items extend inward from the wall surface and collide with interior
floor/ceiling items. Geometry assumption: the item's W dimension is its
depth off the wall (how far it sticks in), D is along the wall length, H is
height. X is pinned flush; Y/Z slide along the wall plane.

## Where to go next

Ideas worth adding as this grows:
- Other shell obstructions beyond the wheel wells (currently the only
  modeled floor obstruction besides the cab zone).
- Weight/CG tracking per component for axle-load estimates.
- A top-down 2D floor-plan view alongside the 3D one.
- A UI for browsing/loading MCP-saved variants (save/load/list already work
  via MCP; there's no in-app picker for them yet).
- Real engine/drivetrain geometry for the undercarriage plane, if it ever
  matters beyond the current cabDepth approximation.
- MCP Phase 2: WebSocket live-sync server (see the MCP section above).
