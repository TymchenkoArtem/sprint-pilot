import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { registerTools } from './tools/register.js';

const server = new McpServer({
  name: 'sprint-pilot',
  version: '1.0.0',
});

registerTools(server); // metadata only -- no I/O, no config load, no auth

const transport = new StdioServerTransport();
await server.connect(transport);
