import { getClient } from '../client';
import { ok, err } from '../utils';
import type { ToolModule } from '../types';

const mod: ToolModule = {
  tools: [
    {
      name: 'list_notebooks',
      description:
        'List all SiYuan notebooks (open and closed). Returns id, name, icon, sort, and closed status.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'rename_notebook',
      description: 'Rename a SiYuan notebook by its ID.',
      inputSchema: {
        type: 'object',
        properties: {
          notebookId: {
            type: 'string',
            description: 'Notebook ID (e.g. 20210817205410-2kvfpfn)',
          },
          name: {
            type: 'string',
            description: 'New notebook name',
          },
        },
        required: ['notebookId', 'name'],
      },
    },
    {
      name: 'create_notebook',
      description: 'Create a new notebook. Returns the new notebook object (id, name, ...).',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Notebook name' },
        },
        required: ['name'],
      },
    },
    {
      name: 'manage_notebook',
      description:
        'Open, close, or delete a notebook by ID. ' +
        'action="open" mounts it, "close" unmounts it, "remove" permanently deletes it (irreversible).',
      inputSchema: {
        type: 'object',
        properties: {
          notebookId: { type: 'string', description: 'Notebook ID' },
          action: {
            type: 'string',
            enum: ['open', 'close', 'remove'],
            description: 'open (mount), close (unmount), or remove (delete permanently)',
          },
        },
        required: ['notebookId', 'action'],
      },
    },
    {
      name: 'get_notebook_conf',
      description: 'Get a notebook\'s configuration (name, sort mode, ref-create settings, etc.).',
      inputSchema: {
        type: 'object',
        properties: {
          notebookId: { type: 'string', description: 'Notebook ID' },
        },
        required: ['notebookId'],
      },
    },
    {
      name: 'set_notebook_conf',
      description:
        'Update a notebook\'s configuration. Provide a conf object with the fields to change ' +
        '(e.g. { sortMode: 6, closed: false }). Unspecified fields are left unchanged by SiYuan.',
      inputSchema: {
        type: 'object',
        properties: {
          notebookId: { type: 'string', description: 'Notebook ID' },
          conf: {
            type: 'object',
            description: 'Notebook config fields to set',
            additionalProperties: true,
          },
        },
        required: ['notebookId', 'conf'],
      },
    },
  ],

  async handle(name, args) {
    const client = getClient();
    try {
      if (name === 'list_notebooks') {
        const { notebooks } = await client.lsNotebooks();
        return ok({ notebooks });
      }

      if (name === 'rename_notebook') {
        const { notebookId, name: newName } = args as { notebookId: string; name: string };
        await client.renameNotebook(notebookId, newName);
        return ok({ success: true, notebookId, newName });
      }

      if (name === 'create_notebook') {
        const { name: nbName } = args as { name: string };
        const result = await client.createNotebook(nbName);
        return ok({ success: true, notebook: result.notebook });
      }

      if (name === 'manage_notebook') {
        const { notebookId, action } = args as {
          notebookId: string;
          action: 'open' | 'close' | 'remove';
        };
        if (action === 'open') await client.openNotebook(notebookId);
        else if (action === 'close') await client.closeNotebook(notebookId);
        else if (action === 'remove') await client.removeNotebook(notebookId);
        else return err(`Unknown action: ${action}`);
        return ok({ success: true, notebookId, action });
      }

      if (name === 'get_notebook_conf') {
        const { notebookId } = args as { notebookId: string };
        const conf = await client.getNotebookConf(notebookId);
        return ok(conf);
      }

      if (name === 'set_notebook_conf') {
        const { notebookId, conf } = args as {
          notebookId: string;
          conf: Record<string, unknown>;
        };
        const result = await client.setNotebookConf(notebookId, conf);
        return ok({ success: true, notebookId, result });
      }

      return err(`Unknown notebook tool: ${name}`);
    } catch (e) {
      return err(`${name} failed`, e);
    }
  },
};

export default mod;
