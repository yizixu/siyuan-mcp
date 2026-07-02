// Ad-hoc probe of SiYuan kernel endpoints using the .env token.
import fs from 'node:fs';

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/).filter(Boolean).map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
const BASE = env.SIYUAN_API_URL || 'http://127.0.0.1:6806';
const TOKEN = env.SIYUAN_API_TOKEN;

async function api(path, body = {}) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { Authorization: `Token ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try { return { http: res.status, json: JSON.parse(text) }; }
  catch { return { http: res.status, raw: text.slice(0, 300) }; }
}

function show(label, r) {
  const j = r.json;
  let peek = r.raw;
  if (j) {
    peek = { code: j.code, msg: j.msg, dataType: Array.isArray(j.data) ? `array[${j.data.length}]` : typeof j.data };
    if (j.data && typeof j.data === 'object') peek.dataKeys = Object.keys(j.data).slice(0, 12);
  }
  console.log(`\n### ${label}  [http ${r.http}]`);
  console.log(JSON.stringify(peek, null, 2));
}

const nb = (await api('/api/notebook/lsNotebooks')).json.data.notebooks[0];
console.log('first notebook:', nb.id, nb.name);

show('currentTime', await api('/api/system/currentTime'));
show('getNotebookConf', await api('/api/notebook/getNotebookConf', { notebook: nb.id }));
show('renderSprig', await api('/api/template/renderSprig', { template: '{{now | date "2006-01-02"}}' }));
show('readDir /data/storage/av', await api('/api/file/readDir', { path: '/data/storage/av' }));
show('exportMdContent(待办事项 doc)', await api('/api/export/exportMdContent', { id: '20260430095928-7efs3sm' }));
show('fullTextSearchBlock 待办', await api('/api/search/fullTextSearchBlock', { query: '待办', method: 0, page: 1 }));

// peek deeper into search result shape
const s = (await api('/api/search/fullTextSearchBlock', { query: '评审余杭斗屏', method: 0, page: 1 })).json.data;
console.log('\n### search "评审余杭斗屏" first block shape:');
console.log(JSON.stringify((s.blocks || [])[0] &&
  Object.fromEntries(Object.entries(s.blocks[0]).map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 60) : Array.isArray(v) ? `array[${v.length}]` : v])), null, 2));
