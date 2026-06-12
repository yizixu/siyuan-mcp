import notebooks from './notebooks';
import documents from './documents';
import blocks from './blocks';
import database from './database';
import system from './system';
import type { ToolDef, MCPToolResult, ToolModule } from '../types';

const modules: ToolModule[] = [notebooks, documents, blocks, database, system];

/** Flat list of all tool definitions (for ListTools response) */
export function getAllTools(): ToolDef[] {
  return modules.flatMap((m) => m.tools);
}

/**
 * Route a tool call to the correct module handler.
 * Returns a standardised MCP tool result.
 */
export async function handleTool(
  name: string,
  args: Record<string, unknown> = {}
): Promise<MCPToolResult> {
  for (const mod of modules) {
    if (mod.tools.some((t) => t.name === name)) {
      return mod.handle(name, args);
    }
  }
  return {
    content: [{ type: 'text', text: `Error: Unknown tool "${name}"` }],
    isError: true,
  };
}
