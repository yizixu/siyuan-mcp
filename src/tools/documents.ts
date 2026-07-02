import { getClient } from '../client';
import { ok, err } from '../utils';
import type { ToolModule } from '../types';

const mod: ToolModule = {
  tools: [
    {
      name: 'create_document',
      description:
        'Create a new SiYuan document with optional Markdown content. ' +
        'Use nested paths like "/Parent/Child" to create sub-documents. ' +
        'Returns the created document block ID.',
      inputSchema: {
        type: 'object',
        properties: {
          notebookId: {
            type: 'string',
            description: 'Target notebook ID',
          },
          path: {
            type: 'string',
            description:
              'Document path starting with /. Use / as separator for hierarchy (e.g. "/Projects/My Project").',
          },
          markdown: {
            type: 'string',
            description: 'Initial GFM Markdown content (optional)',
          },
        },
        required: ['notebookId', 'path'],
      },
    },
    {
      name: 'update_document',
      description:
        'Update a document: rename it, replace its full content, and/or move it to a new parent. ' +
        'All fields are optional — supply only what you want to change.',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Document block ID',
          },
          title: {
            type: 'string',
            description: 'New document title',
          },
          markdown: {
            type: 'string',
            description:
              'New full Markdown content. Replaces all existing content. ' +
              'Uses insert+delete to simulate a replace.',
          },
          parentId: {
            type: 'string',
            description:
              'Move document under this parent (notebook ID or parent document ID)',
          },
        },
        required: ['id'],
      },
    },
    {
      name: 'delete_document',
      description: 'Delete a document (and all its child blocks) by ID.',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Document block ID to delete',
          },
          dryRun: {
            type: 'boolean',
            description:
              'If true, returns the document path without actually deleting it (default: false)',
          },
        },
        required: ['id'],
      },
    },
    {
      name: 'export_doc_markdown',
      description:
        'Export a document as standard Markdown (resolves block refs, embeds and assets). ' +
        'Use this to READ a full document\'s content as clean Markdown. Returns { hPath, content }.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Document block ID' },
        },
        required: ['id'],
      },
    },
    {
      name: 'resolve_doc_path',
      description:
        'Convert between a document ID and its human-readable path. ' +
        'Provide id to get its hpath, OR provide hpath + notebookId to get matching document IDs.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Document block ID (to look up its hpath)' },
          hpath: { type: 'string', description: 'Human path like "/Projects/My Doc" (to look up IDs)' },
          notebookId: { type: 'string', description: 'Notebook ID (required with hpath)' },
        },
      },
    },
  ],

  async handle(name, args) {
    const client = getClient();
    try {
      // ── create_document ─────────────────────────────────────────────────────
      if (name === 'create_document') {
        const { notebookId, path, markdown = '' } = args as {
          notebookId: string;
          path: string;
          markdown?: string;
        };
        const docId = await client.createDocWithMd(notebookId, path, markdown);
        return ok({ docId, notebookId, path });
      }

      // ── update_document ─────────────────────────────────────────────────────
      if (name === 'update_document') {
        const { id, title, markdown, parentId } = args as {
          id: string;
          title?: string;
          markdown?: string;
          parentId?: string;
        };

        const ops: string[] = [];

        if (title) {
          await client.renameDocByID(id, title);
          ops.push('renamed');
        }

        if (markdown !== undefined) {
          // Replace document content: delete all children, then insert new content
          const children = await client.getChildBlocks(id);
          for (const child of children) {
            await client.deleteBlock(child.id);
          }
          if (markdown.trim()) {
            await client.appendBlock('markdown', markdown, id);
          }
          ops.push('content replaced');
        }

        if (parentId) {
          await client.moveDocsByID([id], parentId);
          ops.push('moved');
        }

        return ok({ success: true, id, operations: ops });
      }

      // ── delete_document ─────────────────────────────────────────────────────
      if (name === 'delete_document') {
        const { id, dryRun = false } = args as { id: string; dryRun?: boolean };

        if (dryRun) {
          const hpath = await client.getHPathByID(id);
          return ok({ dryRun: true, id, hpath, message: 'Document would be deleted (dryRun=true)' });
        }

        await client.removeDocByID(id);
        return ok({ success: true, id });
      }

      // ── export_doc_markdown ─────────────────────────────────────────────────
      if (name === 'export_doc_markdown') {
        const { id } = args as { id: string };
        const result = await client.exportMdContent(id);
        return ok(result);
      }

      // ── resolve_doc_path ────────────────────────────────────────────────────
      if (name === 'resolve_doc_path') {
        const { id, hpath, notebookId } = args as {
          id?: string;
          hpath?: string;
          notebookId?: string;
        };
        if (id) {
          const resolvedHpath = await client.getHPathByID(id);
          return ok({ id, hpath: resolvedHpath });
        }
        if (hpath && notebookId) {
          const ids = await client.getIDsByHPath(hpath, notebookId);
          return ok({ hpath, notebookId, ids });
        }
        return err('Provide either id, or both hpath and notebookId');
      }

      return err(`Unknown document tool: ${name}`);
    } catch (e) {
      return err(`${name} failed`, e);
    }
  },
};

export default mod;
