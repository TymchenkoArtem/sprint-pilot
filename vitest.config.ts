import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      thresholds: {
        branches: 85,
        lines: 85,
        functions: 85,
        statements: 85,
      },
    },
  },
});
