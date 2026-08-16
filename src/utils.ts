import type { MCPToolResult } from './types';

// ─── ID Generation ────────────────────────────────────────────────────────────

/** Generate a SiYuan-style timestamp ID: `yyyyMMddHHmmss-xxxxxxx` */
export function generateId(): string {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  const ts = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('');
  const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let rand = '';
  for (let i = 0; i < 7; i++) {
    rand += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return `${ts}-${rand}`;
}

/** Return numeric timestamp string `yyyyMMddHHmmss` for SiYuan updated fields */
export function getTimestamp(): string {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('');
}

// ─── Tool Result Helpers ──────────────────────────────────────────────────────

export function ok(data: unknown): MCPToolResult {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: 'text', text }] };
}

export function err(message: string, detail?: unknown): MCPToolResult {
  const text = detail
    ? `Error: ${message}\n${detail instanceof Error ? detail.message : JSON.stringify(detail)}`
    : `Error: ${message}`;
  return { content: [{ type: 'text', text }], isError: true };
}

// ─── Color palette for auto-assigned select options ──────────────────────────

/**
 * SiYuan stores select-option colours as palette indexes "1".."14"
 * (kernel `av.FilterColorValue` rejects anything else, silently blanking it).
 */
const OPTION_COLOR_COUNT = 14;

export function getOptionColor(index: number): string {
  return String((index % OPTION_COLOR_COUNT) + 1);
}

// ─── Misc ─────────────────────────────────────────────────────────────────────

/** Count the depth of a SiYuan storage path (number of `/id` segments) */
export function pathDepth(path: string): number {
  return (path.match(/\//g) || []).length;
}
