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
        const viewport = page.viewportSize();

        console.log(`Sidebar width: ${sidebar.width}`);
        console.log(`Main-content: ${mainContent.width}x${mainContent.height}`);

        // Main content should fill remaining width
        expect(mainContent.width).toBeCloseTo(viewport.width - sidebar.width, 1);
        // Main content should fill full height
        expect(mainContent.height).toBeCloseTo(viewport.height, 0);
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

        console.log(`Sidebar height: ${sidebar.height}`);

        expect(sidebar.height).toBeCloseTo(viewport.height, 0);
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
});
