import fs from 'node:fs';
for (const l of fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  if (!l.trim()) continue; const i = l.indexOf('='); process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
const { handleTool } = await import('../dist/tools/index.js');
const call = async (n, a) => { const r = await handleTool(n, a); let d; try { d = JSON.parse(r.content[0].text); } catch { d = r.content[0].text; } if (r.isError) console.log('ERR', n, d); return d; };
const base = process.env.SIYUAN_API_URL, tok = process.env.SIYUAN_API_TOKEN;
const gf = async (p) => JSON.parse(await (await fetch(base + '/api/file/getFile', { method: 'POST', headers: { Authorization: 'Token ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ path: p }) })).text());
const TODO = '20260430100533-cgkxvgy', REL = '20260430101210-ggr6c6v', PROD = '20260601102953-ybdq451';

const w = await call('write_db_rows', { avId: TODO, rows: [{ '事项名称': '__关联自测_可删__', '优先级': 'P3', '状态': '未开始' }] });
const rid = w.blockIDs[0]; console.log('临时任务行:', rid);
await call('update_db_cells', { avId: TODO, updates: [{ rowId: rid, keyId: REL, value: [PROD] }] });
const j = await gf('/data/storage/av/' + TODO + '.json');
const relVals = j.keyValues.find((k) => k.key.id === REL).values.find((v) => v.blockID === rid);
console.log('关联字段值:', JSON.stringify(relVals?.relation));
const pj = await gf('/data/storage/av/20260430101306-5iyrwdd.json');
const back = pj.keyValues.find((k) => k.key.name === '事项列表 关联').values.find((v) => v.blockID === PROD);
console.log('产品库[光显魔笔]反向包含临时任务?', JSON.stringify(back?.relation?.blockIDs || []).includes(rid));
await call('delete_db_rows', { avId: TODO, rowIds: [rid] });
console.log('已删除临时任务');
