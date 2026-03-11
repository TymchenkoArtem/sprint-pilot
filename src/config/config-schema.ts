import { z } from 'zod';

export const StatusMappingSchema = z.object({
  blocked: z.string(),
  inProgress: z.string(),
  inReview: z.string(),
});

export const GitConfigSchema = z.object({
  baseBranchOrTag: z.string().min(1),
  prTargetBranch: z.string().min(1),
  branchTemplate: z.string().min(1),
  commitTemplate: z.string().min(1),
});

export const TestingConfigSchema = z.object({
  devServerCommand: z.string().optional(),
  testCommand: z.string().min(1),
});

export const ConfigSchema = z.object({
  organizationUrl: z.string().url(),
  project: z.string().min(1),
  team: z.string().min(1).optional(),
  allowedWorkItemTypes: z.array(z.string().min(1)).min(1),
  statusMapping: z.record(z.string(), StatusMappingSchema),
  git: GitConfigSchema,
  testing: TestingConfigSchema,
});

export type SprintPilotConfig = z.infer<typeof ConfigSchema>;
