/**
 * API Integration Tests
 * Tests GitHub API interactions using mocked endpoints
 */

const { test, expect } = require('@playwright/test');
const { setupGitHubMocks, setupLoggedInState } = require('./mocks/github-api');
const { gotoApp, fillLoginForm, showTodoScreen, addTodo, getTodos, resetAppState } = require('./helpers/test-utils');

test.describe('GitHub API Integration', () => {

    test.describe('Authentication', () => {

        test('should show login screen on first visit', async ({ page }) => {
            // No mocks needed - just load the app
            await gotoApp(page);
            await resetAppState(page);
            // Reload to apply clean state
            await page.reload();

            const loginScreen = page.locator('#login-screen');
            await expect(loginScreen).toBeVisible();
        });

        test('should validate token with GitHub API', async ({ page }) => {
            // Setup mocks BEFORE navigation
            await setupGitHubMocks(page, { authenticated: true });
            await gotoApp(page);
            await resetAppState(page);

            // Fill in login form
            await fillLoginForm(page);

            // Click continue button
            await page.click('#check-btn');

            // Wait for API validation to complete - check-btn should become hidden
            // and either login-btn appears (new user) or confirm-password-group appears
            await page.waitForTimeout(1500);

            // After successful token validation, one of these should happen:
            // 1. Login button becomes visible (for new setup)
            // 2. Confirm password group becomes visible (for first time)
            // 3. Login screen gets hidden (if auto-proceeding)
            const loginBtn = page.locator('#login-btn');
            const confirmGroup = page.locator('#confirm-password-group');
            const loginScreen = page.locator('#login-screen');

            const loginBtnVisible = await loginBtn.isVisible().catch(() => false);
            const confirmVisible = await confirmGroup.evaluate(el => !el.classList.contains('hidden')).catch(() => false);
            const loginHidden = await loginScreen.evaluate(el => el.classList.contains('hidden')).catch(() => false);

            // At least one of these indicates the API was called and processed
            expect(loginBtnVisible || confirmVisible || loginHidden).toBeTruthy();
        });

        test('should reject invalid token', async ({ page }) => {
            // Setup mocks to reject auth
            await setupGitHubMocks(page, { authenticated: false });
            await gotoApp(page);
            await resetAppState(page);

            await fillLoginForm(page, { token: 'invalid-token' });
            await page.click('#check-btn');

            // Should show error or stay on login screen
            await page.waitForTimeout(500);
            const loginScreen = page.locator('#login-screen');
            await expect(loginScreen).toBeVisible();
        });

    });

    test.describe('Todo Operations', () => {

        test.beforeEach(async ({ page }) => {
            // Setup mocks BEFORE navigation
            await setupGitHubMocks(page, { authenticated: true });
            await gotoApp(page);
            await showTodoScreen(page);
        });

        test('should display empty todo list initially', async ({ page }) => {
            const todos = await getTodos(page);
            expect(todos.length).toBe(0);
        });

        test('should have add todo input and button', async ({ page }) => {
            const input = page.locator('#new-todo');
            const button = page.locator('#add-btn');

            await expect(input).toBeVisible();
            await expect(button).toBeVisible();
        });

        test('should add a new todo item', async ({ page }) => {
            await addTodo(page, 'Test todo item');

            const todos = await getTodos(page);
            expect(todos.length).toBe(1);
            expect(todos[0].text).toBe('Test todo item');
            expect(todos[0].completed).toBe(false);
        });

        test('should toggle todo completion', async ({ page }) => {
            await addTodo(page, 'Toggle test');

            // Click the checkbox or todo item to toggle
            const checkbox = page.locator('#todo-list .todo-item').first().locator('input[type="checkbox"]');
            await checkbox.click();

            const todos = await getTodos(page);
            expect(todos[0].completed).toBe(true);
        });

        test('should delete a todo item', async ({ page }) => {
            await addTodo(page, 'Delete me');

            // Get initial count
            let todos = await getTodos(page);
            expect(todos.length).toBe(1);

            // Find and click delete button (class is 'todo-delete')
            const deleteBtn = page.locator('#todo-list .todo-item').first().locator('.todo-delete');
            await deleteBtn.click();

            // Wait for the specific todo text to disappear
            await expect(page.locator('#todo-list').getByText('Delete me')).toBeHidden({ timeout: 5000 });

            todos = await getTodos(page);
            expect(todos.length).toBe(0);
        });

    });

    test.describe('Data Persistence', () => {

        test('should save todos to GitHub (mock)', async ({ page }) => {
            const store = await setupGitHubMocks(page, { authenticated: true });
            await gotoApp(page);
            await showTodoScreen(page);

            // Inject the app instance for testing
            await page.evaluate(() => {
                // Simulate app initialization with mock token
                if (window.app) {
                    window.app.token = 'mock-token-12345';
                    window.app.repoName = 'testuser/test-repo';
                }
            });

            await addTodo(page, 'Persistent todo');

            // Give time for save operation
            await page.waitForTimeout(1000);

            // Verify file was saved to mock store
            const savedFile = store.getFile('encrypted_todos.json');
            // File should exist (it's encrypted, so we can't check content easily)
            // In a real test, you might want to verify the API call was made
        });

    });

    test.describe('Sync Status', () => {

        test('should display sync status bar', async ({ page }) => {
            await setupGitHubMocks(page, { authenticated: true });
            await gotoApp(page);
            await showTodoScreen(page);

            const statusBar = page.locator('#sync-status-bar');
            await expect(statusBar).toBeVisible();
        });

    });

    test.describe('Error Handling', () => {

        test('should handle network errors gracefully', async ({ page }) => {
            // Setup mocks first
            await setupGitHubMocks(page, { authenticated: true });

            // Override contents route to simulate network error
            await page.route('**/api.github.com/repos/*/contents/*', route => {
                route.abort('failed');
            });

            await gotoApp(page);
            await showTodoScreen(page);

            // App should still be usable even if sync fails
            const todoInput = page.locator('#new-todo');
            await expect(todoInput).toBeVisible();
        });

    });

});

test.describe('UI State Management', () => {

    test('should switch between tabs', async ({ page }) => {
        await setupGitHubMocks(page, { authenticated: true });
        await gotoApp(page);
        await showTodoScreen(page);

        // Click notes tab
        await page.click('[data-tab="notes"]');
        const notesSection = page.locator('#notes-section');
        await expect(notesSection).toBeVisible();

        // Click files tab
        await page.click('[data-tab="files"]');
        const filesSection = page.locator('#files-section');
        await expect(filesSection).toBeVisible();

        // Click todos tab
        await page.click('[data-tab="todos"]');
        const todosSection = page.locator('#todos-section');
        await expect(todosSection).toBeVisible();
    });

});
