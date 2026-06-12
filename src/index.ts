#!/usr/bin/env node
import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { getAllTools, handleTool } from './tools/index';

const server = new Server(
  { name: 'siyuan-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: getAllTools() };
});

/* eslint-disable @typescript-eslint/no-explicit-any */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  try {
    const result = await handleTool(name, args as Record<string, unknown>);
    return result as any;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write('[siyuan-mcp] Tool "' + name + '" threw: ' + message + '\n');
    return { content: [{ type: 'text', text: 'Internal error: ' + message }], isError: true } as any;
  }
});
/* eslint-enable @typescript-eslint/no-explicit-any */

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('[siyuan-mcp] Server started on stdio\n');
}

main().catch((error) => {
  const msg = error instanceof Error ? error.message : String(error);
  process.stderr.write('[siyuan-mcp] Fatal: ' + msg + '\n');
  process.exit(1);
});
