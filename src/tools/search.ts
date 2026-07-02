import { getClient } from '../client';
import { ok, err } from '../utils';
import type { ToolModule } from '../types';

/**
 * Unified full-text search. This is the primary "find things" entry point for
 * AI callers: a single keyword query searches document titles, block content,
 * AND the rendered content of databases (Attribute Views). When a hit is a
 * database block, we surface its avID so the caller can immediately drill in
 * with `read_database` (plain SQL can NOT see database rows).
 */

const AV_ID_RE = /data-av-id="([^"]+)"/;

interface RawBlock {
  id: string;
  rootID: string;
  hPath: string;
  box: string;
  type: string;
  content: string;
  markdown: string;
  ial?: Record<string, string>;
}

const mod: ToolModule = {
  tools: [
    {
      name: 'search',
      description:
        'Full-text search across the whole SiYuan workspace by keyword. ' +
        'This is the best way to FIND anything — it matches document titles, ' +
        'paragraph/heading/list content, AND the contents of databases ' +
        '(Attribute Views / tables / kanban / todo lists). ' +
        'Plain SQL (siyuan_sql) can NOT see database rows, so use THIS tool to ' +
        'locate to-do items, tasks, table entries, etc. ' +
        'Results are grouped by document. When a hit is a database, the result ' +
        'includes its `avId` — pass that to `read_database` to read the full rows. ' +
        'Matched text is wrapped in <mark>…</mark>.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Keyword(s) to search for. Space-separated terms are AND-matched.',
          },
          limit: {
            type: 'number',
            description: 'Max blocks to return (default: 30)',
          },
        },
        required: ['query'],
      },
    },
  ],

  async handle(name, args) {
    const client = getClient();
    try {
      if (name === 'search') {
        const { query, limit = 30 } = args as { query: string; limit?: number };
        if (!query || !query.trim()) return err('query is required');

        const result = await client.fullTextSearchBlock(query, { method: 0, page: 1 });
        const blocks = (result.blocks ?? []).slice(0, limit) as unknown as RawBlock[];

        // Collect databases hit so the caller knows exactly how to drill in.
        const databases: Array<{ avId: string; docId: string; hpath: string; match: string }> = [];
        const seenAv = new Set<string>();

        const hits = blocks.map((b) => {
          const isDatabase = b.type === 'NodeAttributeView';
          let avId: string | undefined;
          if (isDatabase) {
            avId = AV_ID_RE.exec(b.markdown ?? '')?.[1];
            if (avId && !seenAv.has(avId)) {
              seenAv.add(avId);
              databases.push({ avId, docId: b.rootID, hpath: b.hPath, match: b.content });
            }
          }
          return {
            blockId: b.id,
            docId: b.rootID,
            notebookId: b.box,
            hpath: b.hPath,
            type: b.type,
            isDatabase,
            ...(avId ? { avId } : {}),
            match: b.content,
          };
        });

        return ok({
          query,
          matchedBlockCount: result.matchedBlockCount,
          matchedDocCount: result.matchedRootCount,
          returned: hits.length,
          // Highlight databases separately so the AI immediately sees where to
          // use read_database instead of giving up.
          databasesFound: databases,
          hint:
            databases.length > 0
              ? `Some matches are inside databases. Call read_database with the listed avId(s) to read their rows.`
              : undefined,
          hits,
        });
      }

      return err(`Unknown search tool: ${name}`);
    } catch (e) {
      return err(`${name} failed`, e);
    }
  },
};

export default mod;
