import { getClient } from '../client';
import { ok, err, pathDepth } from '../utils';
import type { ToolModule } from '../types';

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
          try {
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
          } catch {
            notebookDocs[nb.id] = [];
          }
        }

        // 3. All AV databases
        let databases: Array<{ blockId: string; avId: string; docId?: string }> = [];
        try {
          const avBlocks = await client.sql(
            `SELECT b.id, b.root_id, a.value FROM blocks b ` +
              `LEFT JOIN attributes a ON b.id = a.block_id AND a.name = 'av-id' ` +
              `WHERE b.type = 'av' LIMIT 500`
          );
          databases = avBlocks
            .filter((r) => r.value)
            .map((r) => ({
              blockId: String(r.id),
              avId: String(r.value),
              docId: r.root_id ? String(r.root_id) : undefined,
            }));
        } catch {
          // AV query might fail in older SiYuan versions
        }

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

      return err(`Unknown system tool: ${name}`);
    } catch (e) {
      return err(`${name} failed`, e);
    }
  },
};

export default mod;
