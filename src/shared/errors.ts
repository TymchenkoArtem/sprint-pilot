import { ZodError } from 'zod';

// ---------------------------------------------------------------------------
// Error code union -- canonical Phase 1 set
// ---------------------------------------------------------------------------

export type ErrorCode =
  | 'scope_violation'         // ScopeValidator rejections
  | 'auth_missing'            // No PAT found in keychain or fallback
  | 'auth_expired'            // PAT expired or rejected by ADO (HTTP 401)
  | 'auth_insufficient_scope' // PAT missing required scopes (HTTP 403 during validation)
  | 'ado_forbidden'           // ADO HTTP 403 (not scope-related)
  | 'ado_unreachable'         // Network error, DNS failure, or ADO 5xx
  | 'ado_not_found'           // ADO HTTP 404
  | 'config_missing'          // .sprint-pilot/config.md not found
  | 'config_invalid'          // Config fails Zod validation after parsing
  | 'fabric_missing'          // fabric/ directory not found
  | 'product_missing'         // fabric/product/ not found
  | 'validation_error'        // Zod input validation failure on tool arguments
  | 'not_found'               // Work item/resource not found
  | 'invalid_status'          // Unmapped status key
  | 'pat_invalid'             // PAT validation failed (wrong scopes, revoked)
  | 'invalid_transition'      // ADO rejected the state transition
  | 'branch_exists'           // Branch already exists
  | 'empty_diff';             // No changes between source and target

// ---------------------------------------------------------------------------
// Base class
// ---------------------------------------------------------------------------

export class SprintPilotError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly guidance?: string,
  ) {
    super(message);
    this.name = 'SprintPilotError';
  }

  toJSON(): { error: ErrorCode; message: string; guidance?: string } {
    const result: { error: ErrorCode; message: string; guidance?: string } = {
      error: this.code,
      message: this.message,
    };
    if (this.guidance !== undefined) {
      result.guidance = this.guidance;
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// Subclasses
// ---------------------------------------------------------------------------

export class ScopeViolationError extends SprintPilotError {
  constructor(reason: string) {
    super(
      'scope_violation',
      reason,
      "This operation is outside SprintPilot's configured scope.",
    );
    this.name = 'ScopeViolationError';
  }
}

export class AuthMissingError extends SprintPilotError {
  constructor() {
    super(
      'auth_missing',
      'No PAT found in keychain or fallback file.',
      'Run "sprint-pilot setup-claude" (or setup-cursor, etc.) in your terminal to configure SprintPilot.',
    );
    this.name = 'AuthMissingError';
  }
}

export class AuthExpiredError extends SprintPilotError {
  constructor() {
    super(
      'auth_expired',
      'Authentication token is expired or invalid.',
      'Run "sprint-pilot init --reconfigure-pat" in your terminal to update your PAT.',
    );
    this.name = 'AuthExpiredError';
  }
}

export class ConfigMissingError extends SprintPilotError {
  constructor() {
    super(
      'config_missing',
      'SprintPilot configuration not found.',
      'Run "sprint-pilot setup-claude" (or setup-cursor, etc.) in your terminal to initialize SprintPilot.',
    );
    this.name = 'ConfigMissingError';
  }
}

export class ConfigInvalidError extends SprintPilotError {
  constructor(detail: string) {
    super(
      'config_invalid',
      detail,
    );
    this.name = 'ConfigInvalidError';
  }
}

export class FabricMissingError extends SprintPilotError {
  constructor() {
    super(
      'fabric_missing',
      'The fabric/ directory was not found in the project root.',
      'Run /standards-shaper from your AI tool to initialize Fabric.',
    );
    this.name = 'FabricMissingError';
  }
}

export class ProductMissingError extends SprintPilotError {
  constructor() {
    super(
      'product_missing',
      'The fabric/product/ directory was not found.',
      'Run /plan-product from your AI tool to create product specs.',
    );
    this.name = 'ProductMissingError';
  }
}

export class PatInvalidError extends SprintPilotError {
  constructor(detail: string) {
    super(
      'pat_invalid',
      `PAT validation failed: ${detail}`,
      'Create a new PAT with required scopes and run "sprint-pilot init --reconfigure-pat" in your terminal.',
    );
    this.name = 'PatInvalidError';
  }
}

export class AdoUnreachableError extends SprintPilotError {
  constructor() {
    super(
      'ado_unreachable',
      'Cannot reach Azure DevOps.',
      'Check your network connection and VPN status.',
    );
    this.name = 'AdoUnreachableError';
  }
}

export class AdoNotFoundError extends SprintPilotError {
  constructor(detail?: string) {
    super(
      'ado_not_found',
      detail ?? 'The requested Azure DevOps resource was not found.',
    );
    this.name = 'AdoNotFoundError';
  }
}

export class AdoForbiddenError extends SprintPilotError {
  constructor(detail?: string) {
    super(
      'ado_forbidden',
      detail ?? 'Access denied by Azure DevOps.',
      'Check that your PAT has the required scopes.',
    );
    this.name = 'AdoForbiddenError';
  }
}

export class InvalidStatusError extends SprintPilotError {
  constructor(provided: string, allowed: string[]) {
    super(
      'invalid_status',
      `Status "${provided}" is not mapped. Allowed: ${allowed.join(', ')}`,
      'Use one of the mapped status keys from config.',
    );
    this.name = 'InvalidStatusError';
  }
}

export class BranchExistsError extends SprintPilotError {
  constructor(branchName: string) {
    super(
      'branch_exists',
      `Branch "${branchName}" already exists.`,
    );
    this.name = 'BranchExistsError';
  }
}

export class EmptyDiffError extends SprintPilotError {
  constructor() {
    super(
      'empty_diff',
      'No changes between source and target branches.',
      'Make sure there are commits on the source branch that are not on the target.',
    );
    this.name = 'EmptyDiffError';
  }
}

export class ValidationError extends SprintPilotError {
  constructor(detail: string) {
    super(
      'validation_error',
      detail,
      'Check the input parameters and try again.',
    );
    this.name = 'ValidationError';
  }
}

// ---------------------------------------------------------------------------
// Sensitive-pattern sanitization
// ---------------------------------------------------------------------------

const SENSITIVE_PATTERNS: readonly RegExp[] = [
  /Basic\s+[A-Za-z0-9+/=]+/gi,          // Base64 auth headers
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,     // Bearer tokens
  /[a-z0-9]{52}/gi,                       // ADO PAT-length strings
  /Authorization:\s*\S+/gi,              // Full auth header lines
  /password[=:]\s*\S+/gi,               // Password key-value pairs
];

export function sanitizeMessage(message: string): string {
  let sanitized = message;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }
  return sanitized;
}

// ---------------------------------------------------------------------------
// Error normalization at tool boundaries
// ---------------------------------------------------------------------------

export function normalizeError(error: unknown): SprintPilotError {
  if (error instanceof SprintPilotError) {
    return error;
  }

  if (error instanceof ZodError) {
    const detail = error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    return new ValidationError(detail);
  }

  if (error instanceof TypeError && error.message.includes('fetch failed')) {
    return new AdoUnreachableError();
  }

  const message =
    error instanceof Error ? error.message : 'An unexpected error occurred.';
  return new SprintPilotError(
    'validation_error',
    sanitizeMessage(message),
    'If this persists, check logs and report the issue.',
  );
}
