/**
 * Common test utilities for Playwright tests
 */

/**
 * Navigate to the app and wait for it to be ready
 */
async function gotoApp(page) {
    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');
}

/**
 * Simulate logged-in state by manipulating DOM
 * (Use this after setupGitHubMocks for full authentication flow)
 */
async function showTodoScreen(page) {
    await page.evaluate(() => {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('todo-screen').classList.remove('hidden');
    });
}

/**
 * Fill login form with mock credentials
 */
async function fillLoginForm(page, options = {}) {
    const {
        token = 'mock-token-12345',
        repo = 'testuser/test-repo',
        password = 'testPassword123!'
    } = options;

    // Wait for form to be visible
    await page.waitForSelector('#token', { state: 'visible' });
    await page.fill('#token', token);
    await page.fill('#repo', repo);
    await page.fill('#encryption-password', password);
}

/**
 * Wait for sync to complete
 */
async function waitForSync(page, timeout = 5000) {
    await page.waitForFunction(() => {
        const statusBar = document.getElementById('sync-status-bar');
        return statusBar && !statusBar.textContent.includes('Syncing');
    }, { timeout });
}

/**
 * Add a todo item via the UI
 */
async function addTodo(page, text) {
    await page.waitForSelector('#new-todo', { state: 'visible' });
    await page.fill('#new-todo', text);
    await page.click('#add-btn');
    // Wait for the item to appear
    await page.waitForSelector(`text=${text}`, { timeout: 5000 });
}

/**
 * Add a note via the UI
 */
async function addNote(page, title, content) {
    // Click notes tab
    await page.click('[data-tab="notes"]');
    // Click add note button
    await page.click('#add-note-btn');
    // Fill the modal
    await page.fill('#note-title', title);
    await page.fill('#note-content', content);
    // Save
    await page.click('#save-note-btn');
}

/**
 * Get all todo items from the page
 */
async function getTodos(page) {
    return page.evaluate(() => {
        const items = document.querySelectorAll('#todo-list .todo-item');
        return Array.from(items).map(item => ({
            text: item.querySelector('.todo-text')?.textContent || '',
            completed: item.classList.contains('completed')
        }));
    });
}

/**
 * Get all notes from the page
 */
async function getNotes(page) {
    return page.evaluate(() => {
        const items = document.querySelectorAll('#notes-list .note-item');
        return Array.from(items).map(item => ({
            title: item.querySelector('.note-title')?.textContent || '',
            preview: item.querySelector('.note-preview')?.textContent || ''
        }));
    });
}

/**
 * Clear localStorage and reset app state
 */
async function resetAppState(page) {
    await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
    });
}

/**
 * Take a screenshot for debugging
 */
async function debugScreenshot(page, name) {
    await page.screenshot({ path: `agent/screenshots/debug-${name}-${Date.now()}.png` });
}

module.exports = {
    gotoApp,
    showTodoScreen,
    fillLoginForm,
    waitForSync,
    addTodo,
    addNote,
    getTodos,
    getNotes,
    resetAppState,
    debugScreenshot
};
