// Clean up the broken db+doc, then re-create the 福永球幕 project correctly
// using the FIXED create_database (3.6.5 schema) via the compiled dist.
import fs from 'node:fs';
for (const line of fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  if (!line.trim()) continue;
  const i = line.indexOf('=');
  process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const { handleTool } = await import('../dist/tools/index.js');
const call = async (n, a) => {
  const r = await handleTool(n, a);
  const t = r.content?.[0]?.text ?? '';
  let d; try { d = JSON.parse(t); } catch { d = t; }
  if (r.isError) console.log('  ⚠️', n, '->', t.slice(0, 200));
  return d;
};

// 1. Clean up the previous broken attempt.
const OLD_DOC = '20260702095836-8hlkmvg';
const OLD_AV = '20260702095843-fbagab3';
await call('delete_document', { id: OLD_DOC });
await call('remove_file', { path: `/data/storage/av/${OLD_AV}.json` });
console.log('cleanup done');

// 2. Recreate the project document.
const doc = await call('create_document', {
  notebookId: '20260430092425-1ra1d50',
  path: '/福永球幕光显平台',
  markdown: [
    '# 福永球幕光显平台', '',
    '> 由 MCP 自动录入（曾炫 7/1 项目安排）', '',
    '## 项目分工',
    '- **定制开发负责人**：易子旭（Ezreal）',
    '- **项目经理**：王梦琴（外部资源、设备等由 PM 协调）',
    '- **后台开发**：詹国庆', '',
    '## 关键约束 / 审批',
    '- 除设备清单表格中的需求外，**其他额外定制开发需求需经刘玥总和赵宏总同意后再开始**。',
    '- 内部开发遇到难点或推进不下去，找曾炫一起沟通分解。',
    '- 待确认：项目经理立项是否包含「定制开发交付」这部分工作；若不包含，周会向领导确认是否另行立项。', '',
    '## 状态', '- 7/1 已排上日程，开始跟进。', '',
    '## 设备清单', '下方数据库为《福永球幕光显平台设备清单.xlsx》录入内容。',
  ].join('\n'),
});
console.log('doc:', doc.docId);

// 3. Create the equipment database (fixed schema) embedded in the doc.
const db = await call('create_database', {
  name: '福永球幕设备清单',
  parentDocId: doc.docId,
  primaryFieldName: '设备名称',
  fields: [
    { name: '分类', type: 'select', options: ['设备类', '软件类'] },
    { name: '品牌', type: 'select', options: ['洲明', '华为'] },
    { name: '型号', type: 'text' },
    { name: '数量', type: 'number' },
    { name: '单位', type: 'text' },
    { name: '主要规格', type: 'text' },
    { name: '物料编码', type: 'text' },
    { name: '备注', type: 'text' },
  ],
});
console.log('db avID:', db.avID);

// 4. Load equipment rows from the parsed xlsx dump.
const raw = JSON.parse(fs.readFileSync(new URL('./_xlsx_dump.json', import.meta.url), 'utf8'));
const rows = raw.slice(1).map((c) => ({
  '设备名称': c[2], '分类': c[1], '品牌': c[3], '型号': c[4] === '/' ? '' : c[4],
  '数量': Number(c[6]) || 0, '单位': c[7], '主要规格': c[5], '备注': c[8], '物料编码': c[9],
}));
const w = await call('write_db_rows', { avId: db.avID, rows });
console.log('rows inserted:', w.inserted, '| ids ok:', w.blockIDs.every((x) => x));

// 5. Read back to verify.
const rd = await call('read_database', { avId: db.avID });
console.log('read back -> view:', rd.viewName, '| rowCount:', rd.rowCount);
console.log('sample:', rd.rows.slice(0, 3).map((r) => `${r.cells['设备名称']?.content}[${r.cells['分类']}] x${r.cells['数量']}`).join(' | '));

// 6. Search to prove discoverability.
const s = await call('search', { query: '福永球幕' });
console.log('search 福永球幕 -> matched docs:', s.matchedDocCount, '| databasesFound:', s.databasesFound.map((d) => d.avId).join(','));
