import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';

import {
  SprintPilotError,
  ScopeViolationError,
  AuthMissingError,
  AuthExpiredError,
  ConfigMissingError,
  ConfigInvalidError,
  FabricMissingError,
  ProductMissingError,
  PatInvalidError,
  AdoUnreachableError,
  AdoNotFoundError,
  AdoForbiddenError,
  ValidationError,
  sanitizeMessage,
  normalizeError,
} from '../../src/shared/errors.js';

// ---------------------------------------------------------------------------
// SprintPilotError base class
// ---------------------------------------------------------------------------

describe('SprintPilotError', () => {
  describe('constructor', () => {
    it('sets code, message, and guidance', () => {
      const error = new SprintPilotError(
        'validation_error',
        'Something went wrong',
        'Try again',
      );

      expect(error.code).toBe('validation_error');
      expect(error.message).toBe('Something went wrong');
      expect(error.guidance).toBe('Try again');
      expect(error.name).toBe('SprintPilotError');
    });

    it('allows undefined guidance', () => {
      const error = new SprintPilotError('auth_missing', 'No PAT');

      expect(error.guidance).toBeUndefined();
    });
  });

  describe('toJSON()', () => {
    it('returns correct object with guidance', () => {
      const error = new SprintPilotError(
        'ado_unreachable',
        'Cannot reach ADO',
        'Check network',
      );

      expect(error.toJSON()).toEqual({
        error: 'ado_unreachable',
        message: 'Cannot reach ADO',
        guidance: 'Check network',
      });
    });

    it('omits guidance when undefined', () => {
      const error = new SprintPilotError(
        'validation_error',
        'Bad input',
      );

      const json = error.toJSON();

      expect(json).toEqual({
        error: 'validation_error',
        message: 'Bad input',
      });
      expect('guidance' in json).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Subclasses
// ---------------------------------------------------------------------------

describe('Error subclasses', () => {
  it('ScopeViolationError has correct code and name', () => {
    const error = new ScopeViolationError('out of scope');
    expect(error.code).toBe('scope_violation');
    expect(error.name).toBe('ScopeViolationError');
    expect(error.message).toBe('out of scope');
    expect(error.guidance).toBeDefined();
  });

  it('AuthMissingError has correct code and name', () => {
    const error = new AuthMissingError();
    expect(error.code).toBe('auth_missing');
    expect(error.name).toBe('AuthMissingError');
    expect(error.message).toContain('No PAT found');
  });

  it('AuthExpiredError has correct code and name', () => {
    const error = new AuthExpiredError();
    expect(error.code).toBe('auth_expired');
    expect(error.name).toBe('AuthExpiredError');
    expect(error.message).toContain('expired or invalid');
  });

  it('ConfigMissingError has correct code and name', () => {
    const error = new ConfigMissingError();
    expect(error.code).toBe('config_missing');
    expect(error.name).toBe('ConfigMissingError');
  });

  it('ConfigInvalidError has correct code and name', () => {
    const error = new ConfigInvalidError('bad field');
    expect(error.code).toBe('config_invalid');
    expect(error.name).toBe('ConfigInvalidError');
    expect(error.message).toBe('bad field');
  });

  it('FabricMissingError has correct code and name', () => {
    const error = new FabricMissingError();
    expect(error.code).toBe('fabric_missing');
    expect(error.name).toBe('FabricMissingError');
  });

  it('ProductMissingError has correct code and name', () => {
    const error = new ProductMissingError();
    expect(error.code).toBe('product_missing');
    expect(error.name).toBe('ProductMissingError');
  });

  it('PatInvalidError has correct code and name', () => {
    const error = new PatInvalidError('missing scope');
    expect(error.code).toBe('pat_invalid');
    expect(error.name).toBe('PatInvalidError');
    expect(error.message).toContain('PAT validation failed: missing scope');
  });

  it('AdoUnreachableError has correct code and name', () => {
    const error = new AdoUnreachableError();
    expect(error.code).toBe('ado_unreachable');
    expect(error.name).toBe('AdoUnreachableError');
    expect(error.message).toContain('Cannot reach Azure DevOps');
  });

  it('AdoNotFoundError has correct code and name', () => {
    const error = new AdoNotFoundError();
    expect(error.code).toBe('ado_not_found');
    expect(error.name).toBe('AdoNotFoundError');
    expect(error.message).toContain('not found');
  });

  it('AdoNotFoundError accepts custom detail message', () => {
    const error = new AdoNotFoundError('Work item 42 does not exist');
    expect(error.code).toBe('ado_not_found');
    expect(error.message).toBe('Work item 42 does not exist');
  });

  it('AdoForbiddenError has correct code and name', () => {
    const error = new AdoForbiddenError();
    expect(error.code).toBe('ado_forbidden');
    expect(error.name).toBe('AdoForbiddenError');
    expect(error.message).toContain('Access denied');
    expect(error.guidance).toContain('PAT');
  });

  it('AdoForbiddenError accepts custom detail message', () => {
    const error = new AdoForbiddenError('Insufficient permissions');
    expect(error.code).toBe('ado_forbidden');
    expect(error.message).toBe('Insufficient permissions');
  });

  it('ValidationError has correct code and name', () => {
    const error = new ValidationError('invalid input');
    expect(error.code).toBe('validation_error');
    expect(error.name).toBe('ValidationError');
    expect(error.message).toBe('invalid input');
    expect(error.guidance).toContain('Check the input');
  });

  it('all subclasses are instances of SprintPilotError', () => {
    expect(new ScopeViolationError('x')).toBeInstanceOf(SprintPilotError);
    expect(new AuthMissingError()).toBeInstanceOf(SprintPilotError);
    expect(new AuthExpiredError()).toBeInstanceOf(SprintPilotError);
    expect(new ConfigMissingError()).toBeInstanceOf(SprintPilotError);
    expect(new ConfigInvalidError('x')).toBeInstanceOf(SprintPilotError);
    expect(new FabricMissingError()).toBeInstanceOf(SprintPilotError);
    expect(new ProductMissingError()).toBeInstanceOf(SprintPilotError);
    expect(new PatInvalidError('x')).toBeInstanceOf(SprintPilotError);
    expect(new AdoUnreachableError()).toBeInstanceOf(SprintPilotError);
    expect(new AdoNotFoundError()).toBeInstanceOf(SprintPilotError);
    expect(new AdoForbiddenError()).toBeInstanceOf(SprintPilotError);
    expect(new ValidationError('x')).toBeInstanceOf(SprintPilotError);
  });
});

// ---------------------------------------------------------------------------
// sanitizeMessage()
// ---------------------------------------------------------------------------

describe('sanitizeMessage()', () => {
  it('strips Basic auth headers', () => {
    const result = sanitizeMessage('Failed with Basic dXNlcjpwYXNzd29yZA== on request');
    expect(result).not.toContain('dXNlcjpwYXNzd29yZA==');
    expect(result).toContain('[REDACTED]');
  });

  it('strips Bearer tokens', () => {
    const result = sanitizeMessage(
      'Request failed Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.abc.def',
    );
    expect(result).not.toContain('eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(result).toContain('[REDACTED]');
  });

  it('strips PAT-length strings (52 chars)', () => {
    const pat = 'a'.repeat(52);
    const result = sanitizeMessage(`Token is ${pat} in the request`);
    expect(result).not.toContain(pat);
    expect(result).toContain('[REDACTED]');
  });

  it('strips Authorization header lines', () => {
    const result = sanitizeMessage(
      'Headers include Authorization: Basic dXNlcjpwYXNzd29yZA==',
    );
    expect(result).not.toContain('Basic dXNlcjpwYXNzd29yZA==');
    expect(result).toContain('[REDACTED]');
  });

  it('strips password key-value pairs with equals sign', () => {
    const result = sanitizeMessage('Config has password=supersecret123 set');
    expect(result).not.toContain('supersecret123');
    expect(result).toContain('[REDACTED]');
  });

  it('strips password key-value pairs with colon', () => {
    const result = sanitizeMessage('password: mysecretvalue in config');
    expect(result).not.toContain('mysecretvalue');
    expect(result).toContain('[REDACTED]');
  });

  it('passes through clean messages unchanged', () => {
    const clean = 'Work item 42 was not found in project MyProject';
    expect(sanitizeMessage(clean)).toBe(clean);
  });

  it('handles multiple sensitive patterns in one message', () => {
    const message =
      'Auth Basic dXNlcjpwYXNz and password=secret123 found';
    const result = sanitizeMessage(message);
    expect(result).not.toContain('dXNlcjpwYXNz');
    expect(result).not.toContain('secret123');
  });

  it('handles empty string', () => {
    expect(sanitizeMessage('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// normalizeError()
// ---------------------------------------------------------------------------

describe('normalizeError()', () => {
  it('returns SprintPilotError as-is', () => {
    const original = new ScopeViolationError('test reason');
    const result = normalizeError(original);
    expect(result).toBe(original);
  });

  it('converts ZodError to ValidationError', () => {
    const zodErr = new ZodError([
      {
        code: 'invalid_type',
        expected: 'number',
        received: 'string',
        path: ['id'],
        message: 'Expected number, received string',
      },
    ]);

    const result = normalizeError(zodErr);

    expect(result).toBeInstanceOf(ValidationError);
    expect(result.code).toBe('validation_error');
    expect(result.message).toContain('id: Expected number');
  });

  it('converts TypeError with "fetch failed" to AdoUnreachableError', () => {
    const fetchErr = new TypeError('fetch failed');
    const result = normalizeError(fetchErr);
    expect(result).toBeInstanceOf(AdoUnreachableError);
    expect(result.code).toBe('ado_unreachable');
  });

  it('converts unknown Error to SprintPilotError with sanitized message', () => {
    const err = new Error('Failed with Basic dXNlcjpwYXNzd29yZA== on request');
    const result = normalizeError(err);

    expect(result).toBeInstanceOf(SprintPilotError);
    expect(result.code).toBe('validation_error');
    expect(result.message).not.toContain('dXNlcjpwYXNzd29yZA==');
    expect(result.message).toContain('[REDACTED]');
  });

  it('handles non-Error string values', () => {
    const result = normalizeError('a bare string');
    expect(result).toBeInstanceOf(SprintPilotError);
    expect(result.code).toBe('validation_error');
    expect(result.message).toBe('An unexpected error occurred.');
  });

  it('handles null', () => {
    const result = normalizeError(null);
    expect(result).toBeInstanceOf(SprintPilotError);
    expect(result.code).toBe('validation_error');
    expect(result.message).toBe('An unexpected error occurred.');
  });

  it('handles undefined', () => {
    const result = normalizeError(undefined);
    expect(result).toBeInstanceOf(SprintPilotError);
    expect(result.code).toBe('validation_error');
    expect(result.message).toBe('An unexpected error occurred.');
  });

  it('preserves the original SprintPilotError subclass', () => {
    const authErr = new AuthExpiredError();
    expect(normalizeError(authErr)).toBe(authErr);

    const adoErr = new AdoUnreachableError();
    expect(normalizeError(adoErr)).toBe(adoErr);
  });

  it('converts ZodError with multiple issues', () => {
    const zodErr = new ZodError([
      {
        code: 'invalid_type',
        expected: 'number',
        received: 'string',
        path: ['id'],
        message: 'Expected number',
      },
      {
        code: 'invalid_type',
        expected: 'string',
        received: 'undefined',
        path: ['name'],
        message: 'Required',
      },
    ]);

    const result = normalizeError(zodErr);

    expect(result.message).toContain('id: Expected number');
    expect(result.message).toContain('name: Required');
    expect(result.message).toContain(';');
  });

  it('includes guidance for unknown errors', () => {
    const err = new Error('some random error');
    const result = normalizeError(err);
    expect(result.guidance).toContain('If this persists');
  });

  it('does not treat TypeError without "fetch failed" as AdoUnreachableError', () => {
    const typeErr = new TypeError('Cannot read properties of undefined');
    const result = normalizeError(typeErr);
    expect(result).not.toBeInstanceOf(AdoUnreachableError);
    expect(result.code).toBe('validation_error');
  });
});
