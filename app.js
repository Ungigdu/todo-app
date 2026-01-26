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
        this.actionsFile = 'actions.encrypted';

        // Sync settings
        this.isSyncing = false;
        this.actionsSha = null;
        this.actions = [];
        this.maxActionsToShow = 20;

        // Device ID - unique per device, persisted
        this.deviceId = this.getOrCreateDeviceId();

        this.initElements();
        this.bindEvents();
        this.init();
    }

    getOrCreateDeviceId() {
        let deviceId = localStorage.getItem('device_id');
        if (!deviceId) {
            // Generate a short unique ID for this device
            deviceId = 'dev_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
            localStorage.setItem('device_id', deviceId);
        }
        return deviceId;
    }

    getDeviceDisplayName() {
        // Try to get a friendly device name
        const ua = navigator.userAgent;
        if (/iPhone/.test(ua)) return 'iPhone';
        if (/iPad/.test(ua)) return 'iPad';
        if (/Android/.test(ua)) return 'Android';
        if (/Mac/.test(ua)) return 'Mac';
        if (/Windows/.test(ua)) return 'Windows';
        if (/Linux/.test(ua)) return 'Linux';
        return 'Device';
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

        // Sync elements
        this.syncNowBtn = document.getElementById('sync-now-btn');
        this.toggleHistoryBtn = document.getElementById('toggle-history-btn');
        this.actionHistory = document.getElementById('action-history');
        this.actionList = document.getElementById('action-list');
        this.deviceIdDisplay = document.getElementById('device-id-display');
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

        // Sync events
        if (this.syncNowBtn) {
            this.syncNowBtn.addEventListener('click', () => this.manualSync());
        }
        if (this.toggleHistoryBtn) {
            this.toggleHistoryBtn.addEventListener('click', () => this.toggleActionHistory());
        }
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

        // Display device ID
        if (this.deviceIdDisplay) {
            this.deviceIdDisplay.textContent = `${this.getDeviceDisplayName()} (${this.deviceId.slice(-6)})`;
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
            // Load todos and actions in parallel
            const [todosResponse, actionsResponse] = await Promise.all([
                this.githubFetch(`https://api.github.com/repos/${this.repo}/contents/${this.dataFile}`),
                this.githubFetch(`https://api.github.com/repos/${this.repo}/contents/${this.actionsFile}`)
            ]);

            // Load todos
            if (todosResponse.ok) {
                const data = await todosResponse.json();
                this.fileSha = data.sha;
                const encryptedContent = atob(data.content);
                const decrypted = await Crypto.decrypt(encryptedContent, this.encryptionPassword);
                this.todos = JSON.parse(decrypted);
            } else if (todosResponse.status === 404) {
                this.todos = [];
                this.fileSha = null;
            } else {
                throw new Error('Failed to load todos');
            }

            // Load actions
            if (actionsResponse.ok) {
                const data = await actionsResponse.json();
                this.actionsSha = data.sha;
                const encryptedContent = atob(data.content);
                const decrypted = await Crypto.decrypt(encryptedContent, this.encryptionPassword);
                this.actions = JSON.parse(decrypted);
            } else if (actionsResponse.status === 404) {
                this.actions = [];
                this.actionsSha = null;
            }

            this.renderTodos();
            this.renderActions();
            this.setSyncStatus('Synced', 'saved');
        } catch (error) {
            console.error('Load error:', error);
            if (error.message.includes('Decryption failed')) {
                throw new Error('Wrong encryption password');
            }
            this.setSyncStatus('Failed to load todos', 'error');
            throw error;
        }
    }

    async saveTodos(action = null) {
        this.setSyncStatus('Checking remote state...', 'saving');
        try {
            // Record the action if provided
            if (action) {
                this.recordAction(action);
            }

            // First, fetch current remote state to check for conflicts
            const [remoteTodosResponse, remoteActionsResponse] = await Promise.all([
                this.githubFetch(`https://api.github.com/repos/${this.repo}/contents/${this.dataFile}`),
                this.githubFetch(`https://api.github.com/repos/${this.repo}/contents/${this.actionsFile}`)
            ]);

            // Use local variables to store the SHAs we'll use for PUT
            let currentTodosSha = null;
            let currentActionsSha = null;

            // Check for todos conflict and merge if needed
            if (remoteTodosResponse.ok) {
                const remoteData = await remoteTodosResponse.json();
                currentTodosSha = remoteData.sha;  // ALWAYS use the fetched SHA

                if (remoteData.sha !== this.fileSha) {
                    // Remote has changed - merge todos
                    console.log('Remote todos changed, merging...');
                    const encryptedContent = atob(remoteData.content);
                    const decrypted = await Crypto.decrypt(encryptedContent, this.encryptionPassword);
                    const remoteTodos = JSON.parse(decrypted);
                    this.todos = this.mergeTodos(remoteTodos, this.todos);
                }
            }
            // If 404, currentTodosSha stays null (new file)

            // Check for actions conflict and merge if needed
            if (remoteActionsResponse.ok) {
                const remoteData = await remoteActionsResponse.json();
                currentActionsSha = remoteData.sha;  // ALWAYS use the fetched SHA

                if (remoteData.sha !== this.actionsSha) {
                    // Remote has changed - merge actions
                    console.log('Remote actions changed, merging...');
                    const encryptedContent = atob(remoteData.content);
                    const decrypted = await Crypto.decrypt(encryptedContent, this.encryptionPassword);
                    const remoteActions = JSON.parse(decrypted);
                    this.actions = this.mergeActions(remoteActions, this.actions);
                }
            }
            // If 404, currentActionsSha stays null (new file)

            this.setSyncStatus('Encrypting & saving...', 'saving');

            // Encrypt todos and actions
            const todosPlaintext = JSON.stringify(this.todos, null, 2);
            const todosEncrypted = await Crypto.encrypt(todosPlaintext, this.encryptionPassword);

            const actionsPlaintext = JSON.stringify(this.actions, null, 2);
            const actionsEncrypted = await Crypto.encrypt(actionsPlaintext, this.encryptionPassword);

            // Prepare both requests - use the SHAs we fetched, not instance properties
            const todosBody = {
                message: 'Update encrypted todos',
                content: btoa(todosEncrypted)
            };
            if (currentTodosSha) {
                todosBody.sha = currentTodosSha;
            }

            const actionsBody = {
                message: 'Update action log',
                content: btoa(actionsEncrypted)
            };
            if (currentActionsSha) {
                actionsBody.sha = currentActionsSha;
            }

            // Save both files
            const [todosResponse, actionsResponse] = await Promise.all([
                this.githubFetch(
                    `https://api.github.com/repos/${this.repo}/contents/${this.dataFile}`,
                    { method: 'PUT', body: JSON.stringify(todosBody) }
                ),
                this.githubFetch(
                    `https://api.github.com/repos/${this.repo}/contents/${this.actionsFile}`,
                    { method: 'PUT', body: JSON.stringify(actionsBody) }
                )
            ]);

            if (!todosResponse.ok) {
                const error = await todosResponse.json();
                throw new Error(error.message || 'Failed to save todos');
            }

            // Update instance SHAs only after successful save
            const todosData = await todosResponse.json();
            this.fileSha = todosData.content.sha;

            if (actionsResponse.ok) {
                const actionsData = await actionsResponse.json();
                this.actionsSha = actionsData.content.sha;
            }

            this.renderTodos();
            this.renderActions();
            this.setSyncStatus('Saved', 'saved');
        } catch (error) {
            console.error('Save error:', error);
            this.setSyncStatus('Failed to save: ' + error.message, 'error');
        }
    }

    mergeTodos(remoteTodos, localTodos) {
        // Create a map of all todos by ID
        const todoMap = new Map();

        // Add remote todos first
        for (const todo of remoteTodos) {
            todoMap.set(todo.id, todo);
        }

        // Merge local todos - local changes take precedence for existing items
        for (const todo of localTodos) {
            todoMap.set(todo.id, todo);
        }

        // Convert back to array and sort by createdAt (newest first)
        const merged = Array.from(todoMap.values());
        merged.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        return merged;
    }

    mergeActions(remoteActions, localActions) {
        // Create a map of all actions by ID
        const actionMap = new Map();

        // Add all actions
        for (const action of remoteActions) {
            actionMap.set(action.id, action);
        }
        for (const action of localActions) {
            actionMap.set(action.id, action);
        }

        // Convert back to array and sort by timestamp (newest first)
        const merged = Array.from(actionMap.values());
        merged.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Keep only the last 50 actions
        return merged.slice(0, 50);
    }

    recordAction(action) {
        const actionRecord = {
            id: Date.now().toString(),
            type: action.type,
            description: action.description,
            deviceId: this.deviceId,
            deviceName: this.getDeviceDisplayName(),
            timestamp: new Date().toISOString(),
            todoId: action.todoId || null
        };

        this.actions.unshift(actionRecord);

        // Keep only the last 50 actions
        if (this.actions.length > 50) {
            this.actions = this.actions.slice(0, 50);
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
        this.saveTodos({
            type: 'add',
            description: `Added "${this.truncateText(text, 30)}"`,
            todoId: todo.id
        });
    }

    toggleTodo(id) {
        const todo = this.todos.find(t => t.id === id);
        if (todo) {
            todo.completed = !todo.completed;
            this.renderTodos();
            this.saveTodos({
                type: 'toggle',
                description: `${todo.completed ? 'Completed' : 'Uncompleted'} "${this.truncateText(todo.text, 30)}"`,
                todoId: id
            });
        }
    }

    deleteTodo(id) {
        const todo = this.todos.find(t => t.id === id);
        const text = todo ? todo.text : 'item';
        this.todos = this.todos.filter(t => t.id !== id);
        this.renderTodos();
        this.saveTodos({
            type: 'delete',
            description: `Deleted "${this.truncateText(text, 30)}"`,
            todoId: id
        });
    }

    clearCompleted() {
        const count = this.todos.filter(t => t.completed).length;
        if (count === 0) return;

        this.todos = this.todos.filter(t => !t.completed);
        this.renderTodos();
        this.saveTodos({
            type: 'clear',
            description: `Cleared ${count} completed item${count !== 1 ? 's' : ''}`
        });
    }

    truncateText(text, maxLength) {
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
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

    // Sync Methods
    async syncFromRemote() {
        if (this.isSyncing) return;

        this.isSyncing = true;
        this.setSyncStatus('Syncing changes...', 'syncing');

        if (this.syncNowBtn) {
            this.syncNowBtn.classList.add('syncing');
            this.syncNowBtn.textContent = 'Syncing...';
        }

        try {
            // Load both todos and actions from remote
            const [todosResponse, actionsResponse] = await Promise.all([
                this.githubFetch(`https://api.github.com/repos/${this.repo}/contents/${this.dataFile}`),
                this.githubFetch(`https://api.github.com/repos/${this.repo}/contents/${this.actionsFile}`)
            ]);

            if (todosResponse.ok) {
                const data = await todosResponse.json();
                this.fileSha = data.sha;
                const encryptedContent = atob(data.content);
                const decrypted = await Crypto.decrypt(encryptedContent, this.encryptionPassword);
                this.todos = JSON.parse(decrypted);
            }

            if (actionsResponse.ok) {
                const data = await actionsResponse.json();
                this.actionsSha = data.sha;
                const encryptedContent = atob(data.content);
                const decrypted = await Crypto.decrypt(encryptedContent, this.encryptionPassword);
                this.actions = JSON.parse(decrypted);
            }

            this.renderTodos();
            this.renderActions();
            this.setSyncStatus('Synced', 'saved');

        } catch (error) {
            console.error('Sync error:', error);
            this.setSyncStatus('Sync failed: ' + error.message, 'error');
        } finally {
            this.isSyncing = false;
            if (this.syncNowBtn) {
                this.syncNowBtn.classList.remove('syncing');
                this.syncNowBtn.textContent = 'Sync Now';
            }
        }
    }

    async manualSync() {
        await this.syncFromRemote();
    }

    toggleActionHistory() {
        if (this.actionHistory) {
            this.actionHistory.classList.toggle('hidden');
            if (this.toggleHistoryBtn) {
                const isHidden = this.actionHistory.classList.contains('hidden');
                this.toggleHistoryBtn.textContent = isHidden ? 'Action History' : 'Hide History';
            }
        }
    }

    renderActions() {
        if (!this.actionList) return;

        const actionsToShow = this.actions.slice(0, this.maxActionsToShow);

        if (actionsToShow.length === 0) {
            this.actionList.innerHTML = '<li class="empty-state">No actions recorded yet</li>';
            return;
        }

        this.actionList.innerHTML = actionsToShow.map(action => {
            const isOtherDevice = action.deviceId !== this.deviceId;
            const timeAgo = this.getTimeAgo(new Date(action.timestamp));
            const icon = this.getActionIcon(action.type);

            return `
                <li class="action-item ${isOtherDevice ? 'from-other-device' : ''}">
                    <span class="action-icon ${action.type}">${icon}</span>
                    <div class="action-details">
                        <div class="action-text">${this.escapeHtml(action.description)}</div>
                        <div class="action-meta">
                            ${timeAgo}
                            <span class="action-device ${isOtherDevice ? 'other' : ''}">
                                ${action.deviceName || 'Unknown'}${isOtherDevice ? '' : ' (this device)'}
                            </span>
                        </div>
                    </div>
                </li>
            `;
        }).join('');
    }

    getActionIcon(type) {
        switch (type) {
            case 'add': return '+';
            case 'toggle': return '✓';
            case 'delete': return '×';
            case 'clear': return '⌫';
            default: return '•';
        }
    }

    getTimeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);

        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

        return date.toLocaleDateString();
    }

    logout() {
        localStorage.removeItem('github_token');
        localStorage.removeItem('github_repo');
        this.token = null;
        this.repo = null;
        this.encryptionPassword = null;
        this.user = null;
        this.todos = [];
        this.actions = [];
        this.fileSha = null;
        this.actionsSha = null;
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
        if (this.actionHistory) this.actionHistory.classList.add('hidden');
        if (this.toggleHistoryBtn) this.toggleHistoryBtn.textContent = 'Action History';
        this.showLoginScreen();
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    new GitHubTodoApp();
});
