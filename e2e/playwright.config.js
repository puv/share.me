import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    timeout: 60000,
    expect: {
        timeout: 10000,
    },
    use: {
        baseURL: process.env.BASE_URL || 'http://localhost:3000',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: {
        command: 'cd ../backend && npm start',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 30000,
        env: {
            PORT: '3000',
            SESSION_SECRET: 'e2e-test-secret',
            ADMIN_USERNAME: 'admin',
            ADMIN_PASSWORD: 'adminpass',
            DATABASE_PATH: './data/e2e-test.db',
            UPLOAD_DIRECTORY: './data/e2e-uploads',
        },
    },
});
