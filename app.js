// GitHub Todo App with AES-256-GCM Encryption

// Sync Tracker for debugging cross-device sync issues
class SyncTracker {
    constructor() {
        this.logs = [];
        this.maxLogs = 100;
        this.logElement = null;
        this.localTodosShaElement = null;
        this.localActionsShaElement = null;
    }

    init() {
        this.logElement = document.getElementById('tracker-log');
        this.localTodosShaElement = document.getElementById('local-todos-sha');
        this.localActionsShaElement = document.getElementById('local-actions-sha');
    }

    log(type, message, details = null) {
        const entry = {
            time: new Date().toISOString(),
            type,
            message,
            details
        };
        this.logs.unshift(entry);
        if (this.logs.length > this.maxLogs) {
            this.logs.pop();
        }
        this.render();
        console.log(`[SyncTracker:${type}]`, message, details || '');
    }

    info(message, details) { this.log('info', message, details); }
    success(message, details) { this.log('success', message, details); }
    warning(message, details) { this.log('warning', message, details); }
    error(message, details) { this.log('error', message, details); }
    conflict(message, details) { this.log('conflict', message, details); }

    updateShaDisplay(todosSha, actionsSha) {
        if (this.localTodosShaElement) {
            this.localTodosShaElement.textContent = todosSha ? todosSha.substring(0, 12) + '...' : '-';
            this.localTodosShaElement.title = todosSha || '';
        }
        if (this.localActionsShaElement) {
            this.localActionsShaElement.textContent = actionsSha ? actionsSha.substring(0, 12) + '...' : '-';
            this.localActionsShaElement.title = actionsSha || '';
        }
    }

    render() {
        if (!this.logElement) return;

        this.logElement.innerHTML = this.logs.map(entry => {
            const time = new Date(entry.time).toLocaleTimeString();
            let detailsHtml = '';
            if (entry.details) {
                if (typeof entry.details === 'object') {
                    detailsHtml = `<div class="tracker-details"><code>${JSON.stringify(entry.details, null, 2)}</code></div>`;
                } else {
                    detailsHtml = `<div class="tracker-details">${entry.details}</div>`;
                }
            }
            return `
                <li class="tracker-entry ${entry.type}">
                    <span class="tracker-time">${time}</span>
                    <span class="tracker-type">${entry.type}</span>
                    <span class="tracker-message">${entry.message}</span>
                    ${detailsHtml}
                </li>
            `;
        }).join('');
    }

    clear() {
        this.logs = [];
        this.render();
    }

    copyToClipboard() {
        const text = this.logs.map(entry => {
            let line = `[${entry.time}] [${entry.type.toUpperCase()}] ${entry.message}`;
            if (entry.details) {
                line += '\n  ' + JSON.stringify(entry.details);
            }
            return line;
        }).join('\n');
        navigator.clipboard.writeText(text).then(() => {
            alert('Tracker logs copied to clipboard!');
        });
    }
}

