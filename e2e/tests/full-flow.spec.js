import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Create a small test file for uploads
const testFilePath = path.join(__dirname, 'fixtures', 'test-upload.txt');
const testFilePath2 = path.join(__dirname, 'fixtures', 'test-upload2.txt');

test.beforeAll(() => {
    const fixturesDir = path.join(__dirname, 'fixtures');
    if (!fs.existsSync(fixturesDir)) {
        fs.mkdirSync(fixturesDir, { recursive: true });
    }
    fs.writeFileSync(testFilePath, 'This is a test file for E2E upload testing.');
    fs.writeFileSync(testFilePath2, 'This is a second test file for multi-file testing.');
});

test.describe('Full Upload -> Share -> Download Flow', () => {
    test('upload a file and verify share page', async ({ page }) => {
        await page.goto('/');

        // Verify upload page is visible
        await expect(page.locator('h1')).toContainText('Share Files');

        // Select retention type
        await page.selectOption('select', 'permanent');

        // Upload a file
        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(testFilePath);

        // Verify file appears in list
        await expect(page.locator('.file-item-name')).toContainText('test-upload.txt');

        // Submit the upload
        await page.click('button[type="submit"]');

        // Wait for success page
        await expect(page.locator('h1')).toContainText('Upload Complete', { timeout: 15000 });

        // Verify QR code is displayed
        const qrImg = page.locator('.qr-container img');
        await expect(qrImg).toBeVisible();

        // Verify share link is displayed
        const shareLink = page.locator('.share-link-text');
        await expect(shareLink).toBeVisible();

        // Click "View Share Page"
        await page.click('text=View Share Page');

        // Verify download page
        await expect(page.locator('h1')).toContainText('Download Files');
        await expect(page.locator('.download-file-item')).toContainText('test-upload.txt');
    });

    test('upload multiple files and verify ZIP option', async ({ page }) => {
        await page.goto('/');

        await page.selectOption('select', 'permanent');

        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles([testFilePath, testFilePath2]);

        await expect(page.locator('.file-item')).toHaveCount(2);

        await page.click('button[type="submit"]');

        await expect(page.locator('h1')).toContainText('Upload Complete', { timeout: 15000 });

        // Go to share page
        await page.click('text=View Share Page');

        // Should show "Download All as ZIP" for multi-file uploads
        await expect(page.locator('text=Download All as ZIP')).toBeVisible();
    });
});

test.describe('Password-Protected Upload Flow', () => {
    test('upload with password and verify password prompt', async ({ page }) => {
        await page.goto('/');

        await page.selectOption('select', 'permanent');

        // Set a password
        await page.fill('input[type="password"]', 'e2e-secret-123');

        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(testFilePath);

        await page.click('button[type="submit"]');

        await expect(page.locator('h1')).toContainText('Upload Complete', { timeout: 15000 });

        // Go to share page
        await page.click('text=View Share Page');

        // Should show password prompt
        await expect(page.locator('h2')).toContainText('Password Required');
        await expect(page.locator('input[type="password"]')).toBeVisible();

        // Enter wrong password
        await page.fill('input[type="password"]', 'wrong-password');
        await page.click('text=Unlock');

        // Should show error
        await expect(page.locator('.alert-error')).toBeVisible();

        // Enter correct password
        await page.fill('input[type="password"]', 'e2e-secret-123');
        await page.click('text=Unlock');

        // Should now show files
        await expect(page.locator('h1')).toContainText('Download Files');
        await expect(page.locator('.download-file-item')).toContainText('test-upload.txt');
    });

    test('password prompt hides file metadata', async ({ page }) => {
        await page.goto('/');

        await page.selectOption('select', 'permanent');
        await page.fill('input[type="password"]', 'hidden-pass');

        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(testFilePath);

        await page.click('button[type="submit"]');

        await expect(page.locator('h1')).toContainText('Upload Complete', { timeout: 15000 });

        // Get the share URL
        const shareUrl = await page.locator('.share-link-text').textContent();

        // Navigate to share URL in a new context (no session)
        const newContext = await page.context().browser.newContext();
        const newPage = await newContext.newPage();
        await newPage.goto(shareUrl);

        // Should see password prompt, no filenames
        await expect(newPage.locator('h2')).toContainText('Password Required');
        await expect(newPage.locator('.download-file-item')).not.toBeVisible();

        await newContext.close();
    });
});

