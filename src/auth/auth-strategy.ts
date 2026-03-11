/**
 * AuthStrategy interface and ValidationResult type.
 *
 * All credential storage backends implement AuthStrategy.
 * Two concrete implementations exist: KeytarStrategy (primary, OS keychain)
 * and FileFallbackStrategy (fallback, ~/.sprint-pilot/pat).
 *
 * Key decisions:
 * - retrieve() returns string | null. null means "checked, not found" --
 *   it is a predictable condition, not an error. No exception is thrown.
 * - Method names are store/retrieve/validate/clear (not storePat/getPat/deletePat).
 *   The interface is already about auth; the "Pat" suffix is redundant.
 */

/**
 * Result of PAT scope validation against Azure DevOps.
 * Returned by AuthStrategy.validate().
 */
export interface ValidationResult {
  valid: boolean;
  missingScopes: string[];
  excessiveScopes: string[];
}

/**
 * Contract for credential storage backends.
 * Implementations must never log, expose, or return the raw PAT value
 * in any output, error message, or log entry.
 */
export interface AuthStrategy {
  /** Store a PAT token in the credential backend. */
  store(token: string): Promise<void>;

  /**
   * Retrieve the stored PAT token.
   * Returns null if no token is found -- this is not an error condition.
   */
  retrieve(): Promise<string | null>;

  /**
   * Validate a PAT token against Azure DevOps endpoints to check
   * connectivity and required scopes.
   */
  validate(token: string, orgUrl: string): Promise<ValidationResult>;

  /** Remove the stored PAT token from the credential backend. */
  clear(): Promise<void>;
}
