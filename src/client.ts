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
  renderAV(id: string, opts: { viewID?: string; pageSize?: number; page?: number } = {}): Promise<AVRenderResult> {
    return this.post('/api/av/renderAttributeView', { id, ...opts });
  }

  /** Get raw AV object (all keys, all views, no row data) */
  async getAV(id: string): Promise<AVData> {
    const result = await this.post<{ av: AVData }>('/api/av/getAttributeView', { id });
    return result.av;
  }

  /**
   * Add new detached rows to a database, optionally pre-filling values.
   * Each row becomes an `insertAttrViewBlock` op (detached) plus one
   * `updateAttrViewCell` op per value, all in a single transaction.
   */
  async appendAVRows(
    avID: string,
    blocksValues: Array<{
      content?: string;
      values: Array<Record<string, unknown>>;
    }>
  ): Promise<{ rowIDs: string[] }> {
    const blockKeyValues = (av: AVData) =>
      av.keyValues.find((kv) => kv.key.type === 'block')?.values ?? [];

    // insertAttrViewBlock assigns its own row id (ignoring any we pass) and does
    // not return it, so we diff the row set before/after to learn the new ids.
    const before = blockKeyValues(await this.getAV(avID));
    const beforeIDs = new Set(before.map((v) => v.blockID));

    const insertOps = blocksValues.map((bv) => ({
      action: 'insertAttrViewBlock',
      avID,
      previousID: '',
      srcs: [{ id: generateId(), isDetached: true, content: bv.content ?? '' }],
    }));
    await this.transaction(insertOps);

    const after = blockKeyValues(await this.getAV(avID));
    const newRows = after.filter((v) => !beforeIDs.has(v.blockID));

    // Map each input row to an actual new row id: prefer matching by content,
    // falling back to positional order for blank/duplicate titles.
    const claimed = new Set<string>();
    const rowIDs = blocksValues.map((bv, idx) => {
      const wantContent = bv.content ?? '';
      let match = wantContent
        ? newRows.find((v) => !claimed.has(v.blockID!) && v.block?.content === wantContent)
        : undefined;
      if (!match) match = newRows.find((v) => !claimed.has(v.blockID!)) ?? newRows[idx];
      if (match?.blockID) claimed.add(match.blockID);
      return match?.blockID ?? '';
    });

    const cellOps: Array<Record<string, unknown>> = [];
    blocksValues.forEach((bv, idx) => {
      const rowID = rowIDs[idx];
      if (!rowID) return;
      for (const value of bv.values) {
        cellOps.push({
          action: 'updateAttrViewCell',
          avID,
          keyID: (value as { keyID?: string }).keyID,
          rowID,
          data: value,
        });
      }
    });
    if (cellOps.length) await this.transaction(cellOps);
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

  /** Get options list for a select/mSelect field */
  getAVKeyOptions(avID: string, keyID: string): Promise<{ options: AVKeyOption[] }> {
    return this.post('/api/av/getAttributeViewKeyOptions', { id: avID, keyID });
  }

  /**
   * Set/replace options for a select/mSelect field by editing the AV JSON
   * directly (no transaction op exists for this). Note: options are also
   * auto-created when a cell is written with a new option value.
   */
  async setAVKeyOptions(avID: string, keyID: string, options: AVKeyOption[]): Promise<unknown> {
    const path = `/data/storage/av/${avID}.json`;
    const av = JSON.parse(await this.getFile(path));
    const kv = (av.keyValues as Array<{ key: { id: string; options?: AVKeyOption[] } }>).find(
      (k) => k.key.id === keyID
    );
    if (!kv) throw new Error(`Key ${keyID} not found in AV ${avID}`);
    kv.key.options = options;
    await this.putFile(path, JSON.stringify(av));
    // Re-render so the kernel reloads the AV from disk.
    return this.renderAV(avID);
  }

  /** Set sorts on a view */
  setAVViewSorts(avID: string, viewID: string, sorts: unknown[]): Promise<unknown> {
    return this.transaction([{ action: 'setAttrViewSorts', avID, viewID, data: sorts }]);
  }

  /** Set filters on a view */
  setAVViewFilters(avID: string, viewID: string, filters: unknown[]): Promise<unknown> {
    return this.transaction([{ action: 'setAttrViewFilters', avID, viewID, data: filters }]);
  }

  /** Add a new view to a database (best-effort). */
  addAVView(avID: string, viewType?: string, _viewName?: string): Promise<unknown> {
    return this.transaction([
      { action: 'addAttrViewView', avID, ...(viewType ? { layout: viewType } : {}) },
    ]);
  }

  /** Remove a view */
  removeAVView(avID: string, viewID: string): Promise<unknown> {
    return this.transaction([{ action: 'removeAttrViewView', avID, viewID }]);
  }

  /** Rename a view */
  updateAVView(avID: string, viewID: string, opts: { name?: string }): Promise<unknown> {
    if (!opts.name) return Promise.resolve(null);
    return this.transaction([{ action: 'setAttrViewViewName', avID, viewID, name: opts.name }]);
  }

  /** Set filters and/or sorts on a view (kept for the update_view tool). */
  async setAVViewQuery(
    avID: string,
    viewID: string,
    query: { sorts?: unknown[]; filters?: unknown[] }
  ): Promise<unknown> {
    if (query.sorts !== undefined) await this.setAVViewSorts(avID, viewID, query.sorts);
    if (query.filters !== undefined) await this.setAVViewFilters(avID, viewID, query.filters);
    return null;
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
