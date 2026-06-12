// ─── SiYuan API ───────────────────────────────────────────────────────────────

export interface SiYuanResponse<T = unknown> {
  code: number;
  msg: string;
  data: T;
}

export interface Notebook {
  id: string;
  name: string;
  icon: string;
  sort: number;
  closed: boolean;
}

// ─── Attribute View (Database) Types ─────────────────────────────────────────

export type AVFieldType =
  | 'block'
  | 'text'
  | 'number'
  | 'checkbox'
  | 'select'
  | 'mSelect'
  | 'date'
  | 'url'
  | 'email'
  | 'phone'
  | 'mAsset'
  | 'relation'
  | 'rollup'
  | 'created'
  | 'updated'
  | 'lineNumber'
  | 'template';

export type AVViewType = 'table' | 'kanban' | 'gallery' | 'calendar' | 'list';

export interface AVKeyOption {
  name: string;
  color: string;
}

export interface AVKey {
  id: string;
  name: string;
  type: AVFieldType;
  icon?: string;
  options?: AVKeyOption[];
  numberFormat?: string;
  template?: string;
  date?: { autoFillNow?: boolean };
  relation?: {
    avID: string;
    isTwoWay: boolean;
    backKeyID?: string;
    backKeyName?: string;
  };
  rollup?: {
    keyID: string;
    relKeyID: string;
    calc?: { operator: string };
  };
}

export interface AVColumn {
  id: string;
  width?: string;
  hidden?: boolean;
  pin?: boolean;
  wrap?: boolean;
  calc?: null | { operator: string; result?: unknown };
}

export interface AVSort {
  column: string;
  order: 'ASC' | 'DESC';
}

export interface AVFilter {
  column: string;
  operator: string;
  value?: unknown;
}

export interface AVView {
  id: string;
  name: string;
  type: AVViewType;
  icon?: string;
  columns?: AVColumn[];
  sorts?: AVSort[];
  filters?: AVFilter[];
  pageSize?: number;
  group?: Array<{ column: string }>;
  blockCount?: number;
}

export interface AVKeyValue {
  key: AVKey;
  values: AVCellValue[];
}

export interface AVCellValue {
  id?: string;
  keyID: string;
  blockID?: string;
  type: AVFieldType;
  block?: { id: string; content: string; created: number; updated: number };
  text?: { content: string };
  number?: { content: number; isNotEmpty: boolean; format?: string };
  date?: { content: number; isNotEmpty: boolean; content2?: number; hasEndDate?: boolean };
  checkbox?: { checked: boolean };
  select?: { content: string };
  mSelect?: Array<{ content: string }>;
  url?: { content: string };
  email?: { content: string };
  phone?: { content: string };
  mAsset?: Array<{ type: string; name: string; content: string }>;
  relation?: { contents: Array<{ id: string; content?: string }> };
  rollup?: { contents: unknown[] };
  created?: { content: number; isNotEmpty: boolean };
  updated?: { content: number; isNotEmpty: boolean };
  lineNumber?: { isNotEmpty: boolean };
  template?: { content: string };
}

export interface AVData {
  id: string;
  name: string;
  keyValues: AVKeyValue[];
  views: AVView[];
}

export interface AVRenderRow {
  id: string;
  cells: AVCellValue[];
}

export interface AVRenderResult {
  id: string;
  name: string;
  viewType: AVViewType;
  views: Array<{ id: string; name: string; type: AVViewType; icon?: string }>;
  view: AVView & {
    rows: AVRenderRow[];
    blockCount: number;
  };
}

// ─── MCP ─────────────────────────────────────────────────────────────────────

export interface MCPToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolModule {
  tools: ToolDef[];
  handle: (name: string, args: Record<string, unknown>) => Promise<MCPToolResult>;
}

// ─── Misc ─────────────────────────────────────────────────────────────────────

export interface BatchBlockOp {
  action: 'insertBefore' | 'insertAfter' | 'append' | 'prepend' | 'update' | 'delete';
  /** Required for update/delete */
  id?: string;
  /** Required for insert/update */
  data?: string;
  /** 'markdown' (default) or 'dom' */
  dataType?: string;
  /** Required for append/prepend */
  parentID?: string;
  /** Anchor for insertAfter */
  previousID?: string;
  /** Anchor for insertBefore */
  nextID?: string;
}