test.describe('Delete Upload via Cookie', () => {
    test('upload and delete using cookie token', async ({ page }) => {
        await page.goto('/');

        await page.selectOption('select', 'permanent');
        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(testFilePath);
        await page.click('button[type="submit"]');

        await expect(page.locator('h1')).toContainText('Upload Complete', { timeout: 15000 });

        // Go to share page
        await page.click('text=View Share Page');

        // Verify delete button is visible
        await expect(page.locator('text=Delete Upload')).toBeVisible();

        // Set up dialog handler for confirm
        page.on('dialog', dialog => dialog.accept());

        // Click delete
        await page.click('text=Delete Upload');

        // Should show "Upload Deleted"
        await expect(page.locator('h1')).toContainText('Upload Deleted');
    });
});

test.describe('Admin Flow', () => {
    test('admin login, view dashboard, and delete upload', async ({ page }) => {
        // First create an upload
        await page.goto('/');
        await page.selectOption('select', 'permanent');
        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(testFilePath);
        await page.click('button[type="submit"]');
        await expect(page.locator('h1')).toContainText('Upload Complete', { timeout: 15000 });

        // Go to admin
        await page.goto('/admin');

        // Should redirect to login
        await expect(page.locator('h1')).toContainText('Admin Login');

        // Login
        await page.fill('input[type="text"]', 'admin');
        await page.fill('input[type="password"]', 'adminpass');
        await page.click('button[type="submit"]');

        // Should see admin panel
        await expect(page.locator('h1')).toContainText('Admin Panel');

        // Verify stats are displayed
        await expect(page.locator('.admin-stat-value').first()).toBeVisible();

        // Switch to uploads tab
        await page.click('text=Uploads');

        // Should see uploads table
        await expect(page.locator('.admin-table')).toBeVisible();

        // Delete an upload
        page.on('dialog', dialog => dialog.accept());
        const deleteButton = page.locator('.btn-danger').first();
        if (await deleteButton.isVisible()) {
            await deleteButton.click();
        }
    });

    test('admin settings page works', async ({ page }) => {
        await page.goto('/admin');
        // Login first
        await page.fill('input[type="text"]', 'admin');
        await page.fill('input[type="password"]', 'adminpass');
        await page.click('button[type="submit"]');
        await expect(page.locator('h1')).toContainText('Admin Panel');

        // Go to settings
        await page.click('text=Settings');

        // Verify settings form
        await expect(page.locator('h3')).toContainText('Settings');
        await expect(page.locator('text=Max Single File Size')).toBeVisible();
        await expect(page.locator('text=Cleanup Interval')).toBeVisible();

        // Change a setting
        const intervalInput = page.locator('input').filter({ hasText: '' }).nth(3); // cleanup interval
        await intervalInput.fill('120');

        // Save
        await page.click('text=Save Settings');
        await expect(page.locator('.alert-success')).toBeVisible();
    });
});

test.describe('Alias Routing', () => {
    test('upload with alias and access via alias URL', async ({ page }) => {
        const alias = 'e2e-test-' + Date.now();
        await page.goto('/');

        await page.selectOption('select', 'permanent');

        // Set alias
        await page.fill('input[placeholder="my-file-share"]', alias);

        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(testFilePath);

        await page.click('button[type="submit"]');

        await expect(page.locator('h1')).toContainText('Upload Complete', { timeout: 15000 });

        // The share link should contain the alias
        const shareUrl = await page.locator('.share-link-text').textContent();
        expect(shareUrl).toContain(alias);
    });
});

test.describe('One-Download Retention', () => {
    test('file disappears after download', async ({ page }) => {
        await page.goto('/');

        await page.selectOption('select', 'one_download');

        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(testFilePath);

        await page.click('button[type="submit"]');
        await expect(page.locator('h1')).toContainText('Upload Complete', { timeout: 15000 });

        // Go to share page
        await page.click('text=View Share Page');
        await expect(page.locator('h1')).toContainText('Download Files');

        // Click download
        const downloadButton = page.locator('text=Download').first();
        // Start waiting for download before clicking
        const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 10000 }),
            downloadButton.click(),
        ]);
        expect(download).toBeTruthy();

        // Reload the page - it should now show "Not Available"
        await page.reload();
        await expect(page.locator('h1')).toContainText('Not Available');
    });
});

test.describe('QR Code', () => {
    test('QR code is visible after upload', async ({ page }) => {
        await page.goto('/');

        await page.selectOption('select', 'permanent');
        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(testFilePath);
        await page.click('button[type="submit"]');

        await expect(page.locator('h1')).toContainText('Upload Complete', { timeout: 15000 });

        // QR code should be visible
        const qrImg = page.locator('.qr-container img');
        await expect(qrImg).toBeVisible();

        // QR download button should exist
        await expect(page.locator('text=Download QR PNG')).toBeVisible();
    });
});
