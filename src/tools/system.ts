import { getClient } from '../client';
import { ok, err, pathDepth } from '../utils';
import type { ToolModule } from '../types';

/** The avID an AV block embeds, as stored in its DOM. */
const AV_ID_RE = /data-av-id="([^"]+)"/;

const mod: ToolModule = {
  tools: [
    {
      name: 'siyuan_sql',
      description:
        'Execute a read-only SQL query against SiYuan\'s SQLite database. ' +
        'Available tables: blocks (id, parent_id, root_id, box, path, content, type, subtype, ial, sort, created, updated, hpath), ' +
        'attributes (id, name, value, type, block_id, root_id, box, path), ' +
        'spans (id, block_id, root_id, box, path, content, markdown, type, ial), ' +
        'assets (id, name, path, hash). ' +
        'Block types: d=document, p=paragraph, h=heading, c=code, m=math, t=table, b=blockquote, ' +
        'i=list item, l=list, s=superblock, av=attribute view.',
      inputSchema: {
        type: 'object',
        properties: {
          stmt: {
            type: 'string',
            description: 'SQL SELECT statement (read-only)',
          },
        },
        required: ['stmt'],
      },
    },

    {
      name: 'workspace_map',
      description:
        'Get a comprehensive overview of the SiYuan workspace: ' +
        'all notebooks with their IDs, top-level documents (2 levels), ' +
        'and all database (Attribute View) IDs. ' +
        'Useful as system context for AI tools.',
      inputSchema: {
        type: 'object',
        properties: {
          maxDocsPerNotebook: {
            type: 'number',
            description: 'Max documents to list per notebook (default: 50)',
          },
        },
      },
    },

    {
      name: 'upload_asset',
      description:
        'Upload a file to the SiYuan workspace assets folder. ' +
        'Provide the file content as a base64-encoded string. ' +
        'Returns the asset path (e.g. "assets/file-20240101120000-abc1234.png") ' +
        'that can be referenced in Markdown as ![](assets/...).',
      inputSchema: {
        type: 'object',
        properties: {
          fileName: {
            type: 'string',
            description: 'Original file name (e.g. "screenshot.png")',
          },
          base64Content: {
            type: 'string',
            description: 'File content encoded as base64',
          },
          assetsDirPath: {
            type: 'string',
            description:
              'Target folder path within workspace/data (default: "/assets/")',
          },
        },
        required: ['fileName', 'base64Content'],
      },
    },

    {
      name: 'get_system_info',
      description: 'Get SiYuan version and boot progress.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'get_current_time',
      description: 'Get the SiYuan server\'s current time (epoch milliseconds and ISO string).',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'push_message',
      description:
        'Show a notification message in the SiYuan UI (bottom-right toast). ' +
        'Useful to signal the user that an automated task finished. ' +
        'Set isError=true for an error-styled message.',
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Text to display' },
          timeout: { type: 'number', description: 'Milliseconds before auto-dismiss (default: 7000)' },
          isError: { type: 'boolean', description: 'Show as an error message (default: false)' },
        },
        required: ['message'],
      },
    },
    {
      name: 'render_sprig',
      description:
        'Render a Sprig template string (the templating language SiYuan uses for ' +
        'daily-note paths, dates, etc.). Example template: \'{{now | date "2006-01-02"}}\'.',
      inputSchema: {
        type: 'object',
        properties: {
          template: { type: 'string', description: 'Sprig template string' },
        },
        required: ['template'],
      },
    },
    {
      name: 'pandoc_convert',
      description:
        'Run a Pandoc conversion via SiYuan\'s bundled Pandoc. Pass the Pandoc CLI args array ' +
        '(e.g. ["-f","markdown","-t","docx","-o","out.docx","in.md"]). ' +
        'Files are read/written inside the returned temp dir. Requires Pandoc enabled in SiYuan.',
      inputSchema: {
        type: 'object',
        properties: {
          args: {
            type: 'array',
            items: { type: 'string' },
            description: 'Pandoc command-line arguments',
          },
        },
        required: ['args'],
      },
    },
    {
      name: 'forward_proxy',
      description:
        'Make an HTTP request through the SiYuan kernel (server-side fetch, avoids browser CORS). ' +
        'Returns the response status, headers and body.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Target URL' },
          method: { type: 'string', description: 'HTTP method (default: GET)' },
          payload: { description: 'Request body (string or JSON object)' },
          headers: {
            type: 'array',
            description: 'Array of single-key header objects, e.g. [{"User-Agent":"x"}]',
            items: { type: 'object', additionalProperties: { type: 'string' } },
          },
          contentType: { type: 'string', description: 'Content-Type header (default: application/json)' },
          timeout: { type: 'number', description: 'Timeout in ms (default: 7000)' },
        },
        required: ['url'],
      },
    },
  ],

  async handle(name, args) {
    const client = getClient();
    try {
      // ── siyuan_sql ──────────────────────────────────────────────────────────
      if (name === 'siyuan_sql') {
        const { stmt } = args as { stmt: string };

        // Safety check: only allow SELECT statements
        const trimmed = stmt.trim().toUpperCase();
        if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('WITH')) {
          return err('Only SELECT (and WITH ... SELECT) queries are allowed');
        }

        const rows = await client.sql(stmt);
        return ok({ rowCount: rows.length, rows });
      }

      // ── workspace_map ────────────────────────────────────────────────────────
      if (name === 'workspace_map') {
        const { maxDocsPerNotebook = 50 } = args as { maxDocsPerNotebook?: number };

        // 1. Notebooks
        const { notebooks } = await client.lsNotebooks();

        // 2. Documents per notebook (up to 2 levels deep)
        const notebookDocs: Record<
          string,
          Array<{ id: string; hpath: string; type: string }>
        > = {};

        for (const nb of notebooks) {
          if (nb.closed) continue;
          const docs = await client.sql(
            `SELECT id, hpath, path FROM blocks ` +
              `WHERE box = '${nb.id}' AND type = 'd' ` +
              `ORDER BY hpath LIMIT ${maxDocsPerNotebook * 3}`
          );
          notebookDocs[nb.id] = docs
            .filter((d) => pathDepth(String(d.path ?? '')) <= 2)
            .slice(0, maxDocsPerNotebook)
            .map((d) => ({
              id: String(d.id),
              hpath: String(d.hpath),
              type: 'd',
            }));
        }

        // 3. All AV databases. The avID lives in the AV block's DOM
        // (`data-av-id`); SiYuan indexes no `av-id` attribute for it.
        const avBlocks = await client.sql(
          `SELECT id, root_id, markdown FROM blocks WHERE type = 'av' LIMIT 500`
        );
        const databases = avBlocks
          .map((r) => ({
            blockId: String(r.id),
            avId: AV_ID_RE.exec(String(r.markdown ?? ''))?.[1] ?? '',
            docId: r.root_id ? String(r.root_id) : undefined,
          }))
          .filter((d) => d.avId);

        // Format as Markdown
        let md = '# SiYuan Workspace Map\n\n';
        md += `## Notebooks (${notebooks.filter((n) => !n.closed).length} open)\n\n`;

        for (const nb of notebooks) {
          const status = nb.closed ? ' _(closed)_' : '';
          md += `### ${nb.name}${status}\n`;
          md += `- **ID**: \`${nb.id}\`\n`;
          const docs = notebookDocs[nb.id];
          if (docs && docs.length > 0) {
            md += `- **Documents** (${docs.length}):\n`;
            for (const doc of docs) {
              md += `  - \`${doc.id}\` — ${doc.hpath}\n`;
            }
          }
          md += '\n';
        }

        if (databases.length > 0) {
          md += `## Databases / Attribute Views (${databases.length})\n\n`;
          for (const db of databases) {
            md += `- **avID**: \`${db.avId}\``;
            if (db.docId) md += ` (in doc \`${db.docId}\`)`;
            md += '\n';
          }
        } else {
          md += '## Databases\n\nNo Attribute View databases found.\n';
        }

        return ok(md);
      }

      // ── upload_asset ────────────────────────────────────────────────────────
      if (name === 'upload_asset') {
        const { fileName, base64Content, assetsDirPath = '/assets/' } = args as {
          fileName: string;
          base64Content: string;
          assetsDirPath?: string;
        };

        const fileBuffer = Buffer.from(base64Content, 'base64');
        const result = await client.uploadAsset(fileName, fileBuffer, assetsDirPath);

        if (result.errFiles.length > 0) {
          return err(`Upload failed for: ${result.errFiles.join(', ')}`);
        }

        const assetPath = Object.values(result.succMap)[0];
        return ok({
          success: true,
          fileName,
          assetPath,
          markdownRef: `![${fileName}](${assetPath})`,
          succMap: result.succMap,
        });
      }

      // ── get_system_info ─────────────────────────────────────────────────────
      if (name === 'get_system_info') {
        const [version, boot] = await Promise.all([
          client.version(),
          client.bootProgress(),
        ]);
        return ok({ version, bootProgress: boot.progress, bootDetails: boot.details });
      }

      // ── get_current_time ─────────────────────────────────────────────────────
      if (name === 'get_current_time') {
        const ms = await client.currentTime();
        return ok({ epochMs: ms, iso: new Date(ms).toISOString() });
      }

      // ── push_message ─────────────────────────────────────────────────────────
      if (name === 'push_message') {
        const { message, timeout = 7000, isError = false } = args as {
          message: string;
          timeout?: number;
          isError?: boolean;
        };
        const result = isError
          ? await client.pushErrMsg(message, timeout)
          : await client.pushMsg(message, timeout);
        return ok({ success: true, id: result?.id });
      }

      // ── render_sprig ─────────────────────────────────────────────────────────
      if (name === 'render_sprig') {
        const { template } = args as { template: string };
        const rendered = await client.renderSprig(template);
        return ok({ template, rendered });
      }

      // ── pandoc_convert ───────────────────────────────────────────────────────
      if (name === 'pandoc_convert') {
        const { args: pandocArgs } = args as { args: string[] };
        const result = await client.pandoc(pandocArgs);
        return ok({ success: true, ...result });
      }

      // ── forward_proxy ────────────────────────────────────────────────────────
      if (name === 'forward_proxy') {
        const { url, method, payload, headers, contentType, timeout } = args as {
          url: string;
          method?: string;
          payload?: unknown;
          headers?: Array<Record<string, string>>;
          contentType?: string;
          timeout?: number;
        };
        const result = await client.forwardProxy(url, { method, payload, headers, contentType, timeout });
        return ok(result);
      }

      return err(`Unknown system tool: ${name}`);
    } catch (e) {
      return err(`${name} failed`, e);
    }
  },
};

export default mod;
