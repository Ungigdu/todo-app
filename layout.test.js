const { test, expect } = require('@playwright/test');

test.describe('Layout Tests', () => {
    test.beforeEach(async ({ page }) => {
        // Load the page
        await page.goto(`file://${__dirname}/index.html`);

        // Show todo screen, hide login screen (simulate logged in state)
        await page.evaluate(() => {
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('todo-screen').classList.remove('hidden');
        });
    });

    test('todo-screen should fill viewport height', async ({ page }) => {
        const viewport = page.viewportSize();
        const todoScreen = await page.locator('#todo-screen').boundingBox();

        console.log(`Viewport: ${viewport.width}x${viewport.height}`);
        console.log(`Todo-screen: ${todoScreen.width}x${todoScreen.height}`);

        expect(todoScreen.height).toBeCloseTo(viewport.height, 0);
    });

    test('main-content should fill remaining width', async ({ page }) => {
        const sidebar = await page.locator('.sidebar').boundingBox();
        const mainContent = await page.locator('.main-content').boundingBox();
        const statusBar = await page.locator('#sync-status-bar').boundingBox();
        const viewport = page.viewportSize();

        console.log(`Sidebar width: ${sidebar.width}`);
        console.log(`Main-content: ${mainContent.width}x${mainContent.height}`);

        // Main content should fill remaining width
        expect(mainContent.width).toBeCloseTo(viewport.width - sidebar.width, 1);
        // Main content should fill height minus status bar
        expect(mainContent.height).toBeCloseTo(viewport.height - statusBar.height, 0);
    });

    test('footer should be at bottom of viewport', async ({ page }) => {
        const viewport = page.viewportSize();
        const mainContent = await page.locator('.main-content').boundingBox();
        const tabContent = await page.locator('#todos-section').boundingBox();
        const todoList = await page.locator('#todo-list').boundingBox();
        const footer = await page.locator('#todos-section .footer').boundingBox();

        console.log(`Viewport height: ${viewport.height}`);
        console.log(`Main-content height: ${mainContent.height}`);
        console.log(`Tab-content height: ${tabContent.height}`);
        console.log(`Todo-list height: ${todoList.height}`);
        console.log(`Footer: y=${footer.y}, height=${footer.height}, bottom=${footer.y + footer.height}`);

        // Footer bottom should be at or near viewport bottom
        const footerBottom = footer.y + footer.height;
        expect(footerBottom).toBeCloseTo(viewport.height, 5);
    });

    test('sidebar should fill full viewport height', async ({ page }) => {
        const viewport = page.viewportSize();
        const sidebar = await page.locator('.sidebar').boundingBox();
        const statusBar = await page.locator('#sync-status-bar').boundingBox();

        console.log(`Sidebar height: ${sidebar.height}`);

        // Sidebar should fill height minus status bar
        expect(sidebar.height).toBeCloseTo(viewport.height - statusBar.height, 0);
    });

    test('note modal should fill viewport on mobile', async ({ page }) => {
        // Set mobile viewport
        await page.setViewportSize({ width: 375, height: 667 });

        // Show the modal
        await page.evaluate(() => {
            document.getElementById('note-modal').classList.remove('hidden');
        });

        const viewport = page.viewportSize();
        const modal = await page.locator('#note-modal').boundingBox();
        const modalContent = await page.locator('#note-modal .modal-content').boundingBox();

        console.log(`Mobile viewport: ${viewport.width}x${viewport.height}`);
        console.log(`Modal: ${modal.width}x${modal.height}`);
        console.log(`Modal-content: ${modalContent.width}x${modalContent.height}`);

        // Modal should fill the viewport
        expect(modal.width).toBeCloseTo(viewport.width, 0);
        expect(modal.height).toBeCloseTo(viewport.height, 0);

        // Modal content should also fill the viewport width
        expect(modalContent.width).toBeCloseTo(viewport.width, 0);
    });

    test('sync status bar should span full width at top', async ({ page }) => {
        const viewport = page.viewportSize();
        const statusBar = await page.locator('#sync-status-bar').boundingBox();

        console.log(`Viewport width: ${viewport.width}`);
        console.log(`Status bar: x=${statusBar.x}, y=${statusBar.y}, width=${statusBar.width}, height=${statusBar.height}`);

        // Status bar should be at top (y = 0)
        expect(statusBar.y).toBe(0);

        // Status bar should span full viewport width
        expect(statusBar.width).toBeCloseTo(viewport.width, 0);

        // Status bar should be a single line (small height)
        expect(statusBar.height).toBeLessThanOrEqual(24);
        expect(statusBar.height).toBeGreaterThanOrEqual(16);
    });

    test('avatar popup should stay within viewport bounds', async ({ page }) => {
        // Show the popup
        await page.evaluate(() => {
            document.getElementById('avatar-popup').classList.remove('hidden');
        });

        const viewport = page.viewportSize();
        const popup = await page.locator('#avatar-popup').boundingBox();

        console.log(`Popup position: x=${popup.x}, y=${popup.y}, width=${popup.width}`);

        // Popup should not go off-screen to the left
        expect(popup.x).toBeGreaterThanOrEqual(0);
        // Popup should not go off-screen to the right
        expect(popup.x + popup.width).toBeLessThanOrEqual(viewport.width);
    });

    test('avatar popup should contain reset password button', async ({ page }) => {
        // Show the popup
        await page.evaluate(() => {
            document.getElementById('avatar-popup').classList.remove('hidden');
        });

        const resetBtn = page.locator('#reset-password-btn');
        await expect(resetBtn).toBeVisible();
        await expect(resetBtn).toHaveText('Reset Password');
    });

    test('reset password modal should open when button clicked', async ({ page }) => {
        // Show the popup
        await page.evaluate(() => {
            document.getElementById('avatar-popup').classList.remove('hidden');
        });

        // Click reset password button
        await page.click('#reset-password-btn');

        // Modal should be visible
        const modal = page.locator('#reset-password-modal');
        await expect(modal).toBeVisible();

        // Should have required inputs
        await expect(page.locator('#old-password')).toBeVisible();
        await expect(page.locator('#new-password')).toBeVisible();
        await expect(page.locator('#confirm-new-password')).toBeVisible();
    });

    test('reset password modal should close when cancel clicked', async ({ page }) => {
        // Show the modal
        await page.evaluate(() => {
            document.getElementById('reset-password-modal').classList.remove('hidden');
        });

        // Click cancel button
        await page.click('#cancel-reset-btn');

        // Modal should be hidden
        const modal = page.locator('#reset-password-modal');
        await expect(modal).toBeHidden();
    });
});
