// End-to-end test of the new MCP tool handlers against the live SiYuan.
import fs from 'node:fs';

// Load .env into process.env (the compiled client reads these).
for (const line of fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  if (!line.trim()) continue;
  const i = line.indexOf('=');
  process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const { handleTool } = await import('../dist/tools/index.js');

let pass = 0, fail = 0;
async function run(label, name, args, check) {
  const res = await handleTool(name, args);
  const text = res.content?.[0]?.text ?? '';
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  const ok = !res.isError && (check ? check(data) : true);
  console.log(`${ok ? '✅' : '❌'} ${label}`);
  if (!ok) { console.log('   ->', text.slice(0, 300)); fail++; }
  else pass++;
  return data;
}

// A doc known from earlier probing: /待办事项
const TODO_DOC = '20260430095928-7efs3sm';

await run('get_current_time', 'get_current_time', {}, (d) => typeof d.epochMs === 'number' && d.iso);
await run('render_sprig', 'render_sprig', { template: '{{now | date "2006-01-02"}}' },
  (d) => /^\d{4}-\d{2}-\d{2}$/.test(d.rendered));
await run('read_dir /data/storage/av', 'read_dir', { path: '/data/storage/av' },
  (d) => Array.isArray(d.entries) && d.entries.length > 0);
await run('export_doc_markdown', 'export_doc_markdown', { id: TODO_DOC },
  (d) => typeof d.content === 'string' && d.hPath);
await run('resolve_doc_path (id->hpath)', 'resolve_doc_path', { id: TODO_DOC },
  (d) => d.hpath === '/待办事项');
await run('get_child_blocks', 'get_child_blocks', { id: TODO_DOC },
  (d) => Array.isArray(d.children));
await run('push_message', 'push_message', { message: 'MCP 自测通知 ✅', timeout: 3000 },
  (d) => d.success === true);

// THE key test: search must find the todo database and surface its avId.
const s = await run('search 待办 (finds database)', 'search', { query: '待办' },
  (d) => Array.isArray(d.hits) && d.hits.length > 0);
console.log('   databasesFound:', JSON.stringify(s.databasesFound));
console.log('   hint:', s.hint);

// search by a row value that ONLY exists inside the database
const s2 = await run('search row content 评审余杭斗屏', 'search', { query: '评审余杭斗屏' },
  (d) => d.databasesFound && d.databasesFound.length > 0);
const avId = s2.databasesFound?.[0]?.avId;
console.log('   -> avId from search:', avId);

// Drill into that database to prove the search->read_database flow works.
if (avId) {
  await run('read_database (from searched avId)', 'read_database', { avId },
    (d) => Array.isArray(d.rows));
}

// Notebook lifecycle round-trip (create then remove) to verify write paths.
const created = await run('create_notebook (temp)', 'create_notebook', { name: '__mcp_selftest__' },
  (d) => d.success && d.notebook?.id);
const tmpId = created.notebook?.id;
if (tmpId) {
  await run('get_notebook_conf', 'get_notebook_conf', { notebookId: tmpId },
    (d) => d.conf && d.name);
  await run('manage_notebook close', 'manage_notebook', { notebookId: tmpId, action: 'close' },
    (d) => d.success);
  await run('manage_notebook remove (cleanup)', 'manage_notebook', { notebookId: tmpId, action: 'remove' },
    (d) => d.success);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
