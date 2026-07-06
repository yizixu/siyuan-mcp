# siyuan-mcp

A comprehensive [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for [SiYuan Note](https://b3log.org/siyuan/), written in TypeScript.

## Features

- **Unified full-text `search`** — one keyword call finds document titles, block content, **and database rows**, and hands back the `avId` to drill in (plain SQL can't see database rows)
- **Full Attribute View (database) support** — create, read, write, update, delete databases and rows; manage fields, views, select options, and doc-backed rows
- **Document & block management** — create, update, delete, export, fold/unfold, move, and batch-edit documents and blocks
- **Full notebook lifecycle** — list, create, rename, open, close, remove, get/set config
- **Workspace file access** — read/write/remove/rename files and list directories in the workspace
- **SQL query** — direct access to SiYuan's SQLite via `siyuan_sql`
- **Utilities** — asset upload, Markdown export, Sprig rendering, Pandoc conversion, UI notifications, server-side HTTP proxy, workspace map
- **Pure HTTP** — no local workspace path required; works with local and remote SiYuan instances

---

## Installation

### Prerequisites

- [SiYuan Note](https://b3log.org/siyuan/) running (local or remote)
- Node.js 18+

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

### Search (start here to find things)

| Tool | Description |
|---|---|
| `search` | Full-text keyword search across titles, block content, **and database rows**; groups by document and returns the `avId` of any database hit so you can `read_database` it |

### System / Utility

| Tool | Description |
|---|---|
| `siyuan_sql` | Execute a read-only SQL query against SiYuan's SQLite (note: cannot see database/AV rows — use `search`/`read_database` for those) |
| `workspace_map` | Get all notebook IDs, document tree (2 levels), and database IDs |
| `upload_asset` | Upload a file (base64) to the workspace assets folder |
| `get_system_info` | Get SiYuan version and boot progress |
| `get_current_time` | Get the server's current time (epoch ms + ISO) |
| `push_message` | Show a toast notification in the SiYuan UI (info or error) |
| `render_sprig` | Render a Sprig template string (dates, sequences, etc.) |
| `pandoc_convert` | Run a Pandoc conversion via SiYuan's bundled Pandoc |
| `forward_proxy` | Make a server-side HTTP request through the kernel (avoids CORS) |

### Files (raw workspace access)

| Tool | Description |
|---|---|
| `read_file` | Read a raw workspace file by path |
| `write_file` | Write/overwrite a raw workspace text file |
| `remove_file` | Delete a workspace file or folder |
| `rename_file` | Rename/move a workspace file |
| `read_dir` | List entries of a workspace directory |

### Notebooks

| Tool | Description |
|---|---|
| `list_notebooks` | List all notebooks with ID, name, status |
| `create_notebook` | Create a new notebook |
| `rename_notebook` | Rename a notebook by ID |
| `manage_notebook` | Open, close, or remove (delete) a notebook |
| `get_notebook_conf` | Get a notebook's configuration |
| `set_notebook_conf` | Update a notebook's configuration |

### Documents

| Tool | Description |
|---|---|
| `create_document` | Create a document with optional Markdown content |
| `update_document` | Rename, replace content, or move a document |
| `delete_document` | Delete a document (with optional dryRun) |
| `export_doc_markdown` | Export a document as clean standard Markdown (resolves refs/embeds) |
| `resolve_doc_path` | Convert a document ID ↔ human-readable path |

### Blocks

| Tool | Description |
|---|---|
| `insert_block` | Insert a Markdown/DOM block (by parentID, previousID, or nextID) |
| `update_block` | Update a block's content |
| `delete_block` | Delete a block by ID |
| `move_block` | Move a block to a new parent/position |
| `fold_block` | Fold (collapse) or unfold (expand) a block |
| `batch_block_ops` | Execute multiple insert/update/delete block operations in one call |
| `set_block_attrs` | Set custom attributes on a block |
| `get_block_attrs` | Get all attributes of a block |
| `get_block_content` | Get raw Kramdown content of a block |
| `get_child_blocks` | List the direct child blocks of a container block |

### Database (Attribute View) — 14 tools

| Tool | Description |
|---|---|
| `create_database` | Create an AV database, optionally embedded in a document |
| `read_database` | Read a database: fields + all rows; supports filter and viewId |
| `write_db_rows` | Add one or more rows with field values |
| `update_db_cells` | Update cells across one or more rows |
| `delete_db_rows` | Delete rows by block ID |
| `manage_db_fields` | Add, remove, or rename fields (columns) |
| `list_views` | List database views with type, filters, sorts |
| `add_view` | Add a table, kanban, gallery, calendar, or list view |
| `update_view` | Rename, change type, set filters or sorts on a view |
| `delete_view` | Remove a view |
| `list_select_options` | List options for a select/mSelect field |
| `set_select_options` | Replace options for a select/mSelect field |
| `bind_row_to_doc` | Add existing documents as doc-backed rows |
| `create_doc_backed_row` | Create a document and add it as a database row |

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
search(query: "todo")
→ Returns matching blocks grouped by document.
  If a match is inside a database, the result lists its avId in
  `databasesFound`. Then:

read_database(avId: "<avId from search>")
→ Full structured rows of that to-do / task / table database.
```

> **Why not SQL?** `siyuan_sql` only sees the `blocks`/`attributes`/`spans`/`assets`
> tables — it can find a database *block* but **not the rows inside it**. Always
> use `search` (or `read_database`) to locate to-do items, tasks and table entries.

### Create a database with fields

```
1. create_document(notebookId, path: "/My Projects")
   → returns docId

2. create_database(name: "Tasks", parentDocId: docId,
     fields: [
       { name: "Status", type: "select", options: ["Todo", "In Progress", "Done"] },
       { name: "Due Date", type: "date" },
       { name: "Priority", type: "select", options: ["Low", "Medium", "High"] }
     ])
   → returns { avID, viewId }
```

### Add rows

```
write_db_rows(avId, rows: [
  { "Status": "Todo", "Due Date": "2024-12-31", "Priority": "High" },
  { "Status": "In Progress", "Due Date": "2024-12-15", "Priority": "Medium" }
])
```

### Query with SQL

```
siyuan_sql(stmt: "SELECT id, content, hpath FROM blocks WHERE type='d' AND content LIKE '%project%' LIMIT 20")
```

### Update a cell

```
update_db_cells(avId, updates: [
  { rowId: "20240101120000-abc1234", fieldName: "Status", value: "Done" }
])
```

### Get workspace overview

```
workspace_map()
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

The `create_database` tool writes this JSON file via the SiYuan HTTP file API (`/api/file/putFile`) — no local filesystem access required. All other AV operations use the official `/api/av/` HTTP endpoints.

---

## Development

```bash
npm run build      # Compile TypeScript → dist/
npm start          # Run compiled server
npm run dev        # Watch mode (re-compiles on change)
```

---

## License

MIT
