// GitHub Todo App with AES-256-GCM Encryption

// Encryption utilities using Web Crypto API
class Crypto {
    static async deriveKey(password, salt) {
        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            'PBKDF2',
            false,
            ['deriveKey']
        );

        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    static async encrypt(plaintext, password) {
        const encoder = new TextEncoder();
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await this.deriveKey(password, salt);

        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            encoder.encode(plaintext)
        );

        // Combine salt + iv + encrypted data
        const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
        combined.set(salt, 0);
        combined.set(iv, salt.length);
        combined.set(new Uint8Array(encrypted), salt.length + iv.length);

        // Return as base64
        return btoa(String.fromCharCode(...combined));
    }

    static async decrypt(ciphertext, password) {
        try {
            const decoder = new TextDecoder();
            const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));

            const salt = combined.slice(0, 16);
            const iv = combined.slice(16, 28);
            const encrypted = combined.slice(28);

            const key = await this.deriveKey(password, salt);

            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                encrypted
            );

            return decoder.decode(decrypted);
        } catch (error) {
            throw new Error('Decryption failed. Wrong password?');
        }
    }
}

class GitHubTodoApp {
    constructor() {
        this.token = null;
        this.repo = null;
        this.encryptionPassword = null; // Never stored, must be entered each session
        this.user = null;
        this.todos = [];
        this.currentFilter = 'all';
        this.fileSha = null;
        this.dataFile = 'todos.encrypted';

        this.initElements();
        this.bindEvents();
        this.init();
    }

    initElements() {
        // Screens
        this.loginScreen = document.getElementById('login-screen');
        this.todoScreen = document.getElementById('todo-screen');

        // Login elements
        this.tokenGroup = document.getElementById('token-group');
        this.tokenInput = document.getElementById('token');
        this.repoGroup = document.getElementById('repo-group');
        this.repoInput = document.getElementById('repo');
        this.savedSettingsMsg = document.getElementById('saved-settings-msg');
        this.savedRepoDisplay = document.getElementById('saved-repo-display');
        this.changeSettingsLink = document.getElementById('change-settings-link');
        this.passwordGroup = document.getElementById('password-group');
        this.passwordInput = document.getElementById('encryption-password');
        this.confirmPasswordGroup = document.getElementById('confirm-password-group');
        this.confirmPasswordInput = document.getElementById('confirm-password');
        this.checkBtn = document.getElementById('check-btn');
        this.loginBtn = document.getElementById('login-btn');
        this.loginError = document.getElementById('login-error');

        // State
        this.isFirstTimeSetup = false;

        // Todo elements
        this.userAvatar = document.getElementById('user-avatar');
        this.userName = document.getElementById('user-name');
        this.logoutBtn = document.getElementById('logout-btn');
        this.newTodoInput = document.getElementById('new-todo');
        this.addBtn = document.getElementById('add-btn');
        this.todoList = document.getElementById('todo-list');
        this.itemsLeft = document.getElementById('items-left');
        this.clearCompletedBtn = document.getElementById('clear-completed');
        this.syncStatus = document.getElementById('sync-status');
        this.filterBtns = document.querySelectorAll('.filter-btn');
    }

