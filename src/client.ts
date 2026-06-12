import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';
import type { SiYuanResponse, Notebook, AVData, AVRenderResult, AVKeyOption } from './types';

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
    const { code, msg, data } = res.data;
    if (code !== 0) {
      throw new Error(`SiYuan API error [${code}]: ${msg || '(no message)'}`);
    }
    return data;
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

  /** Add new detached rows to a database, optionally pre-filling values */
  appendAVRows(
    avID: string,
    blocksValues: Array<{
      blockID: string;
      values: Array<Record<string, unknown>>;
    }>
  ): Promise<unknown> {
    return this.post('/api/av/appendAttributeViewDetachedBlocksWithValues', {
      avID,
      blocksValues
    });
  }

  /** Remove rows from a database by blockID */
  removeAVRows(avID: string, blockIDs: string[]): Promise<unknown> {
    return this.post('/api/av/removeAttributeViewBlock', { avID, blockIDs });
  }

  /** Update a single cell value */
  updateAVCell(avID: string, keyID: string, rowID: string, value: Record<string, unknown>): Promise<unknown> {
    return this.post('/api/av/updateAttributeViewCell', { avID, keyID, rowID, value });
  }

  /** Add a new field (column) */
  addAVColumn(avID: string, keyType: string, keyName: string, previousKeyID?: string): Promise<unknown> {
    return this.post('/api/av/addAttributeViewColumn', {
      avID,
      keyType,
      keyName,
      ...(previousKeyID ? { previousKeyID } : {})
    });
  }

  /** Remove a field (column) */
  removeAVColumn(avID: string, keyID: string): Promise<unknown> {
    return this.post('/api/av/removeAttributeViewColumn', { avID, keyID });
  }

  /** Rename a field or update column properties (width, hidden, etc.) */
  updateAVColumn(
    avID: string,
    keyID: string,
    updates: {
      keyName?: string;
      keyOptions?: AVKeyOption[];
      width?: string;
      hidden?: boolean;
      pin?: boolean;
      wrap?: boolean;
    }
  ): Promise<unknown> {
    return this.post('/api/av/updateAttributeViewColumn', { avID, keyID, ...updates });
  }

  /** Get options list for a select/mSelect field */
  getAVKeyOptions(avID: string, keyID: string): Promise<{ options: AVKeyOption[] }> {
    return this.post('/api/av/getAttributeViewKeyOptions', { id: avID, keyID });
  }

  /** Set/replace options for a select/mSelect field */
  setAVKeyOptions(avID: string, keyID: string, options: AVKeyOption[]): Promise<unknown> {
    // SiYuan stores options as part of the key definition.
    // updateAttributeViewColumn with keyOptions replaces the option list.
    return this.post('/api/av/updateAttributeViewColumn', {
      avID,
      keyID,
      keyOptions: options
    });
  }

  /** Add a new view to a database */
  addAVView(avID: string, viewType?: string, viewName?: string): Promise<unknown> {
    return this.post('/api/av/addAttributeViewView', {
      avID,
      ...(viewType ? { viewType } : {}),
      ...(viewName ? { viewName } : {})
    });
  }

  /** Remove a view */
  removeAVView(avID: string, viewID: string): Promise<unknown> {
    return this.post('/api/av/removeAttributeViewView', { avID, viewID });
  }

  /** Update a view (rename, change layout, set filters/sorts) */
  updateAVView(avID: string, viewID: string, opts: { name?: string; type?: string }): Promise<unknown> {
    return this.post('/api/av/updateAttributeViewView', { avID, viewID, ...opts });
  }

  /** Set filters and/or sorts on a view */
  setAVViewQuery(avID: string, viewID: string, query: { sorts?: unknown[]; filters?: unknown[] }): Promise<unknown> {
    return this.post('/api/av/setAttributeViewViewQuery', { avID, viewID, ...query });
  }

  /** Add existing document blocks as doc-backed rows */
  addAVBlocks(avID: string, blockIDs: string[], previousID?: string): Promise<unknown> {
    return this.post('/api/av/addAttributeViewBlocks', {
      avID,
      blockIDs,
      ...(previousID ? { previousID } : {})
    });
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
}
