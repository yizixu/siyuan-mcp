import { getAllTools, handleTool } from './tools/index';
import type { MCPToolResult, ToolDef, BatchBlockOp } from './types';

/**
 * Gateway layer: collapses the ~50 legacy tools into 5 meta tools
 * (discover / describe / execute_read / execute_write / execute_destructive).
 * Legacy tool modules stay untouched — each one is exposed as an "operation"
 * named `domain.action` with a risk level, and executed through the gateway
 * that matches its risk.
 */

export type Risk = 'read' | 'write' | 'destructive';

export const RISKS: Risk[] = ['read', 'write', 'destructive'];
export const DOMAINS = ['search', 'notebook', 'doc', 'block', 'db', 'file', 'system'] as const;

export type Domain = (typeof DOMAINS)[number];

interface JsonSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
}

export interface Operation {
  name: string;
  domain: Domain;
  risk: Risk;
  summary: string;
  description: string;
  inputSchema: JsonSchema;
  /** Suggested operation to run first (e.g. to obtain IDs the args need) */
  preflight: string | null;
  legacyTool: string;
  fixedArgs: Record<string, unknown>;
  /** Overrides `risk` based on the actual args (used by block.batch) */
  resolveRisk?: (args: Record<string, unknown>) => Risk;
}

// ─── Operation metadata ───────────────────────────────────────────────────────
// legacy tool name → [operation name, risk, summary, preflight?]

type OperationMeta = [name: string, risk: Risk, summary: string, preflight?: string];

