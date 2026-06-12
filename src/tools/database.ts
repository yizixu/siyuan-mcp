/**
 * Attribute View (Database) tools for SiYuan MCP Server.
 *
 * SiYuan's "Attribute View" (AV) is its relational-database system (similar to
 * Notion databases). Each AV is stored as a JSON file in
 * `{workspace}/data/storage/av/{avID}.json` and referenced by "AV blocks"
 * embedded in documents.
 *
 * Official endpoints (all POST):
 *   /api/av/renderAttributeView
 *   /api/av/getAttributeView
 *   /api/av/appendAttributeViewDetachedBlocksWithValues
 *   /api/av/removeAttributeViewBlock
 *   /api/av/updateAttributeViewCell
 *   /api/av/addAttributeViewColumn
 *   /api/av/removeAttributeViewColumn
 *   /api/av/updateAttributeViewColumn
 *   /api/av/getAttributeViewKeyOptions
 *   /api/av/addAttributeViewView
 *   /api/av/removeAttributeViewView
 *   /api/av/updateAttributeViewView
 *   /api/av/setAttributeViewViewQuery
 *   /api/av/addAttributeViewBlocks
 *   /api/file/putFile  (for create_database)
 */

import { getClient } from '../client';
import { ok, err, generateId, getTimestamp, getOptionColor } from '../utils';
import type { ToolModule, AVFieldType, AVViewType, AVKeyOption, AVKey, AVCellValue } from '../types';

// --- Value helpers ---

/**
 * Build the SiYuan AV cell value object from a plain JS value.
 */
function buildCellValue(
  keyID: string,
  type: AVFieldType,
  value: unknown
): Record<string, unknown> {
  const base: Record<string, unknown> = { keyID, type };

  switch (type) {
    case 'text':
      return { ...base, text: { content: String(value ?? '') } };
    case 'number':
      return {
        ...base,
        number: { content: Number(value), isNotEmpty: value !== null && value !== undefined },
      };
    case 'checkbox':
      return { ...base, checkbox: { checked: Boolean(value) } };
    case 'select':
      return { ...base, select: { content: String(value ?? '') } };
    case 'mSelect': {
      const items = Array.isArray(value) ? value : [value];
      return { ...base, mSelect: items.map((v) => ({ content: String(v) })) };
    }
    case 'date': {
      const ms =
        typeof value === 'number'
          ? value
          : value
          ? new Date(String(value)).getTime()
          : Date.now();
      return { ...base, date: { content: ms, isNotEmpty: true } };
    }
    case 'url':
      return { ...base, url: { content: String(value ?? '') } };
    case 'email':
      return { ...base, email: { content: String(value ?? '') } };
    case 'phone':
      return { ...base, phone: { content: String(value ?? '') } };
    case 'mAsset': {
      const assets = Array.isArray(value) ? value : [value];
      return {
        ...base,
        mAsset: assets.map((a: unknown) => {
          if (typeof a === 'object' && a !== null) return a;
          return { type: 'file', name: String(a), content: String(a) };
        }),
      };
    }
    case 'relation': {
      const ids = Array.isArray(value) ? value : [value];
      return {
        ...base,
        relation: { contents: ids.map((id) => ({ id: String(id) })) },
      };
    }
    default:
      return { ...base, ...(typeof value === 'object' && value !== null ? value : {}) };
  }
}

// --- AV JSON builder (for create_database) ---

function buildAVJson(
  avID: string,
  name: string,
  fields: Array<{ name: string; type: string; options?: string[] }>
): object {
  const blockKeyID = generateId();
  const viewID = generateId();

  const keyValues: object[] = [
    {
      key: { id: blockKeyID, name: 'Name', type: 'block', icon: '' },
      values: [],
    },
  ];
  const columns: object[] = [
    { id: blockKeyID, width: '', hidden: false, pin: true, wrap: false, calc: null },
  ];

  fields.forEach((field, idx) => {
    const keyID = generateId();
    const key: AVKey & { options?: AVKeyOption[] } = {
      id: keyID,
      name: field.name,
      type: field.type as AVFieldType,
      icon: '',
    };

    if (field.type === 'select' || field.type === 'mSelect') {
      key.options = (field.options || []).map((optName, i) => ({
        name: optName,
        color: getOptionColor(idx * 10 + i),
      }));
    }

    keyValues.push({ key, values: [] });
    columns.push({ id: keyID, width: '', hidden: false, pin: false, wrap: false, calc: null });
  });

  return {
    id: avID,
    name,
    keyValues,
    views: [
      {
        id: viewID,
        name: 'Default',
        type: 'table',
        icon: '',
        columns,
        sorts: [],
        filters: [],
        pageSize: 50,
        group: [],
        groupCalcs: null,
        blockCount: 0,
      },
    ],
  };
}

