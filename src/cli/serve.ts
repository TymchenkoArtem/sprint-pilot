/**
 * serve -- Start the SprintPilot MCP server on stdio.
 *
 * Dynamically imports the main index module which sets up the server
 * and connects via StdioServerTransport.
 */
export async function runServe(): Promise<void> {
  await import('../index.js');
}