const OPERATION_METADATA: Record<string, OperationMeta> = {
  // search
  search: ['search.fulltext', 'read', 'Full-text keyword search across titles, blocks AND database rows'],

  // notebooks
  list_notebooks: ['notebook.list', 'read', 'List all notebooks with ID, name, status'],
  create_notebook: ['notebook.create', 'write', 'Create a new notebook'],
  rename_notebook: ['notebook.rename', 'write', 'Rename a notebook', 'notebook.list'],
  get_notebook_conf: ['notebook.get_conf', 'read', "Get a notebook's configuration", 'notebook.list'],
  set_notebook_conf: ['notebook.set_conf', 'write', "Update a notebook's configuration", 'notebook.get_conf'],

  // documents
  create_document: ['doc.create', 'write', 'Create a document with optional Markdown content', 'notebook.list'],
  update_document: ['doc.update', 'write', 'Rename, replace content, or move a document', 'doc.export_markdown'],
  delete_document: ['doc.delete', 'destructive', 'Delete a document and all its blocks', 'doc.resolve_path'],
  export_doc_markdown: ['doc.export_markdown', 'read', 'Read a full document as clean Markdown'],
  resolve_doc_path: ['doc.resolve_path', 'read', 'Convert document ID ↔ human-readable path'],

  // blocks
  insert_block: ['block.insert', 'write', 'Insert a Markdown/DOM block at a position'],
  update_block: ['block.update', 'write', "Update a block's content", 'block.get_content'],
  delete_block: ['block.delete', 'destructive', 'Delete a block by ID', 'block.get_content'],
  batch_block_ops: ['block.batch', 'write', 'Run multiple block inserts/updates/deletes in one call (contains delete → destructive gateway)'],
  set_block_attrs: ['block.set_attrs', 'write', 'Set custom attributes on a block'],
  get_block_attrs: ['block.get_attrs', 'read', 'Get all attributes of a block'],
  get_block_content: ['block.get_content', 'read', 'Get raw Kramdown content of a block'],
  get_child_blocks: ['block.list_children', 'read', 'List direct child blocks of a container'],
  move_block: ['block.move', 'write', 'Move a block to a new parent/position'],
  fold_block: ['block.fold', 'write', 'Fold (collapse) or unfold a block'],

  // database (Attribute View)
  create_database: ['db.create', 'write', 'Create an Attribute View database, optionally embedded in a document'],
  read_database: ['db.read', 'read', 'Read a database: field definitions + rows, with filter/paging'],
  write_db_rows: ['db.add_rows', 'write', 'Add rows to a database (field name → value)', 'db.read'],
  update_db_cells: ['db.update_cells', 'write', 'Update cells across one or more rows', 'db.read'],
  delete_db_rows: ['db.delete_rows', 'destructive', 'Delete rows by block ID', 'db.read'],
  list_views: ['db.list_views', 'read', 'List database views with type, filters, sorts'],
  add_view: ['db.add_view', 'write', 'Add a table/kanban/gallery/calendar/list view'],
  update_view: ['db.update_view', 'write', 'Rename a view or set its filters/sorts', 'db.list_views'],
  delete_view: ['db.delete_view', 'destructive', 'Remove a view from a database', 'db.list_views'],
  list_select_options: ['db.list_select_options', 'read', 'List options of a select/mSelect field', 'db.read'],
  set_select_options: ['db.set_select_options', 'write', 'Replace options of a select/mSelect field', 'db.list_select_options'],
  bind_row_to_doc: ['db.bind_row_to_doc', 'write', 'Add existing documents as doc-backed rows', 'db.read'],
  create_doc_backed_row: ['db.create_doc_backed_row', 'write', 'Create a document and add it as a database row', 'notebook.list'],

  // files
  read_file: ['file.read', 'read', 'Read a raw workspace file by path'],
  write_file: ['file.write', 'write', 'Write/overwrite a raw workspace text file', 'file.read'],
  remove_file: ['file.remove', 'destructive', 'Delete a workspace file or folder', 'file.list_dir'],
  rename_file: ['file.rename', 'write', 'Rename/move a workspace file'],
  read_dir: ['file.list_dir', 'read', 'List entries of a workspace directory'],

  // system
  siyuan_sql: ['system.sql', 'read', "Read-only SQL query against SiYuan's SQLite (cannot see database rows)"],
  workspace_map: ['system.workspace_map', 'read', 'Overview: notebook IDs, document tree, database IDs'],
  upload_asset: ['system.upload_asset', 'write', 'Upload a file (base64) to the assets folder'],
  get_system_info: ['system.info', 'read', 'Get SiYuan version and boot progress'],
  get_current_time: ['system.time', 'read', "Get the server's current time"],
  push_message: ['system.push_message', 'write', 'Show a toast notification in the SiYuan UI'],
  render_sprig: ['system.render_sprig', 'read', 'Render a Sprig template string'],
  pandoc_convert: ['system.pandoc', 'write', "Run a Pandoc conversion via SiYuan's bundled Pandoc"],
  forward_proxy: ['system.forward_proxy', 'write', 'Server-side HTTP request through the SiYuan kernel'],
};

// Legacy tools with an enum "action" argument are split into one operation per
// action so each can carry its own risk level. `requiredExtra` marks arguments
// the legacy schema leaves optional but the action actually needs.
interface CompositeAction {
  meta: OperationMeta;
  requiredExtra?: string[];
}

interface CompositeSpec {
  argument: string;
  actions: Record<string, CompositeAction>;
}

const COMPOSITE_OPERATIONS: Record<string, CompositeSpec> = {
  manage_notebook: {
    argument: 'action',
    actions: {
      open: { meta: ['notebook.open', 'write', 'Open (mount) a notebook', 'notebook.list'] },
      close: { meta: ['notebook.close', 'write', 'Close (unmount) a notebook', 'notebook.list'] },
      remove: { meta: ['notebook.remove', 'destructive', 'Permanently delete a notebook (irreversible)', 'notebook.list'] },
    },
  },
  manage_db_fields: {
    argument: 'action',
    actions: {
      add: { meta: ['db.add_field', 'write', 'Add a field (column) to a database'], requiredExtra: ['fieldName', 'fieldType'] },
      rename: { meta: ['db.rename_field', 'write', 'Rename a database field', 'db.read'], requiredExtra: ['keyId', 'fieldName'] },
      remove: { meta: ['db.remove_field', 'destructive', 'Remove a database field and its cell data', 'db.read'], requiredExtra: ['keyId'] },
    },
  },
};

