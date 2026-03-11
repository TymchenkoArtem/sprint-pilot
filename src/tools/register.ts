import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerSpInit } from './sp-init.js';
import { registerSpConfig } from './sp-config.js';
import { registerSpMyItems } from './sp-my-items.js';
import { registerSpGetItem } from './sp-get-item.js';
import { registerSpGetComments } from './sp-get-comments.js';
import { registerSpPostComment } from './sp-post-comment.js';
import { registerSpUpdateStatus } from './sp-update-status.js';
import { registerSpCreateBranch } from './sp-create-branch.js';
import { registerSpCreatePr } from './sp-create-pr.js';
import { registerSpGetIterations } from './sp-get-iterations.js';
import { registerSpTrackUsage } from './sp-track-usage.js';
import { registerSpInstructions } from './sp-instructions.js';

export function registerTools(server: McpServer): void {
  registerSpInit(server);
  registerSpConfig(server);
  registerSpMyItems(server);
  registerSpGetItem(server);
  registerSpGetComments(server);
  registerSpPostComment(server);
  registerSpUpdateStatus(server);
  registerSpCreateBranch(server);
  registerSpCreatePr(server);
  registerSpGetIterations(server);
  registerSpTrackUsage(server);
  registerSpInstructions(server);
}
