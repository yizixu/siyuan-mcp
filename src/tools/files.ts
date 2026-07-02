import { getClient } from '../client';
import { ok, err } from '../utils';
import type { ToolModule } from '../types';

/**
 * Raw workspace file operations (under the SiYuan data/ workspace root).
 * Paths are workspace-relative and start with "/", e.g. "/data/storage/av/xxx.json".
 * These are lower-level than the document/block tools — use them for config
 * files, storage JSON, and asset management.
 */

const mod: ToolModule = {
  tools: [
    {
      name: 'read_file',
      description:
        'Read a raw file from the SiYuan workspace by path (e.g. "/data/storage/petal/xxx.json"). ' +
        'Returns the file content as text. For reading documents prefer export_doc_markdown.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Workspace-relative path starting with /' },
        },
        required: ['path'],
      },
    },
    {
      name: 'write_file',
      description:
        'Write/overwrite a raw text file in the SiYuan workspace by path. ' +
        'Creates parent folders as needed. Use with care — this writes directly to disk.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Workspace-relative path starting with /' },
          content: { type: 'string', description: 'Text content to write' },
        },
        required: ['path', 'content'],
      },
    },
    {
      name: 'remove_file',
      description: 'Delete a file or folder in the SiYuan workspace by path (irreversible).',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Workspace-relative path starting with /' },
        },
        required: ['path'],
      },
    },
    {
      name: 'rename_file',
      description: 'Rename or move a file within the SiYuan workspace.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Current workspace-relative path' },
          newPath: { type: 'string', description: 'New workspace-relative path' },
        },
        required: ['path', 'newPath'],
      },
    },
    {
      name: 'read_dir',
      description: 'List the entries of a workspace directory. Returns name, isDir, updated for each entry.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Workspace-relative directory path starting with /' },
        },
        required: ['path'],
      },
    },
  ],

  async handle(name, args) {
    const client = getClient();
    try {
      if (name === 'read_file') {
        const { path } = args as { path: string };
        const content = await client.getFile(path);
        return ok({ path, content });
      }

      if (name === 'write_file') {
        const { path, content } = args as { path: string; content: string };
        await client.putFile(path, content);
        return ok({ success: true, path, bytes: Buffer.byteLength(content, 'utf8') });
      }

      if (name === 'remove_file') {
        const { path } = args as { path: string };
        await client.removeFile(path);
        return ok({ success: true, path });
      }

      if (name === 'rename_file') {
        const { path, newPath } = args as { path: string; newPath: string };
        await client.renameFile(path, newPath);
        return ok({ success: true, path, newPath });
      }

      if (name === 'read_dir') {
        const { path } = args as { path: string };
        const entries = await client.readDir(path);
        return ok({ path, entries });
      }

      return err(`Unknown file tool: ${name}`);
    } catch (e) {
      return err(`${name} failed`, e);
    }
  },
};

export default mod;
