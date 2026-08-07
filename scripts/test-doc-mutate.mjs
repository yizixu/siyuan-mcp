/**
 * Unit tests for pure document-mutation helpers (no SiYuan I/O).
 * Run: node scripts/test-doc-mutate.mjs
 * Requires: npm run build first (imports from dist).
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mod = await import(
  pathToFileURL(path.join(__dirname, '../dist/tools/document-mutate.js')).href
);

const { isAttributeViewChildType, childIdsToDeleteOnContentReplace } = mod;

assert.equal(isAttributeViewChildType('av'), true);
assert.equal(isAttributeViewChildType('NodeAttributeView'), true);
assert.equal(isAttributeViewChildType('p'), false);
assert.equal(isAttributeViewChildType('h'), false);
assert.equal(isAttributeViewChildType(undefined), false);

const children = [
  { id: 'a', type: 'h' },
  { id: 'b', type: 'av' },
  { id: 'c', type: 'p' },
  { id: 'd', type: 'NodeAttributeView' },
];

assert.deepEqual(childIdsToDeleteOnContentReplace(children, false).sort(), ['a', 'c']);
assert.deepEqual(childIdsToDeleteOnContentReplace(children, true).sort(), ['a', 'b', 'c', 'd']);
assert.deepEqual(childIdsToDeleteOnContentReplace([], false), []);

console.log('test-doc-mutate: OK');