// Global sync tracker instance
const syncTracker = new SyncTracker();

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

        // Initialize sync tracker
        syncTracker.init();
        syncTracker.info('App initialized', { deviceId: this.deviceId, deviceName: this.getDeviceDisplayName() });

        // Auto-sync when page becomes visible (user switches back to tab/app)
        this.setupVisibilitySync();
    }

    setupVisibilitySync() {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && this.encryptionPassword) {
                syncTracker.info('Page became visible - auto-syncing...');
                this.syncFromRemote();
            }
        });

        // Also sync on window focus (some mobile browsers don't fire visibilitychange)
        window.addEventListener('focus', () => {
            if (this.encryptionPassword && !this.isSyncing) {
                syncTracker.info('Window focused - auto-syncing...');
                this.syncFromRemote();
            }
        });
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

        // Tracker elements
        this.toggleTrackerBtn = document.getElementById('toggle-tracker-btn');
        this.syncTrackerPanel = document.getElementById('sync-tracker');
        this.clearTrackerBtn = document.getElementById('clear-tracker-btn');
        this.copyTrackerBtn = document.getElementById('copy-tracker-btn');
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

        // Tracker events
        if (this.toggleTrackerBtn) {
            this.toggleTrackerBtn.addEventListener('click', () => this.toggleSyncTracker());
        }
        if (this.clearTrackerBtn) {
            this.clearTrackerBtn.addEventListener('click', () => syncTracker.clear());
        }
        if (this.copyTrackerBtn) {
            this.copyTrackerBtn.addEventListener('click', () => syncTracker.copyToClipboard());
        }
    }

    toggleSyncTracker() {
        if (this.syncTrackerPanel) {
            this.syncTrackerPanel.classList.toggle('hidden');
            if (this.toggleTrackerBtn) {
                const isHidden = this.syncTrackerPanel.classList.contains('hidden');
                this.toggleTrackerBtn.textContent = isHidden ? 'Show Sync Tracker' : 'Hide Sync Tracker';
            }
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
        syncTracker.info('Starting loadTodos...');
        try {
            // Load todos and actions in parallel
            syncTracker.info('Fetching todos and actions from GitHub...');
            const [todosResponse, actionsResponse] = await Promise.all([
                this.githubFetch(`https://api.github.com/repos/${this.repo}/contents/${this.dataFile}`),
                this.githubFetch(`https://api.github.com/repos/${this.repo}/contents/${this.actionsFile}`)
            ]);

            syncTracker.info('Received responses', {
                todosStatus: todosResponse.status,
                actionsStatus: actionsResponse.status
            });

            // Load todos
            if (todosResponse.ok) {
                const data = await todosResponse.json();
                const oldSha = this.fileSha;
                this.fileSha = data.sha;
                const encryptedContent = atob(data.content);
                const decrypted = await Crypto.decrypt(encryptedContent, this.encryptionPassword);
                this.todos = JSON.parse(decrypted);
                syncTracker.success('Loaded todos from remote', {
                    todoCount: this.todos.length,
                    oldSha: oldSha ? oldSha.substring(0, 12) : null,
                    newSha: this.fileSha.substring(0, 12)
                });
            } else if (todosResponse.status === 404) {
                this.todos = [];
                this.fileSha = null;
                syncTracker.info('No todos file found (404), starting fresh');
            } else {
                syncTracker.error('Failed to load todos', { status: todosResponse.status });
                throw new Error('Failed to load todos');
            }

            // Load actions
            if (actionsResponse.ok) {
                const data = await actionsResponse.json();
                this.actionsSha = data.sha;
                const encryptedContent = atob(data.content);
                const decrypted = await Crypto.decrypt(encryptedContent, this.encryptionPassword);
                this.actions = JSON.parse(decrypted);
                syncTracker.success('Loaded actions from remote', {
                    actionCount: this.actions.length,
                    sha: this.actionsSha.substring(0, 12)
                });
            } else if (actionsResponse.status === 404) {
                this.actions = [];
                this.actionsSha = null;
                syncTracker.info('No actions file found (404), starting fresh');
            }

            // Update SHA display
            syncTracker.updateShaDisplay(this.fileSha, this.actionsSha);

            this.renderTodos();
            this.renderActions();
            this.setSyncStatus('Synced', 'saved');
            syncTracker.success('loadTodos completed successfully');
        } catch (error) {
            console.error('Load error:', error);
            syncTracker.error('loadTodos failed', { error: error.message });
            if (error.message.includes('Decryption failed')) {
                throw new Error('Wrong encryption password');
            }
            this.setSyncStatus('Failed to load todos', 'error');
            throw error;
        }
    }

    async saveTodos(action = null, retryCount = 0) {
        const maxRetries = 3;
        this.setSyncStatus('Checking remote state...', 'saving');
        syncTracker.info(`saveTodos started (attempt ${retryCount + 1}/${maxRetries + 1})`, {
            action: action ? action.type : null,
            localTodosSha: this.fileSha ? this.fileSha.substring(0, 12) : null,
            localActionsSha: this.actionsSha ? this.actionsSha.substring(0, 12) : null
        });

        try {
            // Record the action if provided (only on first attempt)
            if (action && retryCount === 0) {
                this.recordAction(action);
                syncTracker.info('Recorded action', { type: action.type, description: action.description });
            }

            // First, fetch current remote state to check for conflicts
            syncTracker.info('Fetching remote state to check for conflicts...');
            const [remoteTodosResponse, remoteActionsResponse] = await Promise.all([
                this.githubFetch(`https://api.github.com/repos/${this.repo}/contents/${this.dataFile}`),
                this.githubFetch(`https://api.github.com/repos/${this.repo}/contents/${this.actionsFile}`)
            ]);

            syncTracker.info('Remote state responses received', {
                todosStatus: remoteTodosResponse.status,
                actionsStatus: remoteActionsResponse.status
            });

            // Check for todos conflict and merge if needed
            if (remoteTodosResponse.ok) {
                const remoteData = await remoteTodosResponse.json();
                const remoteSha = remoteData.sha;
                syncTracker.info('Remote todos SHA comparison', {
                    localSha: this.fileSha ? this.fileSha.substring(0, 12) : null,
                    remoteSha: remoteSha.substring(0, 12),
                    match: remoteSha === this.fileSha
                });

                if (remoteData.sha !== this.fileSha) {
                    // Remote has changed - merge todos
                    syncTracker.conflict('CONFLICT DETECTED: Remote todos changed since last sync', {
                        localSha: this.fileSha ? this.fileSha.substring(0, 12) : 'null',
                        remoteSha: remoteSha.substring(0, 12)
                    });
                    const encryptedContent = atob(remoteData.content);
                    const decrypted = await Crypto.decrypt(encryptedContent, this.encryptionPassword);
                    const remoteTodos = JSON.parse(decrypted);
                    syncTracker.info('Remote todos decrypted', {
                        remoteTodoCount: remoteTodos.length,
                        localTodoCount: this.todos.length
                    });
                    const mergedTodos = this.mergeTodos(remoteTodos, this.todos);
                    syncTracker.success('Todos merged', {
                        beforeCount: this.todos.length,
                        afterCount: mergedTodos.length,
                        remoteTodoCount: remoteTodos.length
                    });
                    this.todos = mergedTodos;
                    this.fileSha = remoteData.sha;
                }
            } else if (remoteTodosResponse.status === 404) {
                syncTracker.info('Remote todos file not found (404), will create new');
                this.fileSha = null;
            }

            // Check for actions conflict and merge if needed
            if (remoteActionsResponse.ok) {
                const remoteData = await remoteActionsResponse.json();
                const remoteSha = remoteData.sha;
                syncTracker.info('Remote actions SHA comparison', {
                    localSha: this.actionsSha ? this.actionsSha.substring(0, 12) : null,
                    remoteSha: remoteSha.substring(0, 12),
                    match: remoteSha === this.actionsSha
                });

                if (remoteData.sha !== this.actionsSha) {
                    syncTracker.conflict('CONFLICT DETECTED: Remote actions changed since last sync', {
                        localSha: this.actionsSha ? this.actionsSha.substring(0, 12) : 'null',
                        remoteSha: remoteSha.substring(0, 12)
                    });
                    const encryptedContent = atob(remoteData.content);
                    const decrypted = await Crypto.decrypt(encryptedContent, this.encryptionPassword);
                    const remoteActions = JSON.parse(decrypted);
                    this.actions = this.mergeActions(remoteActions, this.actions);
                    this.actionsSha = remoteData.sha;
                    syncTracker.success('Actions merged');
                }
            } else if (remoteActionsResponse.status === 404) {
                syncTracker.info('Remote actions file not found (404), will create new');
                this.actionsSha = null;
            }

            this.setSyncStatus('Encrypting & saving...', 'saving');
            syncTracker.info('Encrypting data...');

            // Encrypt todos and actions
            const todosPlaintext = JSON.stringify(this.todos, null, 2);
            const todosEncrypted = await Crypto.encrypt(todosPlaintext, this.encryptionPassword);

            const actionsPlaintext = JSON.stringify(this.actions, null, 2);
            const actionsEncrypted = await Crypto.encrypt(actionsPlaintext, this.encryptionPassword);

            // Prepare both requests
            const todosBody = {
                message: 'Update encrypted todos',
                content: btoa(todosEncrypted)
            };
            if (this.fileSha) {
                todosBody.sha = this.fileSha;
            }

            const actionsBody = {
                message: 'Update action log',
                content: btoa(actionsEncrypted)
            };
            if (this.actionsSha) {
                actionsBody.sha = this.actionsSha;
            }

            syncTracker.info('Sending PUT requests to GitHub', {
                todosSha: this.fileSha ? this.fileSha.substring(0, 12) : 'new',
                actionsSha: this.actionsSha ? this.actionsSha.substring(0, 12) : 'new'
            });

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

            syncTracker.info('PUT responses received', {
                todosStatus: todosResponse.status,
                actionsStatus: actionsResponse.status
            });

            if (!todosResponse.ok) {
                const error = await todosResponse.json();
                syncTracker.error('Failed to save todos', {
                    status: todosResponse.status,
                    message: error.message,
                    usedSha: this.fileSha ? this.fileSha.substring(0, 12) : 'null'
                });

                // Check if this is a SHA mismatch (409 conflict or message contains "does not match")
                if (todosResponse.status === 409 || (error.message && error.message.includes('does not match'))) {
                    if (retryCount < maxRetries) {
                        syncTracker.warning(`SHA mismatch detected, retrying (${retryCount + 1}/${maxRetries})...`);
                        // Clear the SHA so we fetch fresh on retry
                        this.fileSha = null;
                        this.actionsSha = null;
                        return await this.saveTodos(null, retryCount + 1);
                    }
                }
                throw new Error(error.message || 'Failed to save todos');
            }

            const todosData = await todosResponse.json();
            const oldTodosSha = this.fileSha;
            this.fileSha = todosData.content.sha;
            syncTracker.success('Todos saved successfully', {
                oldSha: oldTodosSha ? oldTodosSha.substring(0, 12) : 'new',
                newSha: this.fileSha.substring(0, 12)
            });

            if (actionsResponse.ok) {
                const actionsData = await actionsResponse.json();
                const oldActionsSha = this.actionsSha;
                this.actionsSha = actionsData.content.sha;
                syncTracker.success('Actions saved successfully', {
                    oldSha: oldActionsSha ? oldActionsSha.substring(0, 12) : 'new',
                    newSha: this.actionsSha.substring(0, 12)
                });
            } else {
                const actionsError = await actionsResponse.json().catch(() => ({}));
                syncTracker.warning('Actions save failed (non-critical)', {
                    status: actionsResponse.status,
                    message: actionsError.message
                });
            }

            // Update SHA display
            syncTracker.updateShaDisplay(this.fileSha, this.actionsSha);

            this.renderTodos();
            this.renderActions();
            this.setSyncStatus('Saved', 'saved');
            syncTracker.success('saveTodos completed successfully');
        } catch (error) {
            console.error('Save error:', error);
            syncTracker.error('saveTodos failed', { error: error.message, retryCount });
            this.setSyncStatus('Failed to save: ' + error.message, 'error');
        }
    }

    mergeTodos(remoteTodos, localTodos) {
        syncTracker.info('Merging todos...', {
            remoteCount: remoteTodos.length,
            localCount: localTodos.length
        });

        // Create a map of all todos by ID
        const todoMap = new Map();
        const remoteIds = new Set();
        const localIds = new Set();

        // Add remote todos first
        for (const todo of remoteTodos) {
            todoMap.set(todo.id, todo);
            remoteIds.add(todo.id);
        }

        // Merge local todos - local changes take precedence for existing items
        let overwritten = 0;
        let newFromLocal = 0;
        for (const todo of localTodos) {
            localIds.add(todo.id);
            if (todoMap.has(todo.id)) {
                overwritten++;
            } else {
                newFromLocal++;
            }
            todoMap.set(todo.id, todo);
        }

        // Calculate stats
        const onlyInRemote = [...remoteIds].filter(id => !localIds.has(id)).length;
        const onlyInLocal = [...localIds].filter(id => !remoteIds.has(id)).length;
        const inBoth = [...remoteIds].filter(id => localIds.has(id)).length;

        syncTracker.info('Merge stats', {
            onlyInRemote,
            onlyInLocal,
            inBoth,
            localOverwroteRemote: overwritten
        });

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
        const isGetRequest = !options.method || options.method === 'GET';
        // Only apply cache-busting to contents API (sync-related endpoints)
        const isContentsApi = url.includes('/contents/');

        let finalUrl = url;
        if (isGetRequest && isContentsApi) {
            // Add cache-busting query param to avoid stale CDN responses
            const cacheBuster = `_cb=${Date.now()}`;
            finalUrl = url.includes('?') ? `${url}&${cacheBuster}` : `${url}?${cacheBuster}`;
            syncTracker.info('Cache-busting GET request', { cacheBuster });
        }

        return fetch(finalUrl, {
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
        if (this.isSyncing) {
            syncTracker.warning('Sync already in progress, skipping');
            return;
        }

        this.isSyncing = true;
        this.setSyncStatus('Syncing changes...', 'syncing');
        syncTracker.info('Manual sync started (syncFromRemote)', {
            currentTodosSha: this.fileSha ? this.fileSha.substring(0, 12) : null,
            currentActionsSha: this.actionsSha ? this.actionsSha.substring(0, 12) : null,
            localTodoCount: this.todos.length
        });

        if (this.syncNowBtn) {
            this.syncNowBtn.classList.add('syncing');
            this.syncNowBtn.textContent = 'Syncing...';
        }

        try {
            // Load both todos and actions from remote
            syncTracker.info('Fetching remote data...');
            const [todosResponse, actionsResponse] = await Promise.all([
                this.githubFetch(`https://api.github.com/repos/${this.repo}/contents/${this.dataFile}`),
                this.githubFetch(`https://api.github.com/repos/${this.repo}/contents/${this.actionsFile}`)
            ]);

            syncTracker.info('Remote responses received', {
                todosStatus: todosResponse.status,
                actionsStatus: actionsResponse.status
            });

            let todosChanged = false;
            let actionsChanged = false;

            if (todosResponse.ok) {
                const data = await todosResponse.json();
                const oldSha = this.fileSha;
                const newSha = data.sha;

                syncTracker.info('Todos SHA comparison', {
                    localSha: oldSha ? oldSha.substring(0, 12) : null,
                    remoteSha: newSha.substring(0, 12),
                    match: oldSha === newSha
                });

                if (oldSha !== newSha) {
                    todosChanged = true;
                    this.fileSha = newSha;
                    const encryptedContent = atob(data.content);
                    const decrypted = await Crypto.decrypt(encryptedContent, this.encryptionPassword);
                    const remoteTodos = JSON.parse(decrypted);
                    const oldCount = this.todos.length;
                    this.todos = remoteTodos;
                    syncTracker.success('Todos updated from remote', {
                        oldCount,
                        newCount: remoteTodos.length,
                        oldSha: oldSha ? oldSha.substring(0, 12) : null,
                        newSha: newSha.substring(0, 12)
                    });
                } else {
                    syncTracker.info('Todos unchanged (SHA match)');
                }
            } else {
                syncTracker.warning('Failed to fetch todos', { status: todosResponse.status });
            }

            if (actionsResponse.ok) {
                const data = await actionsResponse.json();
                const oldSha = this.actionsSha;
                const newSha = data.sha;

                syncTracker.info('Actions SHA comparison', {
                    localSha: oldSha ? oldSha.substring(0, 12) : null,
                    remoteSha: newSha.substring(0, 12),
                    match: oldSha === newSha
                });

                if (oldSha !== newSha) {
                    actionsChanged = true;
                    this.actionsSha = newSha;
                    const encryptedContent = atob(data.content);
                    const decrypted = await Crypto.decrypt(encryptedContent, this.encryptionPassword);
                    this.actions = JSON.parse(decrypted);
                    syncTracker.success('Actions updated from remote', {
                        actionCount: this.actions.length,
                        oldSha: oldSha ? oldSha.substring(0, 12) : null,
                        newSha: newSha.substring(0, 12)
                    });
                } else {
                    syncTracker.info('Actions unchanged (SHA match)');
                }
            } else {
                syncTracker.warning('Failed to fetch actions', { status: actionsResponse.status });
            }

            // Update SHA display
            syncTracker.updateShaDisplay(this.fileSha, this.actionsSha);

            this.renderTodos();
            this.renderActions();

            if (todosChanged || actionsChanged) {
                this.setSyncStatus('Synced - data updated', 'saved');
                syncTracker.success('Sync completed with changes', {
                    todosChanged,
                    actionsChanged
                });
            } else {
                this.setSyncStatus('Synced - no changes', 'saved');
                syncTracker.info('Sync completed - no changes detected');
            }

        } catch (error) {
            console.error('Sync error:', error);
            syncTracker.error('Sync failed', { error: error.message });
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
