/**
 * Pure helpers for document mutation policy (testable without SiYuan I/O).
 */

/** SiYuan child type strings that represent an Attribute View embed. */
export function isAttributeViewChildType(type: string | undefined | null): boolean {
  if (!type) return false;
  const t = String(type).toLowerCase();
  return t === 'av' || t === 'nodeattributeview' || t.includes('attributeview');
}

/**
 * Which child block IDs should be deleted when replacing document content.
 * By default Attribute View embeds are preserved; pass force=true to wipe all.
 */
export function childIdsToDeleteOnContentReplace(
  children: Array<{ id: string; type?: string }>,
  force = false
): string[] {
  if (force) return children.map((c) => c.id);
  return children.filter((c) => !isAttributeViewChildType(c.type)).map((c) => c.id);
}
