import { getClient } from '../client';
import { ok, err } from '../utils';
import type { ToolModule, BatchBlockOp } from '../types';

const mod: ToolModule = {
  tools: [
    {
      name: 'insert_block',
      description:
        'Insert a Markdown or DOM block into a document. ' +
        'Specify where to insert using parentID (append to parent), ' +
        'previousID (insert after block), or nextID (insert before block).',
      inputSchema: {
        type: 'object',
        properties: {
          data: {
            type: 'string',
            description: 'Block content (Markdown or DOM HTML)',
          },
          dataType: {
            type: 'string',
            enum: ['markdown', 'dom'],
            description: 'Content type: "markdown" (default) or "dom"',
          },
          parentID: {
            type: 'string',
            description: 'Parent block ID – appends content as last child',
          },
          previousID: {
            type: 'string',
            description: 'Insert after this block ID',
          },
          nextID: {
            type: 'string',
            description: 'Insert before this block ID',
          },
        },
        required: ['data'],
      },
    },
    {
      name: 'update_block',
      description: 'Update the content of an existing block.',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Block ID to update',
          },
          data: {
            type: 'string',
            description: 'New content',
          },
          dataType: {
            type: 'string',
            enum: ['markdown', 'dom'],
            description: 'Content type (default: "markdown")',
          },
        },
        required: ['id', 'data'],
      },
    },
    {
      name: 'delete_block',
      description: 'Delete a block by ID.',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Block ID to delete',
          },
        },
        required: ['id'],
      },
    },
    {
      name: 'batch_block_ops',
      description:
        'Execute multiple block operations in a single call. ' +
        'Supported actions: insertBefore, insertAfter, append, prepend, update, delete.',
      inputSchema: {
        type: 'object',
        properties: {
          operations: {
            type: 'array',
            description: 'List of block operations to perform in order',
            items: {
              type: 'object',
              properties: {
                action: {
                  type: 'string',
                  enum: [
                    'insertBefore',
                    'insertAfter',
                    'append',
                    'prepend',
                    'update',
                    'delete',
                  ],
                },
                id: { type: 'string', description: 'Block ID (required for update/delete/insertBefore/insertAfter)' },
                data: { type: 'string', description: 'Content (required for insert/update)' },
                dataType: { type: 'string', description: '"markdown" or "dom"' },
                parentID: { type: 'string', description: 'Parent ID (for append/prepend)' },
                previousID: { type: 'string', description: 'Anchor for insertAfter / insertBlock' },
                nextID: { type: 'string', description: 'Anchor for insertBefore' },
              },
              required: ['action'],
            },
          },
        },
        required: ['operations'],
      },
    },
    {
      name: 'set_block_attrs',
      description:
        'Set custom attributes on any block. ' +
        'Custom attribute keys must be prefixed with "custom-". ' +
        'Standard keys: "alias", "memo", "name".',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Block ID',
          },
          attrs: {
            type: 'object',
            description:
              'Key-value pairs of attributes. Custom attrs need "custom-" prefix.',
            additionalProperties: { type: 'string' },
          },
        },
        required: ['id', 'attrs'],
      },
    },
    {
      name: 'get_block_attrs',
      description: 'Get all attributes of a block.',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Block ID',
          },
        },
        required: ['id'],
      },
    },
    {
      name: 'get_block_content',
      description: 'Get the Kramdown (raw markdown) content of a block.',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Block ID',
          },
        },
        required: ['id'],
      },
    },
    {
      name: 'get_child_blocks',
      description: 'List the direct child blocks of a container block (document, list, blockquote, etc.). Returns id, type, subtype.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Parent block ID' },
        },
        required: ['id'],
      },
    },
    {
      name: 'move_block',
      description:
        'Move a block to a new position. Provide previousID to place it right after another block, ' +
        'and/or parentID to move it under a new parent.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Block ID to move' },
          previousID: { type: 'string', description: 'Place after this block (optional)' },
          parentID: { type: 'string', description: 'New parent block (optional)' },
        },
        required: ['id'],
      },
    },
    {
      name: 'fold_block',
      description: 'Fold (collapse) or unfold (expand) a block by ID. Use fold=true to collapse, fold=false to expand.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Block ID' },
          fold: { type: 'boolean', description: 'true = fold/collapse, false = unfold/expand (default: true)' },
        },
        required: ['id'],
      },
    },
  ],

  async handle(name, args) {
    const client = getClient();
    try {
      // ── insert_block ─────────────────────────────────────────────────────────
      if (name === 'insert_block') {
        const { data, dataType = 'markdown', parentID, previousID, nextID } = args as {
          data: string;
          dataType?: string;
          parentID?: string;
          previousID?: string;
          nextID?: string;
        };
        const result = await client.insertBlock(dataType, data, { parentID, previousID, nextID });
        return ok(result);
      }

      // ── update_block ─────────────────────────────────────────────────────────
      if (name === 'update_block') {
        const { id, data, dataType = 'markdown' } = args as {
          id: string;
          data: string;
          dataType?: string;
        };
        const result = await client.updateBlock(dataType, data, id);
        return ok(result);
      }

      // ── delete_block ─────────────────────────────────────────────────────────
      if (name === 'delete_block') {
        const { id } = args as { id: string };
        const result = await client.deleteBlock(id);
        return ok(result);
      }

      // ── batch_block_ops ──────────────────────────────────────────────────────
      if (name === 'batch_block_ops') {
        const { operations } = args as { operations: BatchBlockOp[] };
        const results: unknown[] = [];

        for (const op of operations) {
          const dt = op.dataType || 'markdown';
          switch (op.action) {
            case 'insertAfter':
              results.push(
                await client.insertBlock(dt, op.data!, {
                  previousID: op.id,
                  parentID: op.parentID,
                })
              );
              break;
            case 'insertBefore':
              results.push(
                await client.insertBlock(dt, op.data!, {
                  nextID: op.id,
                  parentID: op.parentID,
                })
              );
              break;
            case 'append':
              results.push(await client.appendBlock(dt, op.data!, op.parentID!));
              break;
            case 'prepend':
              results.push(await client.prependBlock(dt, op.data!, op.parentID!));
              break;
            case 'update':
              results.push(await client.updateBlock(dt, op.data!, op.id!));
              break;
            case 'delete':
              results.push(await client.deleteBlock(op.id!));
              break;
          }
        }

        return ok({ success: true, count: results.length, results });
      }

      // ── set_block_attrs ──────────────────────────────────────────────────────
      if (name === 'set_block_attrs') {
        const { id, attrs } = args as { id: string; attrs: Record<string, string> };
        await client.setBlockAttrs(id, attrs);
        return ok({ success: true, id, attrs });
      }

      // ── get_block_attrs ──────────────────────────────────────────────────────
      if (name === 'get_block_attrs') {
        const { id } = args as { id: string };
        const attrs = await client.getBlockAttrs(id);
        return ok({ id, attrs });
      }

      // ── get_block_content ─────────────────────────────────────────────────────
      if (name === 'get_block_content') {
        const { id } = args as { id: string };
        const result = await client.getBlockKramdown(id);
        return ok(result);
      }

      // ── get_child_blocks ──────────────────────────────────────────────────────
      if (name === 'get_child_blocks') {
        const { id } = args as { id: string };
        const children = await client.getChildBlocks(id);
        return ok({ id, children });
      }

      // ── move_block ────────────────────────────────────────────────────────────
      if (name === 'move_block') {
        const { id, previousID, parentID } = args as {
          id: string;
          previousID?: string;
          parentID?: string;
        };
        const result = await client.moveBlock(id, { previousID, parentID });
        return ok({ success: true, id, result });
      }

      // ── fold_block ────────────────────────────────────────────────────────────
      if (name === 'fold_block') {
        const { id, fold = true } = args as { id: string; fold?: boolean };
        const result = fold ? await client.foldBlock(id) : await client.unfoldBlock(id);
        return ok({ success: true, id, folded: fold, result });
      }

      return err(`Unknown block tool: ${name}`);
    } catch (e) {
      return err(`${name} failed`, e);
    }
  },
};

export default mod;
