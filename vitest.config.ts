import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Stub OAuth credentials so the oauth modules are exercisable in tests.
    env: {
      ASANA_CLIENT_ID: 'test_client',
      ASANA_CLIENT_SECRET: 'test_secret',
      LINEAR_CLIENT_ID: 'test_client',
      LINEAR_CLIENT_SECRET: 'test_secret',
      SLACK_CLIENT_ID: 'test_client',
      SLACK_CLIENT_SECRET: 'test_secret',
      GOOGLE_CLIENT_ID: 'test_client',
      GOOGLE_CLIENT_SECRET: 'test_secret',
      ZOOM_CLIENT_ID: 'test_client',
      ZOOM_CLIENT_SECRET: 'test_secret',
      CRON_SECRET: 'test_cron_secret',
      BETTER_AUTH_SECRET: 'test_better_auth_secret',
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
