import { getClient } from '../client';
import { ok, err } from '../utils';
import { childIdsToDeleteOnContentReplace } from './document-mutate';
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
      name: 'append_document',
      description:
        'Append Markdown to the end of a document without deleting any existing ' +
        'child blocks (including Attribute View embeds). Prefer this over ' +
        'update_document when adding content to a doc that may contain databases.',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Document block ID',
          },
          markdown: {
            type: 'string',
            description: 'Markdown to append',
          },
        },
        required: ['id', 'markdown'],
      },
    },
    {
      name: 'update_document',
      description:
        'Update a document: rename it, replace content, and/or move it. ' +
        'When replacing markdown, Attribute View (database) child blocks are ' +
        'preserved by default so embedded tables are not destroyed. Pass ' +
        'force:true to wipe every child including AV embeds.',
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
              'New Markdown content. Replaces non-AV children (or all children if force). ' +
              'Uses delete+append. Prefer append_document when you only need to add content.',
          },
          force: {
            type: 'boolean',
            description:
              'If true, delete ALL children including Attribute View embeds before inserting markdown (default: false)',
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

      // ── append_document ─────────────────────────────────────────────────────
      if (name === 'append_document') {
        const { id, markdown } = args as { id: string; markdown: string };
        if (!id) return err('id is required');
        if (markdown === undefined || markdown === null) return err('markdown is required');

        const before = await client.getChildBlocks(id);
        if (String(markdown).length) {
          await client.appendBlock('markdown', String(markdown), id);
        }
        const after = await client.getChildBlocks(id);
        return ok({
          success: true,
          id,
          appended: true,
          childCountBefore: before.length,
          childCountAfter: after.length,
          preservedChildIds: before.map((c) => c.id),
        });
      }

      // ── update_document ─────────────────────────────────────────────────────
      if (name === 'update_document') {
        const { id, title, markdown, parentId, force = false } = args as {
          id: string;
          title?: string;
          markdown?: string;
          parentId?: string;
          force?: boolean;
        };

        const ops: string[] = [];

        if (title) {
          await client.renameDocByID(id, title);
          ops.push('renamed');
        }

        let deletedChildCount = 0;
        let preservedAttributeViews: Array<{ id: string; type: string }> = [];

        if (markdown !== undefined) {
          const children = await client.getChildBlocks(id);
          const toDelete = childIdsToDeleteOnContentReplace(children, Boolean(force));
          preservedAttributeViews = children
            .filter((c) => !toDelete.includes(c.id))
            .map((c) => ({ id: c.id, type: c.type }));

          for (const childId of toDelete) {
            await client.deleteBlock(childId);
          }
          deletedChildCount = toDelete.length;
          if (markdown.trim()) {
            await client.appendBlock('markdown', markdown, id);
          }
          ops.push(force ? 'content replaced (force, all children wiped)' : 'content replaced (AV preserved)');
        }

        if (parentId) {
          await client.moveDocsByID([id], parentId);
          ops.push('moved');
        }

        return ok({
          success: true,
          id,
          operations: ops,
          ...(markdown !== undefined
            ? { deletedChildCount, preservedAttributeViews, force: Boolean(force) }
            : {}),
        });
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