// --- Tool module ---

const mod: ToolModule = {
  tools: [
    // -- Create --
    {
      name: 'create_database',
      description:
        'Create a new SiYuan Attribute View (database). ' +
        'Writes the AV JSON to the workspace storage and optionally embeds it in a document. ' +
        'Returns the avID and viewID.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Database name',
          },
          parentDocId: {
            type: 'string',
            description:
              'If provided, embed the database block inside this document (document block ID)',
          },
          fields: {
            type: 'array',
            description:
              'Additional fields to create (beyond the default "Name" block field). ' +
              'Each item: { name, type, options? }.',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                type: {
                  type: 'string',
                  enum: [
                    'text', 'number', 'checkbox', 'select', 'mSelect',
                    'date', 'url', 'email', 'phone', 'mAsset', 'relation',
                  ],
                },
                options: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Predefined options for select/mSelect fields',
                },
              },
              required: ['name', 'type'],
            },
          },
        },
        required: ['name'],
      },
    },

    // -- Read --
    {
      name: 'read_database',
      description:
        'Read/query a SiYuan database (Attribute View). ' +
        'Returns field definitions and all rows. ' +
        'Use viewId to target a specific view (defaults to the "Default" view if present, else the active view). ' +
        'Use filter to find rows by field value.',
      inputSchema: {
        type: 'object',
        properties: {
          avId: {
            type: 'string',
            description: 'Attribute View ID',
          },
          viewId: {
            type: 'string',
            description: 'Specific view ID (optional)',
          },
          pageSize: {
            type: 'number',
            description: 'Rows per page (default: 200)',
          },
          page: {
            type: 'number',
            description: 'Page number (1-based, default: 1)',
          },
          filter: {
            type: 'object',
            description: 'Simple filter: { field: "field name", value: "..." }',
            properties: {
              field: { type: 'string' },
              value: {},
            },
            required: ['field', 'value'],
          },
        },
        required: ['avId'],
      },
    },

    // -- Rows --
    {
      name: 'write_db_rows',
      description:
        'Add one or more rows to a SiYuan database. ' +
        'Each row is an object mapping field names (or keyIDs) to values. ' +
        'Returns the created block IDs.',
      inputSchema: {
        type: 'object',
        properties: {
          avId: {
            type: 'string',
            description: 'Attribute View ID',
          },
          rows: {
            type: 'array',
            description:
              'Array of rows to insert. Each row is { fieldName: value, ... }. ' +
              'Field names are matched case-insensitively against the database fields.',
            items: {
              type: 'object',
              additionalProperties: true,
            },
          },
        },
        required: ['avId', 'rows'],
      },
    },

    {
      name: 'update_db_cells',
      description:
        'Update one or more cells in a database. ' +
        'Each update specifies rowId, fieldName (or keyId), and the new value.',
      inputSchema: {
        type: 'object',
        properties: {
          avId: {
            type: 'string',
            description: 'Attribute View ID',
          },
          updates: {
            type: 'array',
            description: 'Array of cell updates',
            items: {
              type: 'object',
              properties: {
                rowId: {
                  type: 'string',
                  description: 'Row (block) ID',
                },
                fieldName: {
                  type: 'string',
                  description: 'Field name (matched case-insensitively)',
                },
                keyId: {
                  type: 'string',
                  description: 'Field key ID (use instead of fieldName if known)',
                },
                value: {
                  description: 'New cell value',
                },
              },
              required: ['rowId', 'value'],
            },
          },
        },
        required: ['avId', 'updates'],
      },
    },

    {
      name: 'delete_db_rows',
      description: 'Delete one or more rows from a database by row (block) ID.',
      inputSchema: {
        type: 'object',
        properties: {
          avId: {
            type: 'string',
            description: 'Attribute View ID',
          },
          rowIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of row block IDs to delete',
          },
        },
        required: ['avId', 'rowIds'],
      },
    },

    // -- Fields --
    {
      name: 'manage_db_fields',
      description:
        'Add, remove, or rename fields (columns) in a database.',
      inputSchema: {
        type: 'object',
        properties: {
          avId: {
            type: 'string',
            description: 'Attribute View ID',
          },
          action: {
            type: 'string',
            enum: ['add', 'remove', 'rename'],
            description: 'Operation: add, remove, or rename a field',
          },
          keyId: {
            type: 'string',
            description: 'Field key ID (required for remove/rename)',
          },
          fieldName: {
            type: 'string',
            description: 'Field name (required for add; also the new name for rename)',
          },
          fieldType: {
            type: 'string',
            enum: [
              'text', 'number', 'checkbox', 'select', 'mSelect',
              'date', 'url', 'email', 'phone', 'mAsset', 'relation', 'rollup',
            ],
            description: 'Field type (required for add)',
          },
          previousKeyId: {
            type: 'string',
            description: 'Insert after this key ID (optional, for add)',
          },
        },
        required: ['avId', 'action'],
      },
    },

    // -- Views --
    {
      name: 'list_views',
      description: 'List all views of a database with their type, name, filters, and sorts.',
      inputSchema: {
        type: 'object',
        properties: {
          avId: {
            type: 'string',
            description: 'Attribute View ID',
          },
        },
        required: ['avId'],
      },
    },

    {
      name: 'add_view',
      description: 'Add a new view to a database.',
      inputSchema: {
        type: 'object',
        properties: {
          avId: {
            type: 'string',
            description: 'Attribute View ID',
          },
          viewName: {
            type: 'string',
            description: 'View name',
          },
          viewType: {
            type: 'string',
            enum: ['table', 'kanban', 'gallery', 'calendar', 'list'],
            description: 'View type (default: table)',
          },
        },
        required: ['avId'],
      },
    },

    {
      name: 'update_view',
      description:
        'Update a database view: rename it, change its layout, or set filters and sorts.',
      inputSchema: {
        type: 'object',
        properties: {
          avId: {
            type: 'string',
            description: 'Attribute View ID',
          },
          viewId: {
            type: 'string',
            description: 'View ID to update',
          },
          name: {
            type: 'string',
            description: 'New view name',
          },
          type: {
            type: 'string',
            enum: ['table', 'kanban', 'gallery', 'calendar', 'list'],
            description: 'Change view layout type',
          },
          sorts: {
            type: 'array',
            description: 'Sort rules: [{ column: "keyId", order: "ASC"|"DESC" }]',
            items: {
              type: 'object',
              properties: {
                column: { type: 'string' },
                order: { type: 'string', enum: ['ASC', 'DESC'] },
              },
              required: ['column'],
            },
          },
          filters: {
            type: 'array',
            description: 'Filter rules: [{ column: "keyId", operator: "=", value: "..." }]',
            items: {
              type: 'object',
              properties: {
                column: { type: 'string' },
                operator: { type: 'string' },
                value: {},
              },
              required: ['column', 'operator'],
            },
          },
        },
        required: ['avId', 'viewId'],
      },
    },

    {
      name: 'delete_view',
      description: 'Remove a view from a database.',
      inputSchema: {
        type: 'object',
        properties: {
          avId: {
            type: 'string',
            description: 'Attribute View ID',
          },
          viewId: {
            type: 'string',
            description: 'View ID to remove',
          },
        },
        required: ['avId', 'viewId'],
      },
    },

    // -- Select Options --
    {
      name: 'list_select_options',
      description: 'List the current options for a select or multi-select field.',
      inputSchema: {
        type: 'object',
        properties: {
          avId: {
            type: 'string',
            description: 'Attribute View ID',
          },
          keyId: {
            type: 'string',
            description: 'Key ID of the select/mSelect field',
          },
        },
        required: ['avId', 'keyId'],
      },
    },

    {
      name: 'set_select_options',
      description:
        'Define or replace the options for a select or multi-select field. ' +
        'Each option has a name and optional color (CSS variable like "var(--b3-font-color3)").',
      inputSchema: {
        type: 'object',
        properties: {
          avId: {
            type: 'string',
            description: 'Attribute View ID',
          },
          keyId: {
            type: 'string',
            description: 'Key ID of the select/mSelect field',
          },
          options: {
            type: 'array',
            description: 'Options list',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                color: {
                  type: 'string',
                  description: 'CSS color (e.g. "var(--b3-font-color3)")',
                },
              },
              required: ['name'],
            },
          },
        },
        required: ['avId', 'keyId', 'options'],
      },
    },

    // -- Doc-backed Rows --
    {
      name: 'bind_row_to_doc',
      description:
        'Convert a detached database row into a document-backed row by linking it to an existing document. ' +
        'The document will appear as a "linked" block in the database.',
      inputSchema: {
        type: 'object',
        properties: {
          avId: {
            type: 'string',
            description: 'Attribute View ID',
          },
          blockIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Existing document/block IDs to add as rows',
          },
          previousId: {
            type: 'string',
            description: 'Insert after this row ID (optional)',
          },
        },
        required: ['avId', 'blockIds'],
      },
    },

    {
      name: 'create_doc_backed_row',
      description:
        'Create a new document and immediately add it as a document-backed row in a database. ' +
        'Returns both the new document ID and confirms the row was added.',
      inputSchema: {
        type: 'object',
        properties: {
          avId: {
            type: 'string',
            description: 'Attribute View ID',
          },
          notebookId: {
            type: 'string',
            description: 'Target notebook for the new document',
          },
          path: {
            type: 'string',
            description: 'Document path (e.g. "/Projects/Task 1")',
          },
          markdown: {
            type: 'string',
            description: 'Initial document content (optional)',
          },
          previousId: {
            type: 'string',
            description: 'Insert after this row ID (optional)',
          },
        },
        required: ['avId', 'notebookId', 'path'],
      },
    },
  ],

  // --- Handler ---

  async handle(name, args) {
    const client = getClient();
    try {
      // -- create_database --
      if (name === 'create_database') {
        const { name: dbName, parentDocId, fields = [] } = args as {
          name: string;
          parentDocId?: string;
          fields?: Array<{ name: string; type: string; options?: string[] }>;
        };

        const avID = generateId();
        const avJson = buildAVJson(avID, dbName, fields);

        await client.putFile(
          `/data/storage/av/${avID}.json`,
          JSON.stringify(avJson, null, 2)
        );

        await client.flushTransaction();

        let blockId: string | undefined;
        if (parentDocId) {
          blockId = generateId();
          const ts = getTimestamp();
          const dom =
            `<div data-node-id="${blockId}" data-type="NodeAttributeView" ` +
            `data-av-id="${avID}" data-av-type="custom" class="av" updated="${ts}"></div>`;
          await client.appendBlock('dom', dom, parentDocId);
        }

        const viewId = (avJson as { views: Array<{ id: string }> }).views[0].id;
        return ok({ avID, viewId, name: dbName, embeddedBlockId: blockId ?? null });
      }

      // -- read_database --
      if (name === 'read_database') {
        const { avId, viewId, pageSize = 200, page = 1, filter } = args as {
          avId: string;
          viewId?: string;
          pageSize?: number;
          page?: number;
          filter?: { field: string; value: unknown };
        };

        let resolvedViewId = viewId;
        if (!resolvedViewId) {
          try {
            const av = await client.getAV(avId);
            const defaultView = av.views.find(
              (v) => v.name.toLowerCase() === 'default'
            );
            resolvedViewId = defaultView?.id ?? av.views[0]?.id;
          } catch {
            // fall through
          }
        }

        const result = await client.renderAV(avId, { viewID: resolvedViewId, pageSize, page });

        const av = await client.getAV(avId);
        const keyMap = new Map(av.keyValues.map((kv) => [kv.key.name.toLowerCase(), kv.key]));

        let rows = result.view?.rows ?? [];

        if (filter) {
          const filterKey = keyMap.get(filter.field.toLowerCase());
          if (filterKey) {
            rows = rows.filter((row) => {
              const cell = row.cells.find((c) => c.value?.keyID === filterKey.id);
              if (!cell) return false;
              const cellVal = extractCellValue(cell.value);
              if (Array.isArray(cellVal)) {
                return cellVal.map(String).includes(String(filter.value));
              }
              return String(cellVal) === String(filter.value);
            });
          }
        }

        return ok({
          avId,
          name: result.name,
          viewId: resolvedViewId,
          viewType: result.viewType,
          fields: av.keyValues.map((kv) => ({
            id: kv.key.id,
            name: kv.key.name,
            type: kv.key.type,
            options: kv.key.options,
          })),
          rowCount: rows.length,
          totalCount: result.view?.blockCount ?? rows.length,
          rows: rows.map((row) => ({
            id: row.id,
            cells: row.cells.reduce(
              (acc, cell) => {
                const value = cell.value;
                if (!value) return acc;
                const key = av.keyValues.find((kv) => kv.key.id === value.keyID);
                if (!key) return acc;
                acc[key.key.name] = extractCellValue(value);
                return acc;
              },
              {} as Record<string, unknown>
            ),
          })),
        });
      }

      // -- write_db_rows --
      if (name === 'write_db_rows') {
        const { avId, rows } = args as {
          avId: string;
          rows: Array<Record<string, unknown>>;
        };

        const av = await client.getAV(avId);
        const keyMap = new Map(
          av.keyValues.map((kv) => [kv.key.name.toLowerCase(), kv.key])
        );

        const blocksValues = rows.map((row) => {
          const blockID = generateId();
          const values: Array<Record<string, unknown>> = [];

          for (const [fieldName, value] of Object.entries(row)) {
            const key = keyMap.get(fieldName.toLowerCase());
            if (!key || key.type === 'block') continue;
            values.push(buildCellValue(key.id, key.type, value));
          }

          return { blockID, values };
        });

        await client.appendAVRows(avId, blocksValues);

        return ok({
          success: true,
          avId,
          inserted: blocksValues.length,
          blockIDs: blocksValues.map((bv) => bv.blockID),
        });
      }

      // -- update_db_cells --
      if (name === 'update_db_cells') {
        const { avId, updates } = args as {
          avId: string;
          updates: Array<{
            rowId: string;
            fieldName?: string;
            keyId?: string;
            value: unknown;
          }>;
        };

        const av = await client.getAV(avId);
        const keyMap = new Map(
          av.keyValues.map((kv) => [kv.key.name.toLowerCase(), kv.key])
        );
        const keyById = new Map(av.keyValues.map((kv) => [kv.key.id, kv.key]));

        let updated = 0;
        for (const upd of updates) {
          const key = upd.keyId
            ? keyById.get(upd.keyId)
            : keyMap.get((upd.fieldName ?? '').toLowerCase());

          if (!key) continue;

          const cellValue = buildCellValue(key.id, key.type, upd.value);
          await client.updateAVCell(avId, key.id, upd.rowId, cellValue);
          updated++;
        }

        return ok({ success: true, avId, updatedCells: updated });
      }

      // -- delete_db_rows --
      if (name === 'delete_db_rows') {
        const { avId, rowIds } = args as { avId: string; rowIds: string[] };
        await client.removeAVRows(avId, rowIds);
        return ok({ success: true, avId, deleted: rowIds.length });
      }

      // -- manage_db_fields --
      if (name === 'manage_db_fields') {
        const { avId, action, keyId, fieldName, fieldType, previousKeyId } = args as {
          avId: string;
          action: 'add' | 'remove' | 'rename';
          keyId?: string;
          fieldName?: string;
          fieldType?: string;
          previousKeyId?: string;
        };

        if (action === 'add') {
          if (!fieldName || !fieldType) {
            return err('add action requires fieldName and fieldType');
          }
          await client.addAVColumn(avId, fieldType, fieldName, previousKeyId);
          return ok({ success: true, avId, action, fieldName, fieldType });
        }

        if (action === 'remove') {
          if (!keyId) return err('remove action requires keyId');
          await client.removeAVColumn(avId, keyId);
          return ok({ success: true, avId, action, keyId });
        }

        if (action === 'rename') {
          if (!keyId || !fieldName) return err('rename action requires keyId and fieldName');
          await client.updateAVColumn(avId, keyId, { keyName: fieldName });
          return ok({ success: true, avId, action, keyId, newName: fieldName });
        }

        return err(`Unknown manage_db_fields action: ${action}`);
      }

      // -- list_views --
      if (name === 'list_views') {
        const { avId } = args as { avId: string };
        const av = await client.getAV(avId);
        return ok({
          avId,
          views: av.views.map((v) => ({
            id: v.id,
            name: v.name,
            type: v.type,
            filters: v.filters ?? [],
            sorts: v.sorts ?? [],
            pageSize: v.pageSize ?? 50,
          })),
        });
      }

      // -- add_view --
      if (name === 'add_view') {
        const { avId, viewName, viewType = 'table' } = args as {
          avId: string;
          viewName?: string;
          viewType?: AVViewType;
        };
        await client.addAVView(avId, viewType, viewName);
        return ok({ success: true, avId, viewName, viewType });
      }

      // -- update_view --
      if (name === 'update_view') {
        const { avId, viewId, name: viewName, type: viewType, sorts, filters } = args as {
          avId: string;
          viewId: string;
          name?: string;
          type?: AVViewType;
          sorts?: unknown[];
          filters?: unknown[];
        };

        if (viewName || viewType) {
          await client.updateAVView(avId, viewId, {
            ...(viewName ? { name: viewName } : {}),
            ...(viewType ? { type: viewType } : {}),
          });
        }

        if (sorts !== undefined || filters !== undefined) {
          await client.setAVViewQuery(avId, viewId, {
            ...(sorts !== undefined ? { sorts } : {}),
            ...(filters !== undefined ? { filters } : {}),
          });
        }

        return ok({ success: true, avId, viewId });
      }

      // -- delete_view --
      if (name === 'delete_view') {
        const { avId, viewId } = args as { avId: string; viewId: string };
        await client.removeAVView(avId, viewId);
        return ok({ success: true, avId, viewId });
      }

      // -- list_select_options --
      if (name === 'list_select_options') {
        const { avId, keyId } = args as { avId: string; keyId: string };
        const result = await client.getAVKeyOptions(avId, keyId);
        return ok({ avId, keyId, options: result.options ?? [] });
      }

      // -- set_select_options --
      if (name === 'set_select_options') {
        const { avId, keyId, options } = args as {
          avId: string;
          keyId: string;
          options: Array<{ name: string; color?: string }>;
        };

        const formattedOptions: AVKeyOption[] = options.map((opt, i) => ({
          name: opt.name,
          color: opt.color ?? getOptionColor(i),
        }));

        await client.setAVKeyOptions(avId, keyId, formattedOptions);
        return ok({ success: true, avId, keyId, options: formattedOptions });
      }

      // -- bind_row_to_doc --
      if (name === 'bind_row_to_doc') {
        const { avId, blockIds, previousId } = args as {
          avId: string;
          blockIds: string[];
          previousId?: string;
        };
        await client.addAVBlocks(avId, blockIds, previousId);
        return ok({ success: true, avId, addedBlockIds: blockIds });
      }

      // -- create_doc_backed_row --
      if (name === 'create_doc_backed_row') {
        const { avId, notebookId, path, markdown = '', previousId } = args as {
          avId: string;
          notebookId: string;
          path: string;
          markdown?: string;
          previousId?: string;
        };

        const docId = await client.createDocWithMd(notebookId, path, markdown);
        await client.addAVBlocks(avId, [docId], previousId);

        return ok({ success: true, avId, docId, path });
      }

      return err(`Unknown database tool: ${name}`);
    } catch (e) {
      return err(`${name} failed`, e);
    }
  },
};