    bindEvents() {
        this.checkBtn.addEventListener('click', () => this.checkExistingData());
        this.loginBtn.addEventListener('click', () => this.login());
        this.changeSettingsLink.addEventListener('click', (e) => {
            e.preventDefault();
            this.showSettingsInput();
        });
        this.logoutBtn.addEventListener('click', () => this.logout());
        this.addBtn.addEventListener('click', () => this.addTodo());
        this.newTodoInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addTodo();
        });
        this.clearCompletedBtn.addEventListener('click', () => this.clearCompleted());
        this.filterBtns.forEach(btn => {
            btn.addEventListener('click', (e) => this.setFilter(e.target.dataset.filter));
        });
    }

    async checkExistingData(autoCheck = false) {
        // Use saved values or get from input
        const token = this.token || this.tokenInput.value.trim();
        const repo = this.repo || this.repoInput.value.trim();

        if (!token || !repo) {
            if (autoCheck) {
                this.showSettingsInput();
            }
            this.showLoginError('Please enter your GitHub token and repository');
            return;
        }

        if (!repo.includes('/')) {
            this.showLoginError('Repository should be in format: owner/repo');
            return;
        }

        this.checkBtn.disabled = true;
        this.checkBtn.textContent = 'Checking...';
        this.loginError.textContent = '';

        try {
            this.token = token;
            this.repo = repo;
            this.tokenInput.value = token;
            this.repoInput.value = repo;

            await this.verifyToken();
            await this.ensureRepoAccess();

            // Check if encrypted data already exists
            const response = await this.githubFetch(
                `https://api.github.com/repos/${this.repo}/contents/${this.dataFile}`
            );

            if (response.ok || response.status === 404) {
                // 200 = data exists (returning user), 404 = no data yet (first time)
                this.isFirstTimeSetup = response.status === 404;

                if (this.isFirstTimeSetup) {
                    this.confirmPasswordGroup.classList.remove('hidden');
                } else {
                    this.confirmPasswordGroup.classList.add('hidden');
                }

                // Hide settings input, show password-only UI
                if (this.tokenGroup) this.tokenGroup.classList.add('hidden');
                if (this.repoGroup) this.repoGroup.classList.add('hidden');
                if (this.savedSettingsMsg) this.savedSettingsMsg.classList.remove('hidden');
                if (this.savedRepoDisplay) this.savedRepoDisplay.textContent = `Repo: ${repo}`;
                if (this.checkBtn) this.checkBtn.classList.add('hidden');
                if (this.loginBtn) this.loginBtn.classList.remove('hidden');
                this.showLoginError('');
                this.passwordInput.focus();

                // Save settings on success
                localStorage.setItem('github_token', token);
                localStorage.setItem('github_repo', repo);
            } else {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`Failed to check data file (${response.status}): ${errorData.message || 'Unknown error'}`);
            }

        } catch (error) {
            this.showLoginError(error.message);
            this.token = null;
            this.repo = null;
            // If this was an auto-check, show settings input again
            if (autoCheck) {
                this.showSettingsInput();
            }
        } finally {
            this.checkBtn.disabled = false;
            this.checkBtn.textContent = 'Continue';
        }
    }

    async init() {
        // Always show login screen - password is never stored
        this.showLoginScreen();

        // Check if we have saved settings
        const savedToken = localStorage.getItem('github_token');
        const savedRepo = localStorage.getItem('github_repo');

        if (savedToken && savedRepo) {
            this.token = savedToken;
            this.repo = savedRepo;
            this.tokenInput.value = savedToken;
            this.repoInput.value = savedRepo;

            // Immediately hide settings and show loading state
            if (this.tokenGroup) this.tokenGroup.classList.add('hidden');
            if (this.repoGroup) this.repoGroup.classList.add('hidden');
            if (this.savedSettingsMsg) this.savedSettingsMsg.classList.remove('hidden');
            if (this.savedRepoDisplay) this.savedRepoDisplay.textContent = `Repo: ${savedRepo}`;
            if (this.checkBtn) this.checkBtn.classList.add('hidden');

            // Auto-verify the saved settings
            await this.checkExistingData(true);
        }
    }

    showSettingsInput() {
        localStorage.removeItem('github_token');
        localStorage.removeItem('github_repo');
        this.token = null;
        this.repo = null;
        if (this.tokenGroup) this.tokenGroup.classList.remove('hidden');
        if (this.repoGroup) this.repoGroup.classList.remove('hidden');
        if (this.savedSettingsMsg) this.savedSettingsMsg.classList.add('hidden');
        if (this.checkBtn) this.checkBtn.classList.remove('hidden');
        if (this.loginBtn) this.loginBtn.classList.add('hidden');
        if (this.confirmPasswordGroup) this.confirmPasswordGroup.classList.add('hidden');
        if (this.tokenInput) this.tokenInput.value = '';
        if (this.repoInput) this.repoInput.value = '';
        if (this.tokenInput) this.tokenInput.focus();
    }

    showLoginScreen() {
        this.loginScreen.classList.remove('hidden');
        this.todoScreen.classList.add('hidden');
    }

    showTodoScreen() {
        this.loginScreen.classList.add('hidden');
        this.todoScreen.classList.remove('hidden');
        if (this.user) {
            this.userAvatar.src = this.user.avatar_url;
            this.userName.textContent = this.user.login;
        }
    }

    async login() {
        const password = this.passwordInput.value;

        if (!password) {
            this.showLoginError('Please enter your encryption password');
            return;
        }

        if (password.length < 8) {
            this.showLoginError('Password must be at least 8 characters');
            return;
        }

        // For first-time setup, validate password confirmation
        if (this.isFirstTimeSetup) {
            const confirmPassword = this.confirmPasswordInput.value;
            if (password !== confirmPassword) {
                this.showLoginError('Passwords do not match');
                return;
            }
        }

        this.loginBtn.disabled = true;
        this.loginBtn.textContent = 'Signing in...';
        this.loginError.textContent = '';

        try {
            this.encryptionPassword = password;

            await this.loadTodos();
            this.showTodoScreen();
        } catch (error) {
            this.showLoginError(error.message);
            this.encryptionPassword = null;
        } finally {
            this.loginBtn.disabled = false;
            this.loginBtn.textContent = 'Sign In';
        }
    }

    showLoginError(message) {
        this.loginError.textContent = message;
    }

    async verifyToken() {
        const response = await this.githubFetch('https://api.github.com/user');
        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Invalid token. Please check and try again.');
            }
            throw new Error(`Token verification failed: ${response.status}`);
        }
        this.user = await response.json();
        console.log('Authenticated as:', this.user.login);
    }

    async ensureRepoAccess() {
        const response = await this.githubFetch(`https://api.github.com/repos/${this.repo}`);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            if (response.status === 404) {
                throw new Error(`Repository not found (404). Check that your token has "Contents" permission for ${this.repo}`);
            } else if (response.status === 401) {
                throw new Error('Invalid token (401). Please check your token.');
            } else if (response.status === 403) {
                throw new Error(`Access forbidden (403). ${errorData.message || 'Token may lack required permissions.'}`);
            }
            throw new Error(`Cannot access repository: ${response.status} - ${errorData.message || 'Unknown error'}`);
        }
    }

    async loadTodos() {
        this.setSyncStatus('Loading...', '');
        try {
            const response = await this.githubFetch(
                `https://api.github.com/repos/${this.repo}/contents/${this.dataFile}`
            );

            if (response.ok) {
                const data = await response.json();
                this.fileSha = data.sha;
                const encryptedContent = atob(data.content);

                // Decrypt the content
                const decrypted = await Crypto.decrypt(encryptedContent, this.encryptionPassword);
                this.todos = JSON.parse(decrypted);
            } else if (response.status === 404) {
                // File doesn't exist yet, start with empty todos
                this.todos = [];
                this.fileSha = null;
            } else {
                throw new Error('Failed to load todos');
            }

            this.renderTodos();
            this.setSyncStatus('Synced with GitHub (encrypted)', 'saved');
        } catch (error) {
            console.error('Load error:', error);
            if (error.message.includes('Decryption failed')) {
                throw new Error('Wrong encryption password');
            }
            this.setSyncStatus('Failed to load todos', 'error');
            throw error;
        }
    }

    async saveTodos() {
        this.setSyncStatus('Encrypting & saving...', 'saving');
        try {
            // Encrypt the todos
            const plaintext = JSON.stringify(this.todos, null, 2);
            const encrypted = await Crypto.encrypt(plaintext, this.encryptionPassword);

            const content = btoa(encrypted);
            const body = {
                message: 'Update encrypted todos',
                content: content
            };

            if (this.fileSha) {
                body.sha = this.fileSha;
            }

            const response = await this.githubFetch(
                `https://api.github.com/repos/${this.repo}/contents/${this.dataFile}`,
                {
                    method: 'PUT',
                    body: JSON.stringify(body)
                }
            );

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to save');
            }

            const data = await response.json();
            this.fileSha = data.content.sha;
            this.setSyncStatus('Encrypted & saved to GitHub', 'saved');
        } catch (error) {
            console.error('Save error:', error);
            this.setSyncStatus('Failed to save: ' + error.message, 'error');
        }
    }

    async githubFetch(url, options = {}) {
        return fetch(url, {
            ...options,
            headers: {
                'Authorization': `token ${this.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
    }

    setSyncStatus(message, className) {
        this.syncStatus.textContent = message;
        this.syncStatus.className = 'sync-status ' + className;
    }

    addTodo() {
        const text = this.newTodoInput.value.trim();
        if (!text) return;

        const todo = {
            id: Date.now().toString(),
            text: text,
            completed: false,
            createdAt: new Date().toISOString()
        };

        this.todos.unshift(todo);
        this.newTodoInput.value = '';
        this.renderTodos();
        this.saveTodos();
    }

    toggleTodo(id) {
        const todo = this.todos.find(t => t.id === id);
        if (todo) {
            todo.completed = !todo.completed;
            this.renderTodos();
            this.saveTodos();
        }
    }

    deleteTodo(id) {
        this.todos = this.todos.filter(t => t.id !== id);
        this.renderTodos();
        this.saveTodos();
    }

    clearCompleted() {
        this.todos = this.todos.filter(t => !t.completed);
        this.renderTodos();
        this.saveTodos();
    }

    setFilter(filter) {
        this.currentFilter = filter;
        this.filterBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });
        this.renderTodos();
    }

    getFilteredTodos() {
        switch (this.currentFilter) {
            case 'active':
                return this.todos.filter(t => !t.completed);
            case 'completed':
                return this.todos.filter(t => t.completed);
            default:
                return this.todos;
        }
    }

    renderTodos() {
        const filtered = this.getFilteredTodos();

        if (filtered.length === 0) {
            this.todoList.innerHTML = `
                <li class="empty-state">
                    ${this.todos.length === 0 ? 'No todos yet. Add one above!' : 'No todos match this filter.'}
                </li>
            `;
        } else {
            this.todoList.innerHTML = filtered.map(todo => `
                <li class="todo-item ${todo.completed ? 'completed' : ''}" data-id="${todo.id}">
                    <input type="checkbox" class="todo-checkbox" ${todo.completed ? 'checked' : ''}>
                    <span class="todo-text">${this.escapeHtml(todo.text)}</span>
                    <button class="todo-delete">&times;</button>
                </li>
            `).join('');

            // Bind events to todo items
            this.todoList.querySelectorAll('.todo-item').forEach(item => {
                const id = item.dataset.id;
                item.querySelector('.todo-checkbox').addEventListener('change', () => this.toggleTodo(id));
                item.querySelector('.todo-delete').addEventListener('click', () => this.deleteTodo(id));
            });
        }

        // Update items left count
        const activeCount = this.todos.filter(t => !t.completed).length;
        this.itemsLeft.textContent = `${activeCount} item${activeCount !== 1 ? 's' : ''} left`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    logout() {
        localStorage.removeItem('github_token');
        localStorage.removeItem('github_repo');
        this.token = null;
        this.repo = null;
        this.encryptionPassword = null;
        this.user = null;
        this.todos = [];
        this.fileSha = null;
        this.isFirstTimeSetup = false;
        if (this.tokenInput) this.tokenInput.value = '';
        if (this.repoInput) this.repoInput.value = '';
        if (this.passwordInput) this.passwordInput.value = '';
        if (this.confirmPasswordInput) this.confirmPasswordInput.value = '';
        if (this.tokenGroup) this.tokenGroup.classList.remove('hidden');
        if (this.repoGroup) this.repoGroup.classList.remove('hidden');
        if (this.savedSettingsMsg) this.savedSettingsMsg.classList.add('hidden');
        if (this.confirmPasswordGroup) this.confirmPasswordGroup.classList.add('hidden');
        if (this.checkBtn) this.checkBtn.classList.remove('hidden');
        if (this.loginBtn) this.loginBtn.classList.add('hidden');
        this.showLoginScreen();
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    new GitHubTodoApp();
});
