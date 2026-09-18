# Van Build Checklist — Import Format

This is the exchange format for handing a parts list to the van-builder MCP
server's `import_checklist` tool. If you're an AI instance that has been
tracking build items in conversation, format everything you know as **one
Markdown table** using this spec, then hand the whole table (or the whole
message) to the user to paste into the van-builder project chat.

`import_checklist` will: match each row against the existing component
catalog by exact name (case-insensitive) and update it, or create a new
catalog component if nothing matches; then place enough instances to reach
the row's Qty. It's safe to re-run as your list grows — it won't duplicate
instances already at their target Qty.

## Table format

```markdown
| Category | Item | Qty | W | D | H | MountSurface | Cost | Status | InventoryStatus | Tags | Vendor | OrderUrl | OrderDate | URL | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| electrical | Lithium Battery (100Ah) | 2 | | | | | 450 | final | owned | electrical, fait | Amazon | | 2024-01-15 | | Existing catalog match, just tracking qty/cost |
| appliance | Isotherm CR85 Fridge | 1 | 20.7 | 18.1 | 20.7 | floor | 899 | final | ordered | kitchen, capture | | | | | Replaces generic 12V Compressor Fridge |
| plumbing | Grey water dump valve | 1 | TBD | TBD | TBD | underbody | TBD | placeholder | proposed | plumbing | | | | | Need to pick a model |
```

- **Column order doesn't matter** and columns can be omitted — the importer
  matches headers by name (case-insensitive: "Item"/"Name", "W"/"Width",
  "D"/"Depth"/"Length", "H"/"Height", "MountSurface"/"Mount", "Cost"/"Price",
  etc). Only **Category** and **Item** are required to exist as columns.
- **Unknown values**: leave the cell blank or write `TBD`. Don't guess a
  number just to fill the cell — that's what `placeholder` status is for.
- Multiple tables in one document are fine (e.g. one per system/section) —
  each new header row (immediately followed by a `---` separator row) starts
  a fresh column mapping.
- Keep **Notes** free of the `|` character (it'll break the row).

## Column reference

| Column | Required | Values |
|---|---|---|
| `Category` | yes | one of: `structure`, `bed`, `seating`, `kitchen`, `sink`, `vanity`, `shower`, `toilet`, `storage`, `cabinet`, `appliance`, `electrical`, `water`, `plumbing`, `lighting`, `roof`, `other` |
| `Item` | yes | Display name. If it names an existing catalog part (see below), match that name **exactly** so it's recognized as the same part rather than creating a duplicate. Otherwise use a specific, final-sounding name (brand/model when known) — this becomes the permanent name once Status is `final`. |
| `Qty` | no (default 1) | How many instances of this exact item are needed. |
| `W` / `D` / `H` | no | Footprint in millimeters (mm) at rotation 0 — W = across the van's width, D = along its length, H = up. Legacy templates that listed inches are ×25.4 now. Leave `TBD` if not known yet; the importer will create a ~305×305×305 mm placeholder and flag it. |
| `MountSurface` | no (default `floor`) | `floor`, `roof` (roof-mounted gear), `underbody` (frame-mounted, e.g. tanks), `door` (rear door), `ceiling` (ceiling-hung), or `wall` (side wall mount). |
| `Cost` | no | Estimated unit cost in USD, plain number (no `$`/commas needed, they're stripped). `TBD` if unknown. |
| `Status` | no (inferred) | `final` once name + dims + cost are all locked in, otherwise `placeholder`. If omitted, the importer infers it from whether dims/cost are filled in. |
| `InventoryStatus` | no (inferred) | `proposed` (planning), `ordered` (awaiting delivery), `owned` (in hand), `placed` (installed), or `superseded` (replaced). New items without this field default to `proposed` if placeholder, else `owned` if placed, else `proposed`. |
| `Tags` | no | Comma-separated tags for filtering. Suggested: `fait`, `capture`, `structural`, `electrical`, `plumbing`, `kitchen`, `furniture`, `exterior`, `consumable`. Any string is accepted. |
| `Vendor` | no | Vendor/supplier name (Amazon, Home Depot, etc.). |
| `OrderUrl` | no | Actual order/receipt URL if different from the spec/buy link. |
| `OrderDate` | no | ISO date string (YYYY-MM-DD) when ordered. |
| `URL` | no | Product / spec-sheet link (Amazon listing, manufacturer page). Header aliases: `Link`. Shows as a clickable link in the app's catalog sheet view. |
| `Notes` | no | Anything relevant — wiring/plumbing dependencies, model links, install order, why this replaces a stock catalog part, etc. |

## Existing starter catalog (44 parts)

Match these names **exactly** (case-insensitive) if your list item is the
same physical thing — the importer reuses the existing part (updating its
cost/status/dims if you supply them) instead of creating a duplicate.

**Structure/sleeping/seating:** Platform Bed (Queen Short), Fixed Bench/Dinette Bed, Swivel Cab Seat

**Kitchen/bath:** Galley Kitchen Block, Round Bar Sink (15"), Rect. Kitchen Sink (20x16), Bathroom Vanity Cabinet, Wet Bath Shower Pan (32x32), Cassette Toilet

**Cabinetry/storage:** Upper Cabinet, Base Cabinet, Overhead Storage Cubby, Under-Bed Garage Bin, Underbody Accessory Box

**Appliances:** 12V Compressor Fridge, Diesel Heater Unit

**Water/plumbing:** Fresh Water Tank (20gal), Grey Water Tank (20gal), Fresh Water Tank — Underbody (30gal), Grey Water Tank — Underbody (30gal), Water Pump (Demand Pump), Tankless Water Heater, Kitchen Faucet, Bathroom Faucet, Shower Mixer/Head, Inline Water Filter, City Water Inlet

**Electrical:** Battery/Electrical Box, Shore Power Inlet Panel, Lithium Battery (100Ah), Inverter/Charger (2000W), DC-DC Charger, Solar Charge Controller, 12V Fuse/Breaker Panel, Battery Monitor / Shunt

**Lighting:** LED Puck Light, LED Strip Light (36"), Reading Light, Awning/Porch Light

**Roof:** Solar Panel (100W), Starlink (Flat High Performance), Roof Vent/Fan (14x14), Roof A/C Unit, Roof Rack Cargo Box

If your list item is a specific model of one of these (e.g. a named fridge
brand instead of the generic "12V Compressor Fridge"), give it its own
distinct name — the importer will create it as a new catalog entry rather
than overwrite the generic placeholder. Mention the replacement in Notes if
the generic one should eventually be removed.

## After import

`import_checklist` returns a `needsInput` list — every row still missing
dims, cost, or final status. The assistant handling the import should walk
that list with the user (grouped a few at a time) to fill in the gaps, then
call `update_def` to lock each one in as `final`. Call `export_checklist`
any time to get the current state back out in this same format — that's
the running "what have we covered" blueprint.