export default mod;

// --- Internal: extract a human-readable value from a cell ---

function extractCellValue(cell: AVCellValue): unknown {
  switch (cell.type) {
    case 'text': return cell.text?.content ?? '';
    case 'number': return cell.number?.isNotEmpty ? cell.number.content : null;
    case 'checkbox': return cell.checkbox?.checked ?? false;
    // SiYuan stores single-select values under `mSelect` too, so fall back to it.
    case 'select': return cell.mSelect?.[0]?.content ?? cell.select?.content ?? '';
    case 'mSelect': return (cell.mSelect ?? []).map((s) => s.content);
    case 'date': return cell.date?.isNotEmpty ? new Date(cell.date.content).toISOString() : null;
    case 'url': return cell.url?.content ?? '';
    case 'email': return cell.email?.content ?? '';
    case 'phone': return cell.phone?.content ?? '';
    case 'mAsset': return cell.mAsset ?? [];
    case 'relation': return (cell.relation?.contents ?? []).map((r) => r.id);
    case 'block': return cell.block ? { id: cell.block.id, content: cell.block.content } : null;
    case 'created': return cell.created?.content ? new Date(cell.created.content).toISOString() : null;
    case 'updated': return cell.updated?.content ? new Date(cell.updated.content).toISOString() : null;
    default: return null;
  }
}
