import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL: 'http://localhost:3001',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npx http-server . -p 3001 -c-1 -s',
    url: 'http://localhost:3001',
    reuseExistingServer: true,
  },
});
