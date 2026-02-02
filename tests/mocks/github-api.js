/**
 * GitHub API Mock - Playwright Route Interception
 *
 * Usage in tests:
 *   const { setupGitHubMocks } = require('./mocks/github-api');
 *
 *   test.beforeEach(async ({ page }) => {
 *       await setupGitHubMocks(page);
 *   });
 */

const {
    MOCK_USER,
    MOCK_REPO,
    MOCK_404_NOT_FOUND,
    createContentResponse,
    createUpdateResponse,
    createDeleteResponse,
    createBlobResponse,
    createRefResponse,
    createCommitResponse,
    createTreeResponse,
    generateSha
} = require('./fixtures');

/**
 * In-memory storage for mock GitHub data
 * Simulates GitHub repository state during tests
 */
class MockGitHubStore {
    constructor() {
        this.reset();
    }

    reset() {
        this.files = new Map();      // path -> { content, sha }
        this.blobs = new Map();      // sha -> content
        this.currentCommitSha = generateSha('initial');
        this.currentTreeSha = generateSha('tree-initial');
    }

    getFile(path) {
        return this.files.get(path);
    }

    setFile(path, content) {
        const sha = generateSha(content + Date.now());
        this.files.set(path, { content, sha });
        return sha;
    }

    deleteFile(path) {
        const file = this.files.get(path);
        if (file) {
            this.files.delete(path);
            return true;
        }
        return false;
    }

    createBlob(content) {
        const sha = generateSha(content);
        this.blobs.set(sha, content);
        return sha;
    }

    getBlob(sha) {
        return this.blobs.get(sha);
    }
}

/**
 * Setup GitHub API mocks for Playwright
 * @param {Page} page - Playwright page object
 * @param {Object} options - Configuration options
 * @param {boolean} options.authenticated - Whether to simulate authenticated state (default: true)
 * @param {boolean} options.hasExistingData - Whether repo has existing data (default: false)
 * @param {Object} options.initialData - Initial data to populate { todos, notes, files }
 */
