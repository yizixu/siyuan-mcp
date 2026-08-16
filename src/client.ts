import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';
import type { SiYuanResponse, Notebook, AVData, AVRenderResult, AVKeyOption } from './types';
import { generateId } from './utils';

// ─── Singleton ────────────────────────────────────────────────────────────────

let _client: SiYuanClient | null = null;

export function getClient(): SiYuanClient {
  if (!_client) {
    const token = process.env.SIYUAN_API_TOKEN || process.env.SIYUAN_TOKEN || '';
    if (!token) {
      throw new Error('SIYUAN_API_TOKEN environment variable is required. ' + 'Set it to your SiYuan API token (Settings > About > API token).');
    }
    const baseUrl = process.env.SIYUAN_API_URL || process.env.SIYUAN_BASE_URL || 'http://127.0.0.1:6806';
    _client = new SiYuanClient(baseUrl, token);
  }
  return _client;
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class SiYuanClient {
  private http: AxiosInstance;

  constructor(baseUrl: string, token: string) {
    this.http = axios.create({
      baseURL: baseUrl.replace(/\/$/, ''),
      headers: {
        Authorization: `Token ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 30_000
    });
  }

  private async post<T>(path: string, body: unknown = {}): Promise<T> {
    const res = await this.http.post<SiYuanResponse<T>>(path, body);
    const raw = res.data as unknown;
    // Several SiYuan write endpoints (and successful transactions with no
    // payload) reply with HTTP 200 and an empty body. Treat that as success.
    if (raw === '' || raw === null || raw === undefined) {
      return null as T;
    }
    const { code, msg, data } = raw as SiYuanResponse<T>;
    if (code !== 0) {
      throw new Error(`SiYuan API error [${code}]: ${msg || '(no message)'}`);
    }
    return data;
  }

  /**
   * Run a SiYuan transaction. Attribute-View mutations are NOT exposed as
   * working standalone `/api/av/*` endpoints in current SiYuan; they must go
   * through `/api/transactions` as `doOperations`.
   */
  private transaction(doOperations: Array<Record<string, unknown>>): Promise<unknown> {
    return this.post('/api/transactions', {
      session: generateId(),
      app: generateId(),
      reqId: Date.now(),
      transactions: [{ doOperations, undoOperations: [] }],
    });
  }

  // ─── Notebooks ──────────────────────────────────────────────────────────────

  lsNotebooks(): Promise<{ notebooks: Notebook[] }> {
    return this.post('/api/notebook/lsNotebooks');
  }

  renameNotebook(notebook: string, name: string): Promise<null> {
    return this.post('/api/notebook/renameNotebook', { notebook, name });
  }

  createNotebook(name: string): Promise<{ notebook: Notebook }> {
    return this.post('/api/notebook/createNotebook', { name });
  }

  // ─── Documents ──────────────────────────────────────────────────────────────

  createDocWithMd(notebook: string, path: string, markdown: string): Promise<string> {
    return this.post('/api/filetree/createDocWithMd', { notebook, path, markdown });
  }

  renameDocByID(id: string, title: string): Promise<null> {
    return this.post('/api/filetree/renameDocByID', { id, title });
  }

  removeDocByID(id: string): Promise<null> {
    return this.post('/api/filetree/removeDocByID', { id });
  }

  moveDocsByID(fromIDs: string[], toID: string): Promise<null> {
    return this.post('/api/filetree/moveDocsByID', { fromIDs, toID });
  }

  getHPathByID(id: string): Promise<string> {
    return this.post('/api/filetree/getHPathByID', { id });
  }

  getIDsByHPath(path: string, notebook: string): Promise<string[]> {
    return this.post('/api/filetree/getIDsByHPath', { path, notebook });
  }

  // ─── Blocks ─────────────────────────────────────────────────────────────────

  insertBlock(dataType: string, data: string, opts: { parentID?: string; previousID?: string; nextID?: string }): Promise<unknown> {
    return this.post('/api/block/insertBlock', { dataType, data, ...opts });
  }

  prependBlock(dataType: string, data: string, parentID: string): Promise<unknown> {
    return this.post('/api/block/prependBlock', { dataType, data, parentID });
  }

  appendBlock(dataType: string, data: string, parentID: string): Promise<unknown> {
    return this.post('/api/block/appendBlock', { dataType, data, parentID });
  }

  updateBlock(dataType: string, data: string, id: string): Promise<unknown> {
    return this.post('/api/block/updateBlock', { dataType, data, id });
  }

  deleteBlock(id: string): Promise<unknown> {
    return this.post('/api/block/deleteBlock', { id });
  }

  moveBlock(id: string, opts: { previousID?: string; parentID?: string }): Promise<unknown> {
    return this.post('/api/block/moveBlock', { id, ...opts });
  }

  getBlockKramdown(id: string): Promise<{ id: string; kramdown: string }> {
    return this.post('/api/block/getBlockKramdown', { id });
  }

  getChildBlocks(id: string): Promise<Array<{ id: string; type: string; subType?: string }>> {
    return this.post('/api/block/getChildBlocks', { id });
  }

  // ─── Attributes ─────────────────────────────────────────────────────────────

  setBlockAttrs(id: string, attrs: Record<string, string>): Promise<null> {
    return this.post('/api/attr/setBlockAttrs', { id, attrs });
  }

  getBlockAttrs(id: string): Promise<Record<string, string>> {
    return this.post('/api/attr/getBlockAttrs', { id });
  }

  // ─── SQL ────────────────────────────────────────────────────────────────────

  sql(stmt: string): Promise<Array<Record<string, unknown>>> {
    return this.post('/api/query/sql', { stmt });
  }

  flushTransaction(): Promise<null> {
    return this.post('/api/sqlite/flushTransaction');
  }

  // ─── Attribute View (Database) ──────────────────────────────────────────────

  /** Render a database view – returns paginated rows through the view lens */
  renderAV(
    id: string,
    opts: { viewID?: string; blockID?: string; pageSize?: number; page?: number } = {}
  ): Promise<AVRenderResult> {
    return this.post('/api/av/renderAttributeView', { id, ...opts });
  }

  /** Get raw AV object (all keys, all views, no row data) */
  async getAV(id: string): Promise<AVData> {
    const result = await this.post<{ av: AVData }>('/api/av/getAttributeView', { id });
    return result.av;
  }

  /**
   * Locate the block that embeds an Attribute View. The avID lives in the AV
   * block's DOM (`data-av-id`), not in the `attributes` table — SiYuan only
   * indexes `custom-avs` (on member blocks) and `custom-sy-av-view`.
   */
  async findAVBlock(avID: string): Promise<{ blockID: string; rootID: string } | null> {
    const query = async () =>
      (
        await this.sql(
          `SELECT id, root_id FROM blocks WHERE type = 'av' AND markdown LIKE '%${avID}%' LIMIT 1`
        )
      )[0];

    // SiYuan indexes into SQLite asynchronously, so a block created moments ago
    // may not be queryable yet; flush the pending transaction and look again.
    let row = await query();
    if (!row) {
      await this.flushTransaction();
      row = await query();
    }
    if (!row) return null;
    return { blockID: String(row.id), rootID: String(row.root_id) };
  }

  /**
   * Create a database the way SiYuan itself does: insert an empty
   * `NodeAttributeView` block and let the kernel materialise the AV JSON.
   * The kernel always writes its own `CurrentSpec`, so the file never carries
   * a spec this server invented — that is what keeps it working across
   * SiYuan releases. Returns the new avID plus the block that embeds it.
   */
  async createAV(parentDocID: string): Promise<{ avID: string; blockID: string; viewID: string }> {
    const avID = generateId();
    const blockID = generateId();
    const dom =
      `<div data-type="NodeAttributeView" data-av-id="${avID}" ` +
      `data-av-type="table" data-node-id="${blockID}"></div>`;
    await this.insertBlock('dom', dom, { parentID: parentDocID });
    // The AV JSON is written lazily on first render.
    const rendered = await this.renderAV(avID, { blockID });
    return { avID, blockID, viewID: rendered.view?.id ?? '' };
  }

  /** Rename a database. Kernel reads the avID from `id`, not `avID`. */
  setAVName(avID: string, name: string): Promise<unknown> {
    return this.transaction([{ action: 'setAttrViewName', id: avID, data: name }]);
  }

  /**
   * Search primary-key (title) texts of database rows.
   * Uses public `/api/av/getAttributeViewPrimaryKeyValues` — unlike full-text
   * block search, this matches individual row titles inside an Attribute View.
   */
  getAVPrimaryKeyValues(
    id: string,
    opts: { keyword?: string; page?: number; pageSize?: number } = {}
  ): Promise<{
    name?: string;
    blockIDs?: string[];
    rows?: {
      key?: { id?: string; name?: string; type?: string };
      values?: Array<{
        blockID?: string;
        block?: { id?: string; content?: string; updated?: number };
      }>;
    };
  }> {
    return this.post('/api/av/getAttributeViewPrimaryKeyValues', {
      id,
      keyword: opts.keyword ?? '',
      page: opts.page ?? 1,
      pageSize: opts.pageSize ?? 32,
    });
  }

  /**
   * Add new detached rows to a database, pre-filling their values.
   * The kernel adopts the row ID carried by each row's first value, so the IDs
   * are generated here and returned without having to look them up afterwards.
   */
  async appendAVRows(
    avID: string,
    blocksValues: Array<{
      content?: string;
      values: Array<Record<string, unknown>>;
    }>
  ): Promise<{ rowIDs: string[] }> {
    const av = await this.getAV(avID);
    const blockKeyID = av.keyValues.find((kv) => kv.key.type === 'block')?.key.id;
    if (!blockKeyID) throw new Error(`Database ${avID} has no primary (block) field`);

    const rowIDs = blocksValues.map(() => generateId());
    const payload = blocksValues.map((bv, idx) => [
      // Must come first: the kernel reads the row ID off this value.
      {
        keyID: blockKeyID,
        blockID: rowIDs[idx],
        type: 'block',
        isDetached: true,
        block: { id: rowIDs[idx], content: bv.content ?? '' },
      },
      ...bv.values.map((value) => ({ ...value, blockID: rowIDs[idx] })),
    ]);

    await this.post('/api/av/appendAttributeViewDetachedBlocksWithValues', {
      avID,
      blocksValues: payload,
    });
    return { rowIDs };
  }

  /** Remove rows from a database by row (block) ID */
  removeAVRows(avID: string, blockIDs: string[]): Promise<unknown> {
    return this.transaction([{ action: 'removeAttrViewBlock', avID, srcIDs: blockIDs }]);
  }

  /** Update a single cell value. `value` is the full AV value object (e.g. { type, mSelect }). */
  updateAVCell(
    avID: string,
    keyID: string,
    rowID: string,
    value: Record<string, unknown>
  ): Promise<unknown> {
    return this.transaction([{ action: 'updateAttrViewCell', avID, keyID, rowID, data: value }]);
  }

  /** Add a new field (column). Returns the generated key ID. */
  async addAVColumn(
    avID: string,
    keyType: string,
    keyName: string,
    previousKeyID?: string
  ): Promise<string> {
    const keyID = generateId();
    await this.transaction([
      {
        action: 'addAttrViewCol',
        avID,
        id: keyID, // kernel reads the new key id from `id`, not `keyID`
        name: keyName,
        type: keyType,
        ...(previousKeyID ? { previousID: previousKeyID } : {}),
      },
    ]);
    return keyID;
  }

  /** Remove a field (column). Kernel reads the key id from `id`. */
  removeAVColumn(avID: string, keyID: string): Promise<unknown> {
    return this.transaction([{ action: 'removeAttrViewCol', avID, id: keyID }]);
  }

  /** Rename a field (and keep its type). */
  updateAVColumn(avID: string, keyID: string, updates: { keyName?: string; keyType?: string }): Promise<unknown> {
    return this.transaction([
      {
        action: 'updateAttrViewCol',
        avID,
        id: keyID,
        name: updates.keyName ?? '',
        type: updates.keyType ?? 'text',
      },
    ]);
  }

  /**
   * Get the options of a select/mSelect field. Read from the AV itself —
   * SiYuan exposes no endpoint that returns a single key's options.
   */
  async getAVKeyOptions(avID: string, keyID: string): Promise<AVKeyOption[]> {
    const av = await this.getAV(avID);
    const key = av.keyValues.find((kv) => kv.key.id === keyID)?.key;
    if (!key) throw new Error(`Key ${keyID} not found in database ${avID}`);
    return key.options ?? [];
  }

  /**
   * Replace the options of a select/mSelect field.
   * `updateAttrViewColOptions` adds/updates and reorders but never deletes, so
   * options that dropped out of the list are removed explicitly.
   */
  async setAVKeyOptions(avID: string, keyID: string, options: AVKeyOption[]): Promise<unknown> {
    const existing = await this.getAVKeyOptions(avID, keyID);
    const keep = new Set(options.map((o) => o.name));
    const ops: Array<Record<string, unknown>> = [
      { action: 'updateAttrViewColOptions', avID, id: keyID, data: options },
    ];
    for (const old of existing) {
      if (!keep.has(old.name)) {
        ops.push({ action: 'removeAttrViewColOption', avID, id: keyID, data: old.name });
      }
    }
    return this.transaction(ops);
  }

  /**
   * Point an AV block at a specific view. `setAttrViewSorts`/`setAttrViewFilters`
   * resolve their target from the block's current view (they ignore any viewID
   * in the operation), so selecting the view first is the only supported way to
   * aim them — this is exactly what the SiYuan UI does when you switch tabs.
   */
  private selectAVBlockView(blockID: string, viewID: string): Promise<null> {
    return this.setBlockAttrs(blockID, { 'custom-sy-av-view': viewID });
  }

  /** Set sorts on the view currently shown by `blockID`. */
  setAVViewSorts(avID: string, blockID: string, sorts: unknown[]): Promise<unknown> {
    return this.transaction([{ action: 'setAttrViewSorts', avID, blockID, data: sorts }]);
  }

  /** Set filters on the view currently shown by `blockID`. */
  setAVViewFilters(avID: string, blockID: string, filters: unknown[]): Promise<unknown> {
    return this.transaction([{ action: 'setAttrViewFilters', avID, blockID, data: filters }]);
  }

  /** Add a new view. Returns its ID (the kernel adopts the one we pass in `id`). */
  async addAVView(
    avID: string,
    blockID: string,
    opts: { layout?: string; name?: string } = {}
  ): Promise<string> {
    const viewID = generateId();
    await this.transaction([
      {
        action: 'addAttrViewView',
        avID,
        id: viewID,
        blockID,
        ...(opts.layout ? { layout: opts.layout } : {}),
      },
    ]);
    if (opts.name) await this.setAVViewName(avID, viewID, opts.name);
    return viewID;
  }

  /** Remove a view. Kernel reads the view ID from `id`. */
  removeAVView(avID: string, viewID: string): Promise<unknown> {
    return this.transaction([{ action: 'removeAttrViewView', avID, id: viewID }]);
  }

  /** Rename a view. Kernel reads the view ID from `id` and the name from `data`. */
  setAVViewName(avID: string, viewID: string, name: string): Promise<unknown> {
    return this.transaction([{ action: 'setAttrViewViewName', avID, id: viewID, data: name }]);
  }

  /**
   * Rename a view and/or replace its sorts and filters.
   * Sorts/filters need the embedding block, so the view is selected on it first.
   */
  async updateAVView(
    avID: string,
    viewID: string,
    updates: { name?: string; sorts?: unknown[]; filters?: unknown[] }
  ): Promise<void> {
    if (updates.name) await this.setAVViewName(avID, viewID, updates.name);
    if (updates.sorts === undefined && updates.filters === undefined) return;

    const block = await this.findAVBlock(avID);
    if (!block) {
      throw new Error(
        `Database ${avID} is not embedded in any block, so its filters/sorts cannot be targeted`
      );
    }
    await this.selectAVBlockView(block.blockID, viewID);
    if (updates.sorts !== undefined) await this.setAVViewSorts(avID, block.blockID, updates.sorts);
    if (updates.filters !== undefined) {
      await this.setAVViewFilters(avID, block.blockID, updates.filters);
    }
  }

  /** Add existing document blocks as doc-backed (non-detached) rows */
  addAVBlocks(avID: string, blockIDs: string[], previousID?: string): Promise<unknown> {
    return this.transaction([
      {
        action: 'insertAttrViewBlock',
        avID,
        previousID: previousID ?? '',
        srcs: blockIDs.map((id) => ({ id, isDetached: false })),
      },
    ]);
  }

  // ─── File ───────────────────────────────────────────────────────────────────

  /** Write a file to the SiYuan workspace (path relative to workspace root) */
  async putFile(workspacePath: string, content: string | Buffer): Promise<void> {
    const form = new FormData();
    form.append('path', workspacePath);
    form.append('isDir', 'false');
    form.append('modTime', String(Math.floor(Date.now() / 1000)));
    const buf = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
    form.append('file', buf, { filename: 'file' });

    const res = await this.http.post<SiYuanResponse<null>>('/api/file/putFile', form, {
      headers: form.getHeaders()
    });
    if (res.data.code !== 0) {
      throw new Error(`SiYuan putFile error [${res.data.code}]: ${res.data.msg}`);
    }
  }

  /** Read a file from the SiYuan workspace */
  async getFile(workspacePath: string): Promise<string> {
    const res = await this.http.post<string>('/api/file/getFile', { path: workspacePath }, { responseType: 'text' });
    return res.data;
  }

  // ─── Assets ─────────────────────────────────────────────────────────────────

  /** Upload a binary asset; returns the SiYuan asset path */
  async uploadAsset(fileName: string, fileContent: Buffer, assetsDirPath = '/assets/'): Promise<{ errFiles: string[]; succMap: Record<string, string> }> {
    const form = new FormData();
    form.append('assetsDirPath', assetsDirPath);
    form.append('file[]', fileContent, { filename: fileName });

    const res = await this.http.post<SiYuanResponse<{ errFiles: string[]; succMap: Record<string, string> }>>('/api/asset/upload', form, { headers: form.getHeaders() });

    if (res.data.code !== 0) {
      throw new Error(`SiYuan upload error [${res.data.code}]: ${res.data.msg}`);
    }
    return res.data.data;
  }

  // ─── System ─────────────────────────────────────────────────────────────────

  version(): Promise<string> {
    return this.post('/api/system/version');
  }

  bootProgress(): Promise<{ progress: number; details: string }> {
    return this.post('/api/system/bootProgress');
  }

  /** Current server time in epoch milliseconds */
  currentTime(): Promise<number> {
    return this.post('/api/system/currentTime');
  }

  // ─── Notebooks (extended) ─────────────────────────────────────────────────────

  openNotebook(notebook: string): Promise<unknown> {
    return this.post('/api/notebook/openNotebook', { notebook });
  }

  closeNotebook(notebook: string): Promise<unknown> {
    return this.post('/api/notebook/closeNotebook', { notebook });
  }

  removeNotebook(notebook: string): Promise<unknown> {
    return this.post('/api/notebook/removeNotebook', { notebook });
  }

  getNotebookConf(
    notebook: string
  ): Promise<{ box: string; name: string; conf: Record<string, unknown> }> {
    return this.post('/api/notebook/getNotebookConf', { notebook });
  }

  setNotebookConf(notebook: string, conf: Record<string, unknown>): Promise<unknown> {
    return this.post('/api/notebook/setNotebookConf', { notebook, conf });
  }

  // ─── Blocks (extended) ────────────────────────────────────────────────────────

  foldBlock(id: string): Promise<unknown> {
    return this.post('/api/block/foldBlock', { id });
  }

  unfoldBlock(id: string): Promise<unknown> {
    return this.post('/api/block/unfoldBlock', { id });
  }

  // ─── Files (extended) ─────────────────────────────────────────────────────────

  /** Delete a file/folder inside the workspace (path relative to workspace root) */
  removeFile(path: string): Promise<null> {
    return this.post('/api/file/removeFile', { path });
  }

  /** Rename/move a file inside the workspace */
  renameFile(path: string, newPath: string): Promise<null> {
    return this.post('/api/file/renameFile', { path, newPath });
  }

  /** List the entries of a workspace directory */
  readDir(path: string): Promise<Array<{ name: string; isDir: boolean; isSymlink?: boolean; updated: number }>> {
    return this.post('/api/file/readDir', { path });
  }

  // ─── Export ───────────────────────────────────────────────────────────────────

  /** Export a document's standard Markdown (resolves refs/embeds). */
  exportMdContent(id: string): Promise<{ hPath: string; content: string }> {
    return this.post('/api/export/exportMdContent', { id });
  }

  // ─── Templates ────────────────────────────────────────────────────────────────

  /** Render a Sprig template string (dates, sequences, etc.) */
  renderSprig(template: string): Promise<string> {
    return this.post('/api/template/renderSprig', { template });
  }

  // ─── Convert ──────────────────────────────────────────────────────────────────

  /** Run a Pandoc conversion (requires Pandoc installed & enabled in SiYuan) */
  pandoc(args: string[], dir?: string): Promise<{ path: string }> {
    return this.post('/api/convert/pandoc', { args, ...(dir ? { dir } : {}) });
  }

  // ─── Notification ─────────────────────────────────────────────────────────────

  pushMsg(msg: string, timeout = 7000): Promise<{ id: string }> {
    return this.post('/api/notification/pushMsg', { msg, timeout });
  }

  pushErrMsg(msg: string, timeout = 7000): Promise<{ id: string }> {
    return this.post('/api/notification/pushErrMsg', { msg, timeout });
  }

  // ─── Network ──────────────────────────────────────────────────────────────────

  /** Forward an HTTP request through the SiYuan kernel (bypasses browser CORS). */
  forwardProxy(
    url: string,
    opts: {
      method?: string;
      payload?: unknown;
      headers?: Array<Record<string, string>>;
      contentType?: string;
      timeout?: number;
    } = {}
  ): Promise<{ status: number; body: string; contentType: string; headers: unknown }> {
    return this.post('/api/network/forwardProxy', {
      url,
      method: opts.method ?? 'GET',
      payload: opts.payload ?? '',
      headers: opts.headers ?? [],
      contentType: opts.contentType ?? 'application/json',
      timeout: opts.timeout ?? 7000,
    });
  }

  // ─── Search ───────────────────────────────────────────────────────────────────

  /** Full-text search across blocks. Returns matched blocks with the query highlighted. */
  fullTextSearchBlock(
    query: string,
    opts: { types?: Record<string, boolean>; method?: number; page?: number; groupBy?: number } = {}
  ): Promise<{ blocks: Array<Record<string, unknown>>; matchedBlockCount: number; matchedRootCount: number }> {
    return this.post('/api/search/fullTextSearchBlock', {
      query,
      method: opts.method ?? 0,
      page: opts.page ?? 1,
      ...(opts.types ? { types: opts.types } : {}),
      ...(opts.groupBy !== undefined ? { groupBy: opts.groupBy } : {}),
    });
  }
}
