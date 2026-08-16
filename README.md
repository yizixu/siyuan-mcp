# siyuan-mcp

A comprehensive [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for [SiYuan Note](https://b3log.org/siyuan/), written in TypeScript.

## Features

- **5-tool gateway** — instead of ~50 flat tools, the server exposes just `siyuan_discover` / `siyuan_describe` / `siyuan_execute_read` / `siyuan_execute_write` / `siyuan_execute_destructive`. Capabilities are discovered on demand, keeping the MCP client's context small, and destructive operations are isolated behind their own gateway
- **Unified full-text search** — one keyword call finds document titles, block content, **and database rows**, and hands back the `avId` to drill in (plain SQL can't see database rows)
- **Full Attribute View (database) support** — create, read, write, update, delete databases and rows; manage fields, views, select options, and doc-backed rows; **`db.find_rows`** searches primary-key titles via kernel API (better than full-text for task dedupe)
- **Document & block management** — create, update, delete, export, fold/unfold, move, and batch-edit; **`doc.append`** adds Markdown without wiping children; **`doc.update`** preserves Attribute View embeds unless `force: true`

- **Full notebook lifecycle** — list, create, rename, open, close, remove, get/set config
- **Workspace file access** — read/write/remove/rename files and list directories in the workspace
- **SQL query** — direct access to SiYuan's SQLite via `siyuan_sql`
- **Utilities** — asset upload, Markdown export, Sprig rendering, Pandoc conversion, UI notifications, server-side HTTP proxy, workspace map
- **Pure HTTP** — no local workspace path required; works with local and remote SiYuan instances

---

## Installation

### Prerequisites

- [SiYuan Note](https://b3log.org/siyuan/) **3.8.0 or newer**, running (local or remote)
- Node.js 18+

Older SiYuan releases are not supported: 3.8.0 raised the Attribute View storage
format (`spec` 5 → 7) and a kernel refuses to open databases written by a newer
one, so mixing versions breaks database access regardless of this server.

### From npm

Run directly with `npx`:

```bash
npx @yizixu/siyuan-mcp
```

Or install globally:

```bash
npm install -g @yizixu/siyuan-mcp
siyuan-mcp
```

### From source

```bash
git clone https://github.com/yizixu/siyuan-mcp.git
cd siyuan-mcp
npm install
npm run build
```

### Get your API token

In SiYuan: **Settings → About → API token** → copy.

---

## Configuration

| Environment Variable | Required | Description |
|---|---|---|
| `SIYUAN_API_TOKEN` | **Yes** | SiYuan API token |
| `SIYUAN_API_URL` | No | Base URL (default: `http://127.0.0.1:6806`) |

Copy `.env.example` to `.env` and fill in your token, or set environment variables directly.

---

## MCP Client Setup

### Claude Desktop / Cursor

Using npm:

```json
{
  "mcpServers": {
    "siyuan": {
      "command": "npx",
      "args": ["-y", "@yizixu/siyuan-mcp"],
      "env": {
        "SIYUAN_API_TOKEN": "your-token-here"
      }
    }
  }
}
```

Using a local source checkout:

```json
{
  "mcpServers": {
    "siyuan": {
      "command": "node",
      "args": ["/absolute/path/to/siyuan-mcp/dist/index.js"],
      "env": {
        "SIYUAN_API_TOKEN": "your-token-here"
      }
    }
  }
}
```

For remote SiYuan:

```json
{
  "env": {
    "SIYUAN_API_TOKEN": "your-token-here",
    "SIYUAN_API_URL": "http://192.168.1.100:6806"
  }
}
```

---

## Tool Reference

The server exposes **5 gateway tools**. All actual capabilities are *operations* named `domain.action`, discovered and executed through the gateway:

| Tool | Description |
|---|---|
| `siyuan_discover` | Find operations by keyword, domain, or risk level. Returns name + one-line summary + risk |
| `siyuan_describe` | Get one operation's full input JSON Schema, an example call, and its suggested preflight operation |
| `siyuan_execute_read` | Execute a read-only operation (search, list, get, read, export) |
| `siyuan_execute_write` | Execute a write operation (create, insert, update, rename, move, upload) |
| `siyuan_execute_destructive` | Execute a destructive operation (delete/remove). Isolated so MCP clients can gate it separately |

Typical flow:

```
siyuan_discover(query: "database rows")
→ [{ name: "db.add_rows", risk: "write", ... }]

siyuan_describe(operation: "db.add_rows")
→ { inputSchema, example, executeVia: "siyuan_execute_write", preflightOperation: "db.read" }

siyuan_execute_write(operation: "db.add_rows", args: { avId, rows: [...] })
```

### Operation Catalog (56 operations)

**search / system**

| Operation | Risk | Description |
|---|---|---|
| `search.fulltext` | read | Full-text keyword search across titles, blocks **and database rows**; returns `avId` for database hits |
| `system.sql` | read | Read-only SQL against SiYuan's SQLite (cannot see database/AV rows — use `search.fulltext` / `db.read`) |
| `system.workspace_map` | read | All notebook IDs, document tree (2 levels), database IDs |
| `system.info` / `system.time` | read | SiYuan version / server time |
| `system.render_sprig` | read | Render a Sprig template string |
| `system.upload_asset` | write | Upload a file (base64) to the assets folder |
| `system.push_message` | write | Show a toast notification in the SiYuan UI |
| `system.pandoc` | write | Run a Pandoc conversion |
| `system.forward_proxy` | write | Server-side HTTP request through the kernel |

**notebook**

| Operation | Risk | Description |
|---|---|---|
| `notebook.list` | read | List all notebooks |
| `notebook.get_conf` | read | Get a notebook's configuration |
| `notebook.create` / `notebook.rename` / `notebook.set_conf` | write | Create / rename / configure |
| `notebook.open` / `notebook.close` | write | Mount / unmount |
| `notebook.remove` | destructive | Permanently delete a notebook |

**doc**

| Operation | Risk | Description |
|---|---|---|
| `doc.export_markdown` | read | Read a full document as clean Markdown |
| `doc.resolve_path` | read | Convert document ID ↔ human-readable path |
| `doc.create` / `doc.append` | write | Create / append Markdown (append never deletes children) |
| `doc.update` | write | Rename / replace content (preserves AV embeds unless `force`) / move |
| `doc.delete` | destructive | Delete a document (supports dryRun) |

**block**

| Operation | Risk | Description |
|---|---|---|
| `block.get_content` / `block.get_attrs` / `block.list_children` | read | Read Kramdown / attributes / children |
| `block.insert` / `block.update` / `block.move` / `block.fold` / `block.set_attrs` | write | Edit blocks |
| `block.batch` | write* | Multiple ops in one call; *requires the destructive gateway if any op is a delete |
| `block.delete` | destructive | Delete a block |

**db (Attribute View)**

| Operation | Risk | Description |
|---|---|---|
| `db.read` | read | Field definitions + rows, with filter/paging |
| `db.find_rows` | read | Search rows by primary-key keyword (title); returns row IDs + labels |
| `db.list_views` / `db.list_select_options` | read | List views / select options |
| `db.create` / `db.add_rows` / `db.update_cells` | write | Create database / add rows / update cells |
| `db.add_field` / `db.rename_field` | write | Manage columns |
| `db.add_view` / `db.update_view` | write | Manage views |
| `db.set_select_options` | write | Replace select/mSelect options |
| `db.bind_row_to_doc` / `db.create_doc_backed_row` | write | Doc-backed rows |
| `db.delete_rows` / `db.delete_view` / `db.remove_field` | destructive | Delete rows / views / columns |

**file (raw workspace access)**

| Operation | Risk | Description |
|---|---|---|
| `file.read` / `file.list_dir` | read | Read a file / list a directory |
| `file.write` / `file.rename` | write | Write / rename-move |
| `file.remove` | destructive | Delete a file or folder |

---

## Supported AV Field Types

| Type | Description |
|---|---|
| `text` | Plain text |
| `number` | Numeric value |
| `checkbox` | Boolean |
| `select` | Single-select (one option) |
| `mSelect` | Multi-select (multiple options) |
| `date` | Date/datetime (Unix ms timestamp or ISO string) |
| `url` | URL |
| `email` | Email address |
| `phone` | Phone number |
| `mAsset` | Multi-asset (files/images) |
| `relation` | Relation to another AV |
| `rollup` | Rollup/computed from relation |

Read-only / system types: `block`, `created`, `updated`, `lineNumber`, `template`

---

## Quick Start Workflows

### Find anything (search first!)

```
siyuan_execute_read(operation: "search.fulltext", args: { query: "todo" })
→ Returns matching blocks grouped by document.
  If a match is inside a database, the result lists its avId in
  `databasesFound`. Then:

siyuan_execute_read(operation: "db.read", args: { avId: "<avId from search>" })
→ Full structured rows of that to-do / task / table database.
```

> **Why not SQL?** `system.sql` only sees the `blocks`/`attributes`/`spans`/`assets`
> tables — it can find a database *block* but **not the rows inside it**. Always
> use `search.fulltext` to find docs/blocks, `db.find_rows` for titles inside a known database, or `db.read` for full rows.

### Create a database with fields

```
1. siyuan_execute_write(operation: "doc.create",
     args: { notebookId, path: "/My Projects" })
   → returns docId

2. siyuan_execute_write(operation: "db.create",
     args: { name: "Tasks", parentDocId: docId,
       fields: [
         { name: "Status", type: "select", options: ["Todo", "In Progress", "Done"] },
         { name: "Due Date", type: "date" },
         { name: "Priority", type: "select", options: ["Low", "Medium", "High"] }
       ] })
   → returns { avID, viewId, embeddedBlockId, primaryFieldId, fields }
```

`parentDocId` is required — a database lives inside a document block.

### Add rows / update cells

```
siyuan_execute_write(operation: "db.add_rows", args: { avId, rows: [
  { "Status": "Todo", "Due Date": "2024-12-31", "Priority": "High" }
] })

siyuan_execute_write(operation: "db.update_cells", args: { avId, updates: [
  { rowId: "20240101120000-abc1234", fieldName: "Status", value: "Done" }
] })
```

### Query with SQL / workspace overview

```
siyuan_execute_read(operation: "system.sql",
  args: { stmt: "SELECT id, content, hpath FROM blocks WHERE type='d' LIMIT 20" })

siyuan_execute_read(operation: "system.workspace_map", args: {})
→ Returns all notebook IDs, document paths, and database IDs as Markdown
```

---

## Default View Convention

SiYuan's `renderAttributeView` renders data through a view lens — filtered views can hide rows. This server automatically prefers a view named **"Default"** (case-insensitive) when no `viewId` is specified, ensuring unfiltered access.

**Recommendation**: Create a view named `Default` (no filters) in each database you access programmatically.

---

## How Databases Work

SiYuan Attribute Views are stored as JSON files at:
`{workspace}/data/storage/av/{avID}.json`

That JSON carries a `spec` version, and a kernel refuses to open an AV whose spec is newer than its own (`无法打开新版本创建的数据库视图`). This server therefore never writes those files itself: `db.create` inserts an empty database block and lets the kernel materialise the AV, so it is always stamped with the running SiYuan's spec. Reads go through `/api/av/*` and writes through `/api/transactions`.

If a database fails to open with that message, the data was written by a **newer SiYuan than the one serving this API** (e.g. synced from a device that updated first) — update SiYuan on this machine to match. Keep every device on the same major version; the format only moves forward.

---

## Development

```bash
npm run build      # Compile TypeScript → dist/
npm start          # Run compiled server
npm run dev        # Watch mode (re-compiles on change)
```

### Release

Publishing to npm is automated via `.github/workflows/publish.yml`:

```bash
npm version patch   # or minor / major — bumps package.json and creates a git tag
git push && git push --tags
```

Pushing a tag matching `v*.*.*` triggers the workflow (check → build → publish with provenance).
Auth uses [npm trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC) — no token secret needed;
the GitHub Actions publisher is registered in the package's settings on npmjs.com.

---

## License

MIT
