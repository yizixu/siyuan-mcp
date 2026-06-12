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

      return err(`Unknown notebook tool: ${name}`);
    } catch (e) {
      return err(`${name} failed`, e);
    }
  },
};

export default mod;