// ─── Registry ─────────────────────────────────────────────────────────────────

function publicInputSchema(schema: ToolDef['inputSchema'], omit: string[], requiredExtra: string[] = []): JsonSchema {
  const omitted = new Set(omit);
  const properties = Object.fromEntries(
    Object.entries(schema.properties).filter(([key]) => !omitted.has(key))
  );
  const required = [
    ...(schema.required ?? []).filter((key) => !omitted.has(key)),
    ...requiredExtra.filter((key) => !(schema.required ?? []).includes(key)),
  ];
  return { type: 'object', properties, ...(required.length ? { required } : {}) };
}

function batchRisk(args: Record<string, unknown>): Risk {
  const operations = (args.operations ?? []) as BatchBlockOp[];
  return Array.isArray(operations) && operations.some((op) => op?.action === 'delete')
    ? 'destructive'
    : 'write';
}

function makeOperation(
  def: ToolDef,
  meta: OperationMeta,
  fixedArgs: Record<string, unknown> = {},
  requiredExtra: string[] = []
): Operation {
  const [name, risk, summary, preflight] = meta;
  return {
    name,
    domain: name.split('.')[0] as Domain,
    risk,
    summary,
    description: def.description,
    inputSchema: publicInputSchema(def.inputSchema, Object.keys(fixedArgs), requiredExtra),
    preflight: preflight ?? null,
    legacyTool: def.name,
    fixedArgs,
    ...(def.name === 'batch_block_ops' ? { resolveRisk: batchRisk } : {}),
  };
}

function buildRegistry(): Record<string, Operation> {
  const defs = new Map(getAllTools().map((t) => [t.name, t]));
  const operations: Record<string, Operation> = {};
  const covered = new Set<string>();

  const register = (op: Operation) => {
    if (operations[op.name]) throw new Error(`Duplicate operation name: ${op.name}`);
    operations[op.name] = op;
  };

  for (const [legacyName, meta] of Object.entries(OPERATION_METADATA)) {
    const def = defs.get(legacyName);
    if (!def) throw new Error(`Missing legacy tool definition: ${legacyName}`);
    register(makeOperation(def, meta));
    covered.add(legacyName);
  }

  for (const [legacyName, composite] of Object.entries(COMPOSITE_OPERATIONS)) {
    const def = defs.get(legacyName);
    if (!def) throw new Error(`Missing composite legacy tool definition: ${legacyName}`);
    for (const [action, { meta, requiredExtra }] of Object.entries(composite.actions)) {
      register(makeOperation(def, meta, { [composite.argument]: action }, requiredExtra));
    }
    covered.add(legacyName);
  }

  const uncovered = [...defs.keys()].filter((name) => !covered.has(name));
  if (uncovered.length) {
    throw new Error(`Legacy tools without an operation mapping: ${uncovered.join(', ')}`);
  }
  return operations;
}

const operations = buildRegistry();

// ─── Discover ─────────────────────────────────────────────────────────────────

interface DiscoverArgs {
  query?: string;
  domain?: string;
  risk?: string;
  offset?: number;
  limit?: number;
}