async function setupGitHubMocks(page, options = {}) {
    const {
        authenticated = true,
        hasExistingData = false,
        initialData = {}
    } = options;

    const store = new MockGitHubStore();

    // Pre-populate with initial data if specified
    if (hasExistingData && initialData) {
        if (initialData.todos) {
            store.setFile('encrypted_todos.json', initialData.todos);
        }
        if (initialData.notes) {
            store.setFile('encrypted_notes.json', initialData.notes);
        }
        if (initialData.files) {
            store.setFile('encrypted_files.json', initialData.files);
        }
    }

    // Intercept all GitHub API calls
    await page.route('**/api.github.com/**', async (route, request) => {
        const url = new URL(request.url());
        const method = request.method();
        const path = url.pathname;

        // Remove query params (cache busting)
        console.log(`[Mock] ${method} ${path}`);

        // Handle unauthenticated requests
        if (!authenticated) {
            return route.fulfill({
                status: 401,
                contentType: 'application/json',
                body: JSON.stringify({ message: 'Bad credentials' })
            });
        }

        // Route: GET /user
        if (path === '/user' && method === 'GET') {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(MOCK_USER)
            });
        }

        // Route: GET /repos/{owner}/{repo}
        if (path.match(/^\/repos\/[^/]+\/[^/]+$/) && method === 'GET') {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(MOCK_REPO)
            });
        }

        // Route: GET/PUT/DELETE /repos/{owner}/{repo}/contents/{path}
        // Pattern 1: Normal owner/repo format
        // Pattern 2: Single segment (for tests with malformed/null repo names)
        let contentsMatch = path.match(/^\/repos\/[^/]+\/[^/]+\/contents\/(.+)$/);
        if (!contentsMatch) {
            // Fallback: handle /repos/null/contents/path (malformed repo name)
            contentsMatch = path.match(/^\/repos\/[^/]+\/contents\/(.+)$/);
        }
        if (contentsMatch) {
            const filePath = contentsMatch[1];

            if (method === 'GET') {
                const file = store.getFile(filePath);
                if (file) {
                    return route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify(createContentResponse(filePath, file.content, file.sha))
                    });
                } else {
                    return route.fulfill({
                        status: 404,
                        contentType: 'application/json',
                        body: JSON.stringify(MOCK_404_NOT_FOUND)
                    });
                }
            }

            if (method === 'PUT') {
                const body = JSON.parse(request.postData());
                const content = Buffer.from(body.content, 'base64').toString('utf-8');
                const sha = store.setFile(filePath, content);
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify(createUpdateResponse(filePath, content, sha))
                });
            }

            if (method === 'DELETE') {
                const deleted = store.deleteFile(filePath);
                if (deleted) {
                    return route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify(createDeleteResponse(filePath))
                    });
                } else {
                    return route.fulfill({
                        status: 404,
                        contentType: 'application/json',
                        body: JSON.stringify(MOCK_404_NOT_FOUND)
                    });
                }
            }
        }

        // Route: POST /repos/{owner}/{repo}/git/blobs
        if (path.match(/^\/repos\/[^/]+\/[^/]+\/git\/blobs$/) && method === 'POST') {
            const body = JSON.parse(request.postData());
            const content = body.encoding === 'base64'
                ? Buffer.from(body.content, 'base64').toString('utf-8')
                : body.content;
            const sha = store.createBlob(content);
            return route.fulfill({
                status: 201,
                contentType: 'application/json',
                body: JSON.stringify(createBlobResponse(content))
            });
        }

        // Route: GET /repos/{owner}/{repo}/git/blobs/{sha}
        const blobMatch = path.match(/^\/repos\/[^/]+\/[^/]+\/git\/blobs\/([a-f0-9]+)$/);
        if (blobMatch && method === 'GET') {
            const sha = blobMatch[1];
            const content = store.getBlob(sha);
            if (content) {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        sha: sha,
                        content: Buffer.from(content).toString('base64'),
                        encoding: 'base64'
                    })
                });
            } else {
                return route.fulfill({
                    status: 404,
                    contentType: 'application/json',
                    body: JSON.stringify(MOCK_404_NOT_FOUND)
                });
            }
        }

        // Route: GET /repos/{owner}/{repo}/git/ref/heads/{branch}
        const refMatch = path.match(/^\/repos\/[^/]+\/[^/]+\/git\/ref\/heads\/(.+)$/);
        if (refMatch && method === 'GET') {
            const branch = refMatch[1];
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(createRefResponse(branch))
            });
        }

        // Route: PATCH /repos/{owner}/{repo}/git/refs/heads/{branch}
        const refsMatch = path.match(/^\/repos\/[^/]+\/[^/]+\/git\/refs\/heads\/(.+)$/);
        if (refsMatch && method === 'PATCH') {
            const branch = refsMatch[1];
            const body = JSON.parse(request.postData());
            store.currentCommitSha = body.sha;
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    ref: `refs/heads/${branch}`,
                    object: { sha: body.sha, type: 'commit' }
                })
            });
        }

        // Route: GET /repos/{owner}/{repo}/git/commits/{sha}
        const commitGetMatch = path.match(/^\/repos\/[^/]+\/[^/]+\/git\/commits\/([a-f0-9]+)$/);
        if (commitGetMatch && method === 'GET') {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    sha: commitGetMatch[1],
                    tree: { sha: store.currentTreeSha },
                    parents: []
                })
            });
        }

        // Route: POST /repos/{owner}/{repo}/git/commits
        if (path.match(/^\/repos\/[^/]+\/[^/]+\/git\/commits$/) && method === 'POST') {
            const body = JSON.parse(request.postData());
            const response = createCommitResponse(body.tree, body.parents[0], body.message);
            store.currentCommitSha = response.sha;
            return route.fulfill({
                status: 201,
                contentType: 'application/json',
                body: JSON.stringify(response)
            });
        }

        // Route: POST /repos/{owner}/{repo}/git/trees
        if (path.match(/^\/repos\/[^/]+\/[^/]+\/git\/trees$/) && method === 'POST') {
            const body = JSON.parse(request.postData());
            const response = createTreeResponse(body.base_tree, body.tree);
            store.currentTreeSha = response.sha;
            return route.fulfill({
                status: 201,
                contentType: 'application/json',
                body: JSON.stringify(response)
            });
        }

        // Fallback: Log unhandled routes
        console.warn(`[Mock] Unhandled route: ${method} ${path}`);
        return route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Mock not implemented for this route' })
        });
    });

    return store;
}

/**
 * Helper to create a logged-in state for tests
 * Sets up localStorage and simulates successful authentication
 */
async function setupLoggedInState(page, options = {}) {
    const store = await setupGitHubMocks(page, { ...options, authenticated: true });

    // Set localStorage values that the app checks
    await page.evaluate(() => {
        localStorage.setItem('github_token', 'mock-token-12345');
        localStorage.setItem('github_repo', 'testuser/test-repo');
    });

    return store;
}

module.exports = {
    setupGitHubMocks,
    setupLoggedInState,
    MockGitHubStore
};