function discoverOperations({ query = '', domain, risk, offset = 0, limit = 20 }: DiscoverArgs) {
  const needle = query.trim().toLowerCase();
  const matches = Object.values(operations)
    .filter((op) => !domain || op.domain === domain)
    .filter((op) => !risk || op.risk === risk)
    .filter((op) => {
      if (!needle) return true;
      const haystack = `${op.name} ${op.summary} ${op.description} ${op.domain} ${op.risk}`.toLowerCase();
      return needle.split(/\s+/).every((term) => haystack.includes(term));
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    total: matches.length,
    offset,
    hasMore: matches.length > offset + limit,
    operations: matches.slice(offset, offset + limit).map((op) => ({
      name: op.name,
      summary: op.summary,
      risk: op.risk,
    })),
    hint: 'Call siyuan_describe with an operation name to get its full input schema.',
  };
}

// ─── Describe ─────────────────────────────────────────────────────────────────

const EXAMPLE_VALUES: Record<string, unknown> = {
  query: '待办',
  notebookId: '20210817205410-2kvfpfn',
  avId: '20240101120000-abcdefg',
  id: '20240101120000-abcdefg',
  viewId: '20240101120000-abcdefg',
  keyId: '20240101120000-abcdefg',
  path: '/Projects/My Doc',
  newPath: '/data/new-name.txt',
  hpath: '/Projects/My Doc',
  name: 'My Database',
  markdown: '# Hello',
  data: 'New block content',
  content: 'file text content',
  attrs: { 'custom-status': 'done' },
  conf: { sortMode: 6 },
  stmt: "SELECT id, content, hpath FROM blocks WHERE type = 'd' LIMIT 10",
  fileName: 'screenshot.png',
  base64Content: 'iVBORw0KGgo...',
  message: 'Task finished',
  template: '{{now | date "2006-01-02"}}',
  url: 'https://example.com',
  args: ['-f', 'markdown', '-t', 'html'],
  fieldName: 'Status',
  fieldType: 'select',
  rows: [{ Name: 'Row 1', Status: 'Todo' }],
  updates: [{ rowId: '20240101120000-abcdefg', fieldName: 'Status', value: 'Done' }],
  rowIds: ['20240101120000-abcdefg'],
  blockIds: ['20240101120000-abcdefg'],
  options: [{ name: 'Done' }],
  operations: [{ action: 'append', parentID: '20240101120000-abcdefg', data: 'text' }],
};

function valueForSchema(schema: Record<string, unknown>, propertyName: string): unknown {
  if (Object.prototype.hasOwnProperty.call(EXAMPLE_VALUES, propertyName)) return EXAMPLE_VALUES[propertyName];
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  if (schema.type === 'object') return {};
  if (schema.type === 'array') return [];
  if (schema.type === 'integer' || schema.type === 'number') return 1;
  if (schema.type === 'boolean') return true;
  return propertyName;
}

function buildExample(schema: JsonSchema): Record<string, unknown> {
  const required = new Set(schema.required ?? []);
  const example: Record<string, unknown> = {};
  for (const [name, propSchema] of Object.entries(schema.properties)) {
    if (required.has(name)) {
      example[name] = valueForSchema(propSchema as Record<string, unknown>, name);
    }
  }
  return example;
}

function describeOperation(operationName: string) {
  const op = operations[operationName];
  if (!op) throw new Error(`Unknown operation: ${operationName}. Call siyuan_discover first.`);
  return {
    name: op.name,
    summary: op.summary,
    description: op.description,
    risk: op.risk,
    executeVia: `siyuan_execute_${op.risk}`,
    inputSchema: op.inputSchema,
    example: { operation: op.name, args: buildExample(op.inputSchema) },
    preflightOperation: op.preflight,
  };
}

// ─── Execute ──────────────────────────────────────────────────────────────────

function validateArgs(op: Operation, args: Record<string, unknown>): string | null {
  const known = new Set(Object.keys(op.inputSchema.properties));
  const unknown = Object.keys(args).filter((key) => !known.has(key));
  if (unknown.length) {
    return `Unknown argument(s) for ${op.name}: ${unknown.join(', ')}. Call siyuan_describe to see the schema.`;
  }
  const missing = (op.inputSchema.required ?? []).filter((key) => args[key] === undefined);
  if (missing.length) {
    return `Missing required argument(s) for ${op.name}: ${missing.join(', ')}. Call siyuan_describe to see the schema.`;
  }
  return null;
}

interface ExecuteArgs {
  operation: string;
  args?: Record<string, unknown>;
}

async function executeOperation(expectedRisk: Risk, { operation: operationName, args = {} }: ExecuteArgs): Promise<MCPToolResult> {
  const op = operations[operationName];
  if (!op) {
    return errResult(`Unknown operation: ${operationName}. Call siyuan_discover first.`);
  }
  const effectiveRisk = op.resolveRisk ? op.resolveRisk(args) : op.risk;
  if (effectiveRisk !== expectedRisk) {
    return errResult(
      `Operation ${operationName} has risk level "${effectiveRisk}" and must be called via siyuan_execute_${effectiveRisk}.`
    );
  }
  const validationError = validateArgs(op, args);
  if (validationError) return errResult(validationError);
  return handleTool(op.legacyTool, { ...args, ...op.fixedArgs });
}

function errResult(message: string): MCPToolResult {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

function jsonResult(value: unknown): MCPToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

// ─── Gateway tool definitions ─────────────────────────────────────────────────

const executeSchema: ToolDef['inputSchema'] = {
  type: 'object',
  properties: {
    operation: {
      type: 'string',
      description: 'Operation name returned by siyuan_discover (e.g. "db.read")',
    },
    args: {
      type: 'object',
      description: 'Arguments matching the inputSchema returned by siyuan_describe',
      additionalProperties: true,
    },
  },
  required: ['operation'],
};

export const gatewayTools: ToolDef[] = [
  {
    name: 'siyuan_discover',
    description:
      'Discover SiYuan capabilities by keyword, domain, or risk level. Returns operation names with a one-line summary. ' +
      `Domains: ${DOMAINS.join(', ')}. Risks: ${RISKS.join(', ')}. ` +
      'Typical flow: siyuan_discover → siyuan_describe → siyuan_execute_read/write/destructive.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyword(s), e.g. "database rows", "delete", "notebook"' },
        domain: { type: 'string', enum: [...DOMAINS], description: 'Restrict to one domain' },
        risk: { type: 'string', enum: RISKS, description: 'Restrict to one risk level' },
        offset: { type: 'number', description: 'Pagination offset (default: 0)' },
        limit: { type: 'number', description: 'Max results (default: 20)' },
      },
    },
  },
  {
    name: 'siyuan_describe',
    description:
      'Get the full input JSON Schema, an example call, the risk level, and the suggested preflight operation for one SiYuan operation.',
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', description: 'Operation name from siyuan_discover' },
      },
      required: ['operation'],
    },
  },
  {
    name: 'siyuan_execute_read',
    description:
      'Execute a read-only SiYuan operation (search, list, get, read, export). Rejects write and destructive operations.',
    inputSchema: executeSchema,
  },
  {
    name: 'siyuan_execute_write',
    description:
      'Execute a SiYuan write operation (create, insert, update, rename, move, upload). Rejects read-only and destructive operations.',
    inputSchema: executeSchema,
  },
  {
    name: 'siyuan_execute_destructive',
    description:
      'Execute a destructive SiYuan operation (delete document/block/rows/view/field/file, remove notebook, batch ops containing delete). ' +
      'Data may be unrecoverable — call only with explicit user intent.',
    inputSchema: executeSchema,
  },
];

export async function handleGatewayTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult> {
  try {
    switch (name) {
      case 'siyuan_discover':
        return jsonResult(discoverOperations(args as DiscoverArgs));
      case 'siyuan_describe':
        return jsonResult(describeOperation(String((args as { operation?: unknown }).operation ?? '')));
      case 'siyuan_execute_read':
        return executeOperation('read', args as unknown as ExecuteArgs);
      case 'siyuan_execute_write':
        return executeOperation('write', args as unknown as ExecuteArgs);
      case 'siyuan_execute_destructive':
        return executeOperation('destructive', args as unknown as ExecuteArgs);
      default:
        return errResult(`Unknown tool "${name}"`);
    }
  } catch (e) {
    return errResult(e instanceof Error ? e.message : String(e));
  }
}
