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

        // Return as base64 (chunked to avoid stack overflow on large files)
        return this.uint8ArrayToBase64(combined);
    }

    static uint8ArrayToBase64(uint8Array) {
        // Process in chunks to avoid stack overflow
        const chunkSize = 0x8000; // 32KB chunks
        let result = '';
        for (let i = 0; i < uint8Array.length; i += chunkSize) {
            const chunk = uint8Array.subarray(i, i + chunkSize);
            result += String.fromCharCode.apply(null, chunk);
        }
        return btoa(result);
    }

    static base64ToUint8Array(base64) {
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    }

    static async decrypt(ciphertext, password) {
        try {
            const decoder = new TextDecoder();
            const combined = this.base64ToUint8Array(ciphertext);

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

        // Sync settings
        this.isSyncing = false;

        // Notes
        this.notes = [];
        this.notesFileSha = null;
        this.notesDataFile = 'notes.encrypted';
        this.currentTab = 'todos';
        this.editingNoteId = null;

        // Files - separate storage architecture
        this.files = []; // Index only (metadata + thumbnails, no file data)
        this.filesIndexSha = null;
        this.filesIndexFile = 'files-index.encrypted';
        this.filesDir = 'files'; // Directory for individual file blobs
        this.maxFileSize = 75 * 1024 * 1024; // 75 MB per file (100MB GitHub limit minus base64 overhead)
        this.previewingFileId = null;
        this.fileDataCache = new Map(); // Cache loaded file data

        // Debounced save
        this.saveDebounceTimer = null;
        this.saveDebounceDelay = 2000; // 2 seconds
        this.pendingSave = false;

        // Debounced notes save
        this.notesSaveDebounceTimer = null;
        this.pendingNotesSave = false;

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
        this.popupUserName = document.getElementById('popup-user-name');
        this.avatarPopup = document.getElementById('avatar-popup');
        this.logoutBtn = document.getElementById('logout-btn');
        this.newTodoInput = document.getElementById('new-todo');
        this.addBtn = document.getElementById('add-btn');
        this.todoList = document.getElementById('todo-list');
        this.itemsLeft = document.getElementById('items-left');
        this.clearCompletedBtn = document.getElementById('clear-completed');
        this.syncStatus = document.getElementById('sync-status');
        this.syncStatusBar = document.getElementById('sync-status-bar');
        this.filterBtns = document.querySelectorAll('.filter-btn');

        // Sync elements
        this.syncNowBtn = document.getElementById('sync-now-btn');

        // Tabs
        this.tabBtns = document.querySelectorAll('.tab-btn');
        this.todosSection = document.getElementById('todos-section');
        this.notesSection = document.getElementById('notes-section');

        // Notes elements
        this.newNoteTitleInput = document.getElementById('new-note-title');
        this.addNoteBtn = document.getElementById('add-note-btn');
        this.notesList = document.getElementById('notes-list');
        this.notesCount = document.getElementById('notes-count');

        // Modal elements
        this.noteModal = document.getElementById('note-modal');
        this.modalNoteTitle = document.getElementById('modal-note-title');
        this.modalNoteContent = document.getElementById('modal-note-content');
        this.closeModalBtn = document.getElementById('close-modal');
        this.copyNoteBtn = document.getElementById('copy-note-btn');
        this.saveNoteBtn = document.getElementById('save-note-btn');
        this.deleteNoteBtn = document.getElementById('delete-note-btn');

        // Files elements
        this.filesSection = document.getElementById('files-section');
        this.fileInput = document.getElementById('file-input');
        this.uploadFileBtn = document.getElementById('upload-file-btn');
        this.filesList = document.getElementById('files-list');
        this.filesCount = document.getElementById('files-count');
        this.totalSize = document.getElementById('total-size');

        // File preview modal elements
        this.filePreviewModal = document.getElementById('file-preview-modal');
        this.previewFileName = document.getElementById('preview-file-name');
        this.filePreviewBody = document.getElementById('file-preview-body');
        this.previewFileSize = document.getElementById('preview-file-size');
        this.previewFileDate = document.getElementById('preview-file-date');
        this.closeFilePreviewBtn = document.getElementById('close-file-preview');
        this.downloadFileBtn = document.getElementById('download-file-btn');
        this.deleteFileBtn = document.getElementById('delete-file-btn');

        // Reset password elements
        this.resetPasswordBtn = document.getElementById('reset-password-btn');
        this.resetPasswordModal = document.getElementById('reset-password-modal');
        this.oldPasswordInput = document.getElementById('old-password');
        this.newPasswordInput = document.getElementById('new-password');
        this.confirmNewPasswordInput = document.getElementById('confirm-new-password');
        this.resetPasswordError = document.getElementById('reset-password-error');
        this.closeResetModalBtn = document.getElementById('close-reset-modal');
        this.cancelResetBtn = document.getElementById('cancel-reset-btn');
        this.confirmResetBtn = document.getElementById('confirm-reset-btn');
    }

    bindEvents() {
        this.checkBtn.addEventListener('click', () => this.checkExistingData());
        this.loginBtn.addEventListener('click', () => this.login());
        this.changeSettingsLink.addEventListener('click', (e) => {
            e.preventDefault();
            this.showSettingsInput();
        });
        this.logoutBtn.addEventListener('click', () => this.logout());

        // Avatar popup events
        if (this.userAvatar) {
            this.userAvatar.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleAvatarPopup();
            });
        }

        // Close popup when clicking outside
        document.addEventListener('click', (e) => {
            if (this.avatarPopup && !this.avatarPopup.contains(e.target) && e.target !== this.userAvatar) {
                this.avatarPopup.classList.add('hidden');
            }
        });
        this.addBtn.addEventListener('click', () => this.addTodo());
        this.newTodoInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.addTodo();
            }
        });
        this.newTodoInput.addEventListener('input', () => this.autoExpandTextarea(this.newTodoInput));
        this.clearCompletedBtn.addEventListener('click', () => this.clearCompleted());
        this.filterBtns.forEach(btn => {
            btn.addEventListener('click', (e) => this.setFilter(e.target.dataset.filter));
        });

        // Sync events
        if (this.syncNowBtn) {
            this.syncNowBtn.addEventListener('click', () => this.manualSync());
        }

        // Tab events
        this.tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // Notes events
        if (this.addNoteBtn) {
            this.addNoteBtn.addEventListener('click', () => this.addNote());
        }
        if (this.newNoteTitleInput) {
            this.newNoteTitleInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.addNote();
                }
            });
            this.newNoteTitleInput.addEventListener('input', () => this.autoExpandTextarea(this.newNoteTitleInput));
        }

        // Modal events
        if (this.closeModalBtn) {
            this.closeModalBtn.addEventListener('click', () => this.closeNoteModal());
        }
        if (this.saveNoteBtn) {
            this.saveNoteBtn.addEventListener('click', () => this.saveNoteFromModal());
        }
        if (this.copyNoteBtn) {
            this.copyNoteBtn.addEventListener('click', () => this.copyNoteContent());
        }
        if (this.deleteNoteBtn) {
            this.deleteNoteBtn.addEventListener('click', () => this.deleteNoteFromModal());
        }
        if (this.noteModal) {
            this.noteModal.addEventListener('click', (e) => {
                if (e.target === this.noteModal) this.closeNoteModal();
            });
        }

        // File events
        if (this.uploadFileBtn) {
            this.uploadFileBtn.addEventListener('click', () => this.fileInput.click());
        }
        if (this.fileInput) {
            this.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
        }
        if (this.closeFilePreviewBtn) {
            this.closeFilePreviewBtn.addEventListener('click', () => this.closeFilePreview());
        }
        if (this.downloadFileBtn) {
            this.downloadFileBtn.addEventListener('click', () => this.downloadFile());
        }
        if (this.deleteFileBtn) {
            this.deleteFileBtn.addEventListener('click', () => this.deleteFile());
        }
        if (this.filePreviewModal) {
            this.filePreviewModal.addEventListener('click', (e) => {
                if (e.target === this.filePreviewModal) this.closeFilePreview();
            });
        }

        // Reset password events
        if (this.resetPasswordBtn) {
            this.resetPasswordBtn.addEventListener('click', () => this.openResetPasswordModal());
        }
        if (this.closeResetModalBtn) {
            this.closeResetModalBtn.addEventListener('click', () => this.closeResetPasswordModal());
        }
        if (this.cancelResetBtn) {
            this.cancelResetBtn.addEventListener('click', () => this.closeResetPasswordModal());
        }
        if (this.confirmResetBtn) {
            this.confirmResetBtn.addEventListener('click', () => this.resetPassword());
        }
        if (this.resetPasswordModal) {
            this.resetPasswordModal.addEventListener('click', (e) => {
                if (e.target === this.resetPasswordModal) this.closeResetPasswordModal();
            });
        }
    }

    toggleAvatarPopup() {
        if (this.avatarPopup) {
            this.avatarPopup.classList.toggle('hidden');
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
            if (this.popupUserName) {
                this.popupUserName.textContent = this.user.login;
            }
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
            await this.loadNotes();
            await this.loadFiles();
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
                const decrypted = await Crypto.decrypt(encryptedContent, this.encryptionPassword);
                this.todos = JSON.parse(decrypted);
            } else if (response.status === 404) {
                this.todos = [];
                this.fileSha = null;
            } else {
                throw new Error('Failed to load todos');
            }

            this.renderTodos();
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

    async saveTodos(retryCount = 0) {
        const maxRetries = 3;
        this.setSyncStatus('Checking remote state...', 'saving');
        console.log(`saveTodos called (attempt ${retryCount + 1}), local SHA: ${this.fileSha ? this.fileSha.substring(0, 8) : 'null'}`);

        try {
            // First, fetch current remote state to check for conflicts
            const remoteTodosResponse = await this.githubFetch(
                `https://api.github.com/repos/${this.repo}/contents/${this.dataFile}`
            );

            // Check for todos conflict and merge if needed
            if (remoteTodosResponse.ok) {
                const remoteData = await remoteTodosResponse.json();
                console.log(`Remote todos SHA: ${remoteData.sha.substring(0, 8)}, local: ${this.fileSha ? this.fileSha.substring(0, 8) : 'null'}`);
                if (remoteData.sha !== this.fileSha) {
                    // Remote has changed - merge todos
                    console.log('Todos conflict detected, merging...');
                    const encryptedContent = atob(remoteData.content);
                    const decrypted = await Crypto.decrypt(encryptedContent, this.encryptionPassword);
                    const remoteTodos = JSON.parse(decrypted);
                    this.todos = this.mergeTodos(remoteTodos, this.todos);
                    this.fileSha = remoteData.sha;
                }
            } else if (remoteTodosResponse.status === 404) {
                console.log('No remote todos file found');
                this.fileSha = null;
            }

            this.setSyncStatus('Encrypting & saving...', 'saving');

            // Encrypt todos
            const todosPlaintext = JSON.stringify(this.todos, null, 2);
            const todosEncrypted = await Crypto.encrypt(todosPlaintext, this.encryptionPassword);

            const todosBody = {
                message: 'Update encrypted todos',
                content: btoa(todosEncrypted)
            };
            if (this.fileSha) {
                todosBody.sha = this.fileSha;
            }

            const todosResponse = await this.githubFetch(
                `https://api.github.com/repos/${this.repo}/contents/${this.dataFile}`,
                { method: 'PUT', body: JSON.stringify(todosBody) }
            );

            if (!todosResponse.ok) {
                const error = await todosResponse.json();
                console.error('Save todos failed:', error);
                // Check if this is a SHA mismatch (409 conflict)
                if (todosResponse.status === 409 || (error.message && error.message.includes('does not match'))) {
                    if (retryCount < maxRetries) {
                        console.log(`SHA mismatch, retrying (${retryCount + 1}/${maxRetries})...`);
                        this.fileSha = null;
                        return await this.saveTodos(retryCount + 1);
                    }
                }
                throw new Error(error.message || 'Failed to save todos');
            }

            const todosData = await todosResponse.json();
            this.fileSha = todosData.content.sha;
            console.log('Todos saved successfully, new SHA:', this.fileSha.substring(0, 8));

            this.renderTodos();
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

        // Merge local todos - local changes take precedence
        for (const todo of localTodos) {
            todoMap.set(todo.id, todo);
        }

        // Convert back to array and sort by createdAt (newest first)
        const merged = Array.from(todoMap.values());
        merged.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        return merged;
    }

    async githubFetch(url, options = {}) {
        // Add cache-busting timestamp for GET requests to ensure fresh data
        let fetchUrl = url;
        if (!options.method || options.method === 'GET') {
            const separator = url.includes('?') ? '&' : '?';
            fetchUrl = `${url}${separator}_t=${Date.now()}`;
        }

        return fetch(fetchUrl, {
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
        this.syncStatus.className = 'sync-status-text';
        // Also update status bar background
        if (this.syncStatusBar) {
            this.syncStatusBar.className = 'sync-status-bar ' + className;
        }
    }

    scheduleSave() {
        // Mark pending save
        this.pendingSave = true;
        this.setSyncStatus('Changes pending...', 'pending');

        // Clear existing timer
        if (this.saveDebounceTimer) {
            clearTimeout(this.saveDebounceTimer);
        }

        // Set new timer
        this.saveDebounceTimer = setTimeout(() => {
            this.executeSave();
        }, this.saveDebounceDelay);
    }

    async executeSave() {
        if (!this.pendingSave) return;

        this.pendingSave = false;
        this.saveDebounceTimer = null;

        await this.saveTodos();
    }

    scheduleNotesSave() {
        // Mark pending save
        this.pendingNotesSave = true;
        this.setSyncStatus('Changes pending...', 'pending');

        // Clear existing timer
        if (this.notesSaveDebounceTimer) {
            clearTimeout(this.notesSaveDebounceTimer);
        }

        // Set new timer
        this.notesSaveDebounceTimer = setTimeout(() => {
            this.executeNotesSave();
        }, this.saveDebounceDelay);
    }

    async executeNotesSave() {
        if (!this.pendingNotesSave) return;

        this.pendingNotesSave = false;
        this.notesSaveDebounceTimer = null;

        await this.saveNotes();
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
        this.newTodoInput.style.height = 'auto'; // Reset height after clearing
        this.renderTodos();
        this.scheduleSave();
    }

    toggleTodo(id) {
        const todo = this.todos.find(t => t.id === id);
        if (todo) {
            todo.completed = !todo.completed;
            this.renderTodos();
            this.scheduleSave();
        }
    }

    deleteTodo(id) {
        this.todos = this.todos.filter(t => t.id !== id);
        this.renderTodos();
        this.scheduleSave();
    }

    clearCompleted() {
        const count = this.todos.filter(t => t.completed).length;
        if (count === 0) return;

        this.todos = this.todos.filter(t => !t.completed);
        this.renderTodos();
        this.scheduleSave();
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
                    <div class="todo-content">
                        <span class="todo-text">${this.escapeHtml(todo.text)}</span>
                        <span class="todo-timestamp">${this.formatDateTime(todo.createdAt)}</span>
                    </div>
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

    autoExpandTextarea(textarea) {
        if (!textarea) return;
        // Reset height to auto to get correct scrollHeight
        textarea.style.height = 'auto';
        // Set height to scrollHeight (content height)
        textarea.style.height = textarea.scrollHeight + 'px';
    }

    // Sync Methods
    async syncFromRemote() {
        if (this.isSyncing) {
            console.log('Sync already in progress, skipping');
            return;
        }

        console.log('=== Manual Sync Started ===');
        console.log('Local todos SHA:', this.fileSha ? this.fileSha.substring(0, 8) : 'null');
        console.log('Local notes SHA:', this.notesFileSha ? this.notesFileSha.substring(0, 8) : 'null');

        this.isSyncing = true;
        this.setSyncStatus('Syncing...', 'syncing');

        if (this.syncNowBtn) {
            this.syncNowBtn.classList.add('syncing');
            this.syncNowBtn.textContent = 'Syncing...';
        }

        try {
            // Fetch todos, notes, and files index in parallel
            const [todosResponse, notesResponse, filesResponse] = await Promise.all([
                this.githubFetch(`https://api.github.com/repos/${this.repo}/contents/${this.dataFile}`),
                this.githubFetch(`https://api.github.com/repos/${this.repo}/contents/${this.notesDataFile}`),
                this.githubFetch(`https://api.github.com/repos/${this.repo}/contents/${this.filesIndexFile}`)
            ]);

            let todosChanged = false;
            let notesChanged = false;
            let filesChanged = false;

            // Sync todos
            if (todosResponse.ok) {
                const data = await todosResponse.json();
                console.log('Remote todos SHA:', data.sha.substring(0, 8), '| Local:', this.fileSha ? this.fileSha.substring(0, 8) : 'null');
                if (this.fileSha !== data.sha) {
                    todosChanged = true;
                    this.fileSha = data.sha;
                    const encryptedContent = atob(data.content);
                    const decrypted = await Crypto.decrypt(encryptedContent, this.encryptionPassword);
                    this.todos = JSON.parse(decrypted);
                    console.log('✓ Todos updated from remote');
                } else {
                    console.log('Todos SHA match, no update needed');
                }
            } else if (todosResponse.status === 404) {
                console.log('No remote todos file (404)');
            } else {
                console.log('Todos fetch failed:', todosResponse.status);
            }

            // Sync notes
            if (notesResponse.ok) {
                const data = await notesResponse.json();
                console.log('Remote notes SHA:', data.sha.substring(0, 8), '| Local:', this.notesFileSha ? this.notesFileSha.substring(0, 8) : 'null');
                if (this.notesFileSha !== data.sha) {
                    notesChanged = true;
                    this.notesFileSha = data.sha;
                    const encryptedContent = atob(data.content);
                    const decrypted = await Crypto.decrypt(encryptedContent, this.encryptionPassword);
                    this.notes = JSON.parse(decrypted);
                    console.log('✓ Notes updated from remote');
                } else {
                    console.log('Notes SHA match, no update needed');
                }
            } else if (notesResponse.status === 404) {
                console.log('No remote notes file (404)');
            } else {
                console.log('Notes fetch failed:', notesResponse.status);
            }

            // Sync files index
            if (filesResponse.ok) {
                const data = await filesResponse.json();
                console.log('Remote files index SHA:', data.sha.substring(0, 8), '| Local:', this.filesIndexSha ? this.filesIndexSha.substring(0, 8) : 'null');
                if (this.filesIndexSha !== data.sha) {
                    filesChanged = true;
                    this.filesIndexSha = data.sha;
                    const encryptedContent = atob(data.content);
                    const decrypted = await Crypto.decrypt(encryptedContent, this.encryptionPassword);
                    this.files = JSON.parse(decrypted);
                    // Clear the data cache since index changed
                    this.fileDataCache.clear();
                    console.log('✓ Files index updated from remote');
                } else {
                    console.log('Files index SHA match, no update needed');
                }
            } else if (filesResponse.status === 404) {
                console.log('No remote files index (404)');
            } else {
                console.log('Files index fetch failed:', filesResponse.status);
            }

            this.renderTodos();
            this.renderNotes();
            this.renderFiles();

            const changes = [];
            if (todosChanged) changes.push('todos');
            if (notesChanged) changes.push('notes');
            if (filesChanged) changes.push('files');

            if (changes.length > 0) {
                console.log('=== Sync Complete: ' + changes.join(' & ') + ' updated ===');
                this.setSyncStatus(`Synced - ${changes.join(' & ')} updated`, 'saved');
            } else {
                console.log('=== Sync Complete: no changes ===');
                this.setSyncStatus('Synced - no changes', 'saved');
            }

        } catch (error) {
            console.error('=== Sync Failed ===', error);
            this.setSyncStatus('Sync failed: ' + error.message, 'error');
        } finally {
            this.isSyncing = false;
            if (this.syncNowBtn) {
                this.syncNowBtn.classList.remove('syncing');
                this.syncNowBtn.textContent = 'Sync';
            }
        }
    }

    async manualSync() {
        await this.syncFromRemote();
    }

    // Tab switching
    switchTab(tab) {
        this.currentTab = tab;
        this.tabBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        if (this.todosSection) this.todosSection.classList.toggle('hidden', tab !== 'todos');
        if (this.notesSection) this.notesSection.classList.toggle('hidden', tab !== 'notes');
        if (this.filesSection) this.filesSection.classList.toggle('hidden', tab !== 'files');
    }

    // Notes methods
    async loadNotes() {
        try {
            const response = await this.githubFetch(
                `https://api.github.com/repos/${this.repo}/contents/${this.notesDataFile}`
            );

            if (response.ok) {
                const data = await response.json();
                this.notesFileSha = data.sha;
                const encryptedContent = atob(data.content);
                const decrypted = await Crypto.decrypt(encryptedContent, this.encryptionPassword);
                this.notes = JSON.parse(decrypted);
            } else if (response.status === 404) {
                this.notes = [];
                this.notesFileSha = null;
            } else {
                throw new Error('Failed to load notes');
            }

            this.renderNotes();
        } catch (error) {
            console.error('Load notes error:', error);
            if (error.message.includes('Decryption failed')) {
                throw error;
            }
            this.notes = [];
            this.renderNotes();
        }
    }

    async saveNotes(retryCount = 0) {
        const maxRetries = 3;
        this.setSyncStatus('Saving notes...', 'saving');

        try {
            // First, fetch current remote state to check for conflicts
            const remoteResponse = await this.githubFetch(
                `https://api.github.com/repos/${this.repo}/contents/${this.notesDataFile}`
            );

            // Check for conflict and merge if needed
            if (remoteResponse.ok) {
                const remoteData = await remoteResponse.json();
                if (remoteData.sha !== this.notesFileSha) {
                    // Remote has changed - merge notes
                    console.log('Notes conflict detected, merging...');
                    const encryptedContent = atob(remoteData.content);
                    const decrypted = await Crypto.decrypt(encryptedContent, this.encryptionPassword);
                    const remoteNotes = JSON.parse(decrypted);
                    this.notes = this.mergeNotes(remoteNotes, this.notes);
                    this.notesFileSha = remoteData.sha;
                }
            } else if (remoteResponse.status === 404) {
                this.notesFileSha = null;
            }

            // Encrypt and save
            const plaintext = JSON.stringify(this.notes, null, 2);
            const encrypted = await Crypto.encrypt(plaintext, this.encryptionPassword);

            const body = {
                message: 'Update encrypted notes',
                content: btoa(encrypted)
            };

            if (this.notesFileSha) {
                body.sha = this.notesFileSha;
            }

            const response = await this.githubFetch(
                `https://api.github.com/repos/${this.repo}/contents/${this.notesDataFile}`,
                { method: 'PUT', body: JSON.stringify(body) }
            );

            if (!response.ok) {
                const error = await response.json();
                // Check if this is a SHA mismatch (409 conflict)
                if (response.status === 409 || (error.message && error.message.includes('does not match'))) {
                    if (retryCount < maxRetries) {
                        console.log(`Notes SHA mismatch, retrying (${retryCount + 1}/${maxRetries})...`);
                        this.notesFileSha = null;
                        return await this.saveNotes(retryCount + 1);
                    }
                }
                throw new Error(error.message || 'Failed to save notes');
            }

            const data = await response.json();
            this.notesFileSha = data.content.sha;
            console.log('Notes saved, new SHA:', this.notesFileSha.substring(0, 8));
            this.renderNotes();
            this.setSyncStatus('Saved', 'saved');
        } catch (error) {
            console.error('Save notes error:', error);
            this.setSyncStatus('Failed to save notes: ' + error.message, 'error');
        }
    }

    mergeNotes(remoteNotes, localNotes) {
        // Create a map of all notes by ID
        const noteMap = new Map();

        // Add remote notes first
        for (const note of remoteNotes) {
            noteMap.set(note.id, note);
        }

        // Merge local notes - local changes take precedence for same ID
        // But use updatedAt to determine which version is newer
        for (const note of localNotes) {
            const existing = noteMap.get(note.id);
            if (existing) {
                // Keep the newer version
                if (new Date(note.updatedAt) > new Date(existing.updatedAt)) {
                    noteMap.set(note.id, note);
                }
            } else {
                noteMap.set(note.id, note);
            }
        }

        // Convert back to array and sort by updatedAt (newest first)
        const merged = Array.from(noteMap.values());
        merged.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        console.log(`Notes merged: ${remoteNotes.length} remote + ${localNotes.length} local = ${merged.length} total`);
        return merged;
    }

    addNote() {
        const title = this.newNoteTitleInput.value.trim();
        if (!title) return;

        const note = {
            id: Date.now().toString(),
            title: title,
            content: '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this.notes.unshift(note);
        this.newNoteTitleInput.value = '';
        this.newNoteTitleInput.style.height = 'auto'; // Reset height after clearing
        this.renderNotes();
        this.scheduleNotesSave();

        // Open the new note in modal
        this.openNoteModal(note.id);
    }

    openNoteModal(id) {
        const note = this.notes.find(n => n.id === id);
        if (!note) return;

        this.editingNoteId = id;
        if (this.modalNoteTitle) this.modalNoteTitle.value = note.title;
        if (this.modalNoteContent) this.modalNoteContent.value = note.content;
        if (this.noteModal) this.noteModal.classList.remove('hidden');
        if (this.modalNoteContent) this.modalNoteContent.focus();

        // Handle visual viewport changes (mobile keyboard)
        this.setupVisualViewportHandler();
    }

    closeNoteModal() {
        if (this.noteModal) this.noteModal.classList.add('hidden');
        this.editingNoteId = null;
        this.removeVisualViewportHandler();
    }

    setupVisualViewportHandler() {
        if (window.visualViewport && !this.viewportHandler) {
            this.viewportHandler = () => {
                if (this.noteModal && !this.noteModal.classList.contains('hidden')) {
                    const viewport = window.visualViewport;
                    this.noteModal.style.height = `${viewport.height}px`;
                    this.noteModal.style.top = `${viewport.offsetTop}px`;
                }
            };
            window.visualViewport.addEventListener('resize', this.viewportHandler);
            window.visualViewport.addEventListener('scroll', this.viewportHandler);
            this.viewportHandler(); // Initial call
        }
    }

    removeVisualViewportHandler() {
        if (window.visualViewport && this.viewportHandler) {
            window.visualViewport.removeEventListener('resize', this.viewportHandler);
            window.visualViewport.removeEventListener('scroll', this.viewportHandler);
            this.viewportHandler = null;
            // Reset modal styles
            if (this.noteModal) {
                this.noteModal.style.height = '';
                this.noteModal.style.top = '';
            }
        }
    }

    saveNoteFromModal() {
        if (!this.editingNoteId) return;

        const note = this.notes.find(n => n.id === this.editingNoteId);
        if (!note) return;

        note.title = (this.modalNoteTitle ? this.modalNoteTitle.value.trim() : '') || 'Untitled';
        note.content = this.modalNoteContent ? this.modalNoteContent.value : '';
        note.updatedAt = new Date().toISOString();

        this.renderNotes();
        this.scheduleNotesSave();
        this.closeNoteModal();
    }

    async copyNoteContent() {
        const content = this.modalNoteContent ? this.modalNoteContent.value : '';
        try {
            await navigator.clipboard.writeText(content);
            if (this.copyNoteBtn) {
                this.copyNoteBtn.textContent = 'Copied!';
                this.copyNoteBtn.classList.add('copied');
                setTimeout(() => {
                    this.copyNoteBtn.textContent = 'Copy';
                    this.copyNoteBtn.classList.remove('copied');
                }, 2000);
            }
        } catch (error) {
            console.error('Copy failed:', error);
        }
    }

    deleteNoteFromModal() {
        if (!this.editingNoteId) return;

        this.notes = this.notes.filter(n => n.id !== this.editingNoteId);
        this.renderNotes();
        this.scheduleNotesSave();
        this.closeNoteModal();
    }

    renderNotes() {
        if (!this.notesList) return;

        if (this.notes.length === 0) {
            this.notesList.innerHTML = `
                <li class="empty-state">
                    No notes yet. Add one above!
                </li>
            `;
        } else {
            this.notesList.innerHTML = this.notes.map(note => `
                <li class="note-item" data-id="${note.id}">
                    <svg class="note-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                    </svg>
                    <div class="note-info">
                        <div class="note-title">${this.escapeHtml(note.title)}</div>
                        <div class="note-preview">${this.escapeHtml(note.content.substring(0, 50)) || 'No content'}</div>
                    </div>
                    <span class="note-date">${this.formatDateTime(note.createdAt)}</span>
                </li>
            `).join('');

            this.notesList.querySelectorAll('.note-item').forEach(item => {
                const id = item.dataset.id;
                item.addEventListener('click', () => this.openNoteModal(id));
            });
        }

        if (this.notesCount) {
            this.notesCount.textContent = `${this.notes.length} note${this.notes.length !== 1 ? 's' : ''}`;
        }
    }

    // Files methods - Separate storage architecture
    // Index file contains metadata only, each file stored as separate blob

    async loadFiles() {
        try {
            const response = await this.githubFetch(
                `https://api.github.com/repos/${this.repo}/contents/${this.filesIndexFile}`
            );

            if (response.ok) {
                const data = await response.json();
                this.filesIndexSha = data.sha;
                const encryptedContent = atob(data.content);
                const decrypted = await Crypto.decrypt(encryptedContent, this.encryptionPassword);
                this.files = JSON.parse(decrypted);
            } else if (response.status === 404) {
                this.files = [];
                this.filesIndexSha = null;
            } else {
                throw new Error('Failed to load files index');
            }

            // Clear the data cache
            this.fileDataCache.clear();
            this.renderFiles();
        } catch (error) {
            console.error('Load files error:', error);
            if (error.message.includes('Decryption failed')) {
                throw error;
            }
            this.files = [];
            this.renderFiles();
        }
    }

    async saveFilesIndex(retryCount = 0) {
        const maxRetries = 3;

        try {
            // Check for conflicts
            const remoteResponse = await this.githubFetch(
                `https://api.github.com/repos/${this.repo}/contents/${this.filesIndexFile}`
            );

            if (remoteResponse.ok) {
                const remoteData = await remoteResponse.json();
                if (remoteData.sha !== this.filesIndexSha) {
                    console.log('Files index conflict detected, merging...');
                    const encryptedContent = atob(remoteData.content);
                    const decrypted = await Crypto.decrypt(encryptedContent, this.encryptionPassword);
                    const remoteFiles = JSON.parse(decrypted);
                    this.files = this.mergeFiles(remoteFiles, this.files);
                    this.filesIndexSha = remoteData.sha;
                }
            } else if (remoteResponse.status === 404) {
                this.filesIndexSha = null;
            }

            // Save the index (metadata only, no file data)
            const plaintext = JSON.stringify(this.files, null, 2);
            const encrypted = await Crypto.encrypt(plaintext, this.encryptionPassword);

            const body = {
                message: 'Update files index',
                content: btoa(encrypted)
            };

            if (this.filesIndexSha) {
                body.sha = this.filesIndexSha;
            }

            const response = await this.githubFetch(
                `https://api.github.com/repos/${this.repo}/contents/${this.filesIndexFile}`,
                { method: 'PUT', body: JSON.stringify(body) }
            );

            if (!response.ok) {
                const error = await response.json();
                if (response.status === 409 || (error.message && error.message.includes('does not match'))) {
                    if (retryCount < maxRetries) {
                        console.log(`Files index SHA mismatch, retrying (${retryCount + 1}/${maxRetries})...`);
                        this.filesIndexSha = null;
                        return await this.saveFilesIndex(retryCount + 1);
                    }
                }
                throw new Error(error.message || 'Failed to save files index');
            }

            const data = await response.json();
            this.filesIndexSha = data.content.sha;
            console.log('Files index saved, SHA:', this.filesIndexSha.substring(0, 8));
        } catch (error) {
            console.error('Save files index error:', error);
            throw error;
        }
    }

    // Save individual file data as a separate encrypted blob
    async saveFileBlob(fileId, fileData) {
        this.setSyncStatus('Uploading file...', 'saving');

        try {
            // Encrypt the file data
            const encrypted = await Crypto.encrypt(fileData, this.encryptionPassword);
            const base64Content = btoa(encrypted);
            const filePath = `${this.filesDir}/${fileId}.encrypted`;

            // Check if we need Git Blobs API for large files
            if (base64Content.length > 1024 * 1024) {
                console.log('Large file, using Git Blobs API...');
                await this.saveFileBlobViaGitApi(filePath, encrypted);
            } else {
                // Use Contents API for smaller files
                const body = {
                    message: `Add encrypted file ${fileId}`,
                    content: base64Content
                };

                const response = await this.githubFetch(
                    `https://api.github.com/repos/${this.repo}/contents/${filePath}`,
                    { method: 'PUT', body: JSON.stringify(body) }
                );

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.message || 'Failed to save file');
                }
            }

            console.log('File blob saved:', fileId);
        } catch (error) {
            console.error('Save file blob error:', error);
            throw error;
        }
    }

    // Save large file using Git Data API
    async saveFileBlobViaGitApi(filePath, encryptedContent) {
        const base64Content = btoa(encryptedContent);

        // Step 1: Create a blob
        const blobResponse = await this.githubFetch(
            `https://api.github.com/repos/${this.repo}/git/blobs`,
            {
                method: 'POST',
                body: JSON.stringify({
                    content: base64Content,
                    encoding: 'base64'
                })
            }
        );

        if (!blobResponse.ok) {
            const error = await blobResponse.json();
            throw new Error('Failed to create blob: ' + (error.message || 'Unknown error'));
        }

        const blobData = await blobResponse.json();
        const blobSha = blobData.sha;

        // Step 2: Get current commit
        const refResponse = await this.githubFetch(
            `https://api.github.com/repos/${this.repo}/git/ref/heads/main`
        );

        let currentCommitSha, branchName = 'main';
        if (refResponse.ok) {
            const refData = await refResponse.json();
            currentCommitSha = refData.object.sha;
        } else {
            const masterRefResponse = await this.githubFetch(
                `https://api.github.com/repos/${this.repo}/git/ref/heads/master`
            );
            if (masterRefResponse.ok) {
                const refData = await masterRefResponse.json();
                currentCommitSha = refData.object.sha;
                branchName = 'master';
            } else {
                throw new Error('Could not find main or master branch');
            }
        }

        // Step 3: Get current tree
        const commitResponse = await this.githubFetch(
            `https://api.github.com/repos/${this.repo}/git/commits/${currentCommitSha}`
        );
        const commitData = await commitResponse.json();
        const baseTreeSha = commitData.tree.sha;

        // Step 4: Create new tree
        const treeResponse = await this.githubFetch(
            `https://api.github.com/repos/${this.repo}/git/trees`,
            {
                method: 'POST',
                body: JSON.stringify({
                    base_tree: baseTreeSha,
                    tree: [{
                        path: filePath,
                        mode: '100644',
                        type: 'blob',
                        sha: blobSha
                    }]
                })
            }
        );
        const treeData = await treeResponse.json();

        // Step 5: Create commit
        const newCommitResponse = await this.githubFetch(
            `https://api.github.com/repos/${this.repo}/git/commits`,
            {
                method: 'POST',
                body: JSON.stringify({
                    message: `Add encrypted file`,
                    tree: treeData.sha,
                    parents: [currentCommitSha]
                })
            }
        );
        const newCommitData = await newCommitResponse.json();

        // Step 6: Update ref
        await this.githubFetch(
            `https://api.github.com/repos/${this.repo}/git/refs/heads/${branchName}`,
            {
                method: 'PATCH',
                body: JSON.stringify({ sha: newCommitData.sha })
            }
        );
    }

    // Load file data on demand
    async loadFileData(fileId) {
        // Check cache first
        if (this.fileDataCache.has(fileId)) {
            return this.fileDataCache.get(fileId);
        }

        const filePath = `${this.filesDir}/${fileId}.encrypted`;

        try {
            const response = await this.githubFetch(
                `https://api.github.com/repos/${this.repo}/contents/${filePath}`
            );

            if (!response.ok) {
                throw new Error('File not found');
            }

            const data = await response.json();
            let encryptedContent;

            if (data.content) {
                encryptedContent = atob(data.content);
            } else if (data.sha) {
                // Large file - fetch via Blobs API
                const blobResponse = await this.githubFetch(
                    `https://api.github.com/repos/${this.repo}/git/blobs/${data.sha}`
                );
                if (blobResponse.ok) {
                    const blobData = await blobResponse.json();
                    encryptedContent = atob(blobData.content);
                }
            }

            if (encryptedContent) {
                const decrypted = await Crypto.decrypt(encryptedContent, this.encryptionPassword);
                // Cache it
                this.fileDataCache.set(fileId, decrypted);
                return decrypted;
            }

            throw new Error('Could not load file data');
        } catch (error) {
            console.error('Load file data error:', error);
            throw error;
        }
    }

    // Delete file blob from repo
    async deleteFileBlob(fileId) {
        const filePath = `${this.filesDir}/${fileId}.encrypted`;

        try {
            // Get current file SHA
            const response = await this.githubFetch(
                `https://api.github.com/repos/${this.repo}/contents/${filePath}`
            );

            if (response.ok) {
                const data = await response.json();

                const deleteResponse = await this.githubFetch(
                    `https://api.github.com/repos/${this.repo}/contents/${filePath}`,
                    {
                        method: 'DELETE',
                        body: JSON.stringify({
                            message: `Delete encrypted file ${fileId}`,
                            sha: data.sha
                        })
                    }
                );

                if (!deleteResponse.ok) {
                    console.warn('Failed to delete file blob:', fileId);
                }
            }

            // Remove from cache
            this.fileDataCache.delete(fileId);
        } catch (error) {
            console.warn('Delete file blob error:', error);
        }
    }

    mergeFiles(remoteFiles, localFiles) {
        const fileMap = new Map();

        for (const file of remoteFiles) {
            fileMap.set(file.id, file);
        }

        for (const file of localFiles) {
            fileMap.set(file.id, file);
        }

        const merged = Array.from(fileMap.values());
        merged.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        return merged;
    }

    async handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Reset input
        this.fileInput.value = '';

        // Check file size
        if (file.size > this.maxFileSize) {
            alert(`File too large. Maximum size per file is ${this.formatFileSize(this.maxFileSize)}`);
            return;
        }

        this.setSyncStatus('Uploading file...', 'saving');

        try {
            // Read file as base64
            const base64Data = await this.readFileAsBase64(file);

            // Create thumbnail for images
            let thumbnail = null;
            if (file.type.startsWith('image/')) {
                thumbnail = await this.createThumbnail(base64Data, file.type);
            }

            const fileId = Date.now().toString();

            // Create file record (metadata only, no data)
            const fileRecord = {
                id: fileId,
                name: file.name,
                type: file.type,
                size: file.size,
                createdAt: new Date().toISOString(),
                thumbnail: thumbnail
                // Note: 'data' is NOT stored in index, it's stored separately
            };

            // Save the file blob first
            await this.saveFileBlob(fileId, base64Data);

            // Cache the data locally
            this.fileDataCache.set(fileId, base64Data);

            // Add to index and save
            this.files.unshift(fileRecord);
            this.renderFiles();
            await this.saveFilesIndex();

            this.setSyncStatus('Saved', 'saved');
        } catch (error) {
            console.error('Upload error:', error);
            this.setSyncStatus('Upload failed: ' + error.message, 'error');
        }
    }

    readFileAsBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                // Remove the data URL prefix to get just the base64
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    createThumbnail(base64Data, mimeType) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const maxSize = 150;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxSize) {
                        height = (height * maxSize) / width;
                        width = maxSize;
                    }
                } else {
                    if (height > maxSize) {
                        width = (width * maxSize) / height;
                        height = maxSize;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Get thumbnail as base64 (JPEG for smaller size)
                const thumbnailData = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
                resolve(thumbnailData);
            };
            img.onerror = () => resolve(null);
            img.src = `data:${mimeType};base64,${base64Data}`;
        });
    }

    async openFilePreview(id) {
        const file = this.files.find(f => f.id === id);
        if (!file) return;

        this.previewingFileId = id;

        if (this.previewFileName) this.previewFileName.textContent = file.name;
        if (this.previewFileSize) this.previewFileSize.textContent = this.formatFileSize(file.size);
        if (this.previewFileDate) this.previewFileDate.textContent = this.formatDateTime(file.createdAt);

        // Show preview
        if (this.filePreviewBody) {
            if (file.type.startsWith('image/')) {
                // For images, load the full data
                this.filePreviewBody.innerHTML = '<div class="loading">Loading...</div>';
                try {
                    const fileData = await this.loadFileData(id);
                    this.filePreviewBody.innerHTML = `<img src="data:${file.type};base64,${fileData}" alt="${this.escapeHtml(file.name)}">`;
                } catch (error) {
                    this.filePreviewBody.innerHTML = `<div class="error">Failed to load image</div>`;
                }
            } else if (file.type === 'application/pdf') {
                // For PDFs, use browser's built-in PDF viewer in fullscreen
                this.filePreviewBody.innerHTML = '<div class="loading">Loading PDF...</div>';
                if (this.filePreviewModal) this.filePreviewModal.classList.add('pdf-fullscreen');
                try {
                    const fileData = await this.loadFileData(id);
                    const blob = this.base64ToBlob(fileData, 'application/pdf');
                    const blobUrl = URL.createObjectURL(blob);

                    // Check if mobile (Android/iOS) - they don't support inline PDF viewing
                    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

                    if (isMobile) {
                        // On mobile, show open button instead of iframe
                        this.filePreviewBody.innerHTML = `
                            <div class="pdf-mobile-fallback">
                                <div class="pdf-icon">📄</div>
                                <p>${this.escapeHtml(file.name)}</p>
                                <a href="${blobUrl}" target="_blank" class="btn primary">Open PDF</a>
                            </div>
                        `;
                    } else {
                        this.filePreviewBody.innerHTML = `<iframe src="${blobUrl}" class="pdf-viewer"></iframe>`;
                    }
                    // Store URL for cleanup
                    this.filePreviewBody.dataset.blobUrl = blobUrl;
                } catch (error) {
                    this.filePreviewBody.innerHTML = `<div class="error">Failed to load PDF</div>`;
                }
            } else {
                this.filePreviewBody.innerHTML = `<div class="file-icon-large">${this.getFileIcon(file.type)}</div>`;
            }
        }

        if (this.filePreviewModal) this.filePreviewModal.classList.remove('hidden');
    }

    closeFilePreview() {
        // Clean up blob URL if exists
        if (this.filePreviewBody && this.filePreviewBody.dataset.blobUrl) {
            URL.revokeObjectURL(this.filePreviewBody.dataset.blobUrl);
            delete this.filePreviewBody.dataset.blobUrl;
        }
        if (this.filePreviewModal) {
            this.filePreviewModal.classList.add('hidden');
            this.filePreviewModal.classList.remove('pdf-fullscreen');
        }
        this.previewingFileId = null;
    }

    async downloadFile() {
        if (!this.previewingFileId) return;
        const file = this.files.find(f => f.id === this.previewingFileId);
        if (!file) return;

        try {
            this.setSyncStatus('Downloading...', 'saving');
            const fileData = await this.loadFileData(this.previewingFileId);

            const link = document.createElement('a');
            link.href = `data:${file.type};base64,${fileData}`;
            link.download = file.name;
            link.click();

            this.setSyncStatus('Downloaded', 'saved');
        } catch (error) {
            console.error('Download error:', error);
            this.setSyncStatus('Download failed', 'error');
        }
    }

    async downloadFileById(id) {
        const file = this.files.find(f => f.id === id);
        if (!file) return;

        try {
            this.setSyncStatus('Downloading...', 'saving');
            const fileData = await this.loadFileData(id);

            const link = document.createElement('a');
            link.href = `data:${file.type};base64,${fileData}`;
            link.download = file.name;
            link.click();

            this.setSyncStatus('Downloaded', 'saved');
        } catch (error) {
            console.error('Download error:', error);
            this.setSyncStatus('Download failed', 'error');
        }
    }

    async deleteFile() {
        if (!this.previewingFileId) return;

        if (!confirm('Delete this file?')) return;

        const fileId = this.previewingFileId;

        this.setSyncStatus('Deleting...', 'saving');

        try {
            // Delete the file blob from repo
            await this.deleteFileBlob(fileId);

            // Remove from index
            this.files = this.files.filter(f => f.id !== fileId);
            this.closeFilePreview();
            this.renderFiles();

            // Save updated index
            await this.saveFilesIndex();

            this.setSyncStatus('Deleted', 'saved');
        } catch (error) {
            console.error('Delete error:', error);
            this.setSyncStatus('Delete failed: ' + error.message, 'error');
        }
    }

    renderFiles() {
        if (!this.filesList) return;

        if (this.files.length === 0) {
            this.filesList.innerHTML = `
                <div class="empty-state" style="grid-column: 1/-1;">
                    No files yet. Upload one above!
                </div>
            `;
        } else {
            this.filesList.innerHTML = this.files.map(file => `
                <div class="file-item" data-id="${file.id}">
                    <div class="file-thumbnail">
                        ${file.thumbnail
                            ? `<img src="data:image/jpeg;base64,${file.thumbnail}" alt="">`
                            : `<span class="file-icon">${this.getFileIcon(file.type)}</span>`
                        }
                    </div>
                    <div class="file-name">${this.escapeHtml(file.name)}</div>
                    <div class="file-meta">${this.formatFileSize(file.size)}</div>
                    <div class="file-actions">
                        <button class="file-action-btn preview-btn" title="Preview">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                        </button>
                        <button class="file-action-btn download-btn" title="Download">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                        </button>
                    </div>
                </div>
            `).join('');

            this.filesList.querySelectorAll('.file-item').forEach(item => {
                const id = item.dataset.id;
                item.querySelector('.preview-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.openFilePreview(id);
                });
                item.querySelector('.download-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.downloadFileById(id);
                });
            });
        }

        // Update footer
        if (this.filesCount) {
            this.filesCount.textContent = `${this.files.length} file${this.files.length !== 1 ? 's' : ''}`;
        }
        if (this.totalSize) {
            const total = this.files.reduce((sum, f) => sum + f.size, 0);
            this.totalSize.textContent = `${this.formatFileSize(total)} used`;
        }
    }

    getFileIcon(mimeType) {
        if (mimeType.startsWith('image/')) return '🖼️';
        if (mimeType.startsWith('video/')) return '🎬';
        if (mimeType.startsWith('audio/')) return '🎵';
        if (mimeType.includes('pdf')) return '📄';
        if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
        if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊';
        if (mimeType.includes('zip') || mimeType.includes('archive')) return '📦';
        if (mimeType.includes('text')) return '📃';
        return '📁';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    formatDate(isoString) {
        const date = new Date(isoString);
        const now = new Date();
        const diff = now - date;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (days === 0) return 'Today';
        if (days === 1) return 'Yesterday';
        if (days < 7) return `${days} days ago`;
        return date.toLocaleDateString();
    }

    formatDateTime(isoString) {
        if (!isoString) return '';
        const date = new Date(isoString);
        const now = new Date();
        const diff = now - date;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (days === 0) {
            return `Today ${timeStr}`;
        } else if (days === 1) {
            return `Yesterday ${timeStr}`;
        } else if (days < 7) {
            return `${days}d ago ${timeStr}`;
        } else {
            const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
            return `${dateStr} ${timeStr}`;
        }
    }

    base64ToBlob(base64, mimeType) {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: mimeType });
    }

    // Reset Password Methods
    openResetPasswordModal() {
        // Close avatar popup
        if (this.avatarPopup) {
            this.avatarPopup.classList.add('hidden');
        }
        // Clear form
        if (this.oldPasswordInput) this.oldPasswordInput.value = '';
        if (this.newPasswordInput) this.newPasswordInput.value = '';
        if (this.confirmNewPasswordInput) this.confirmNewPasswordInput.value = '';
        if (this.resetPasswordError) this.resetPasswordError.textContent = '';
        // Show modal
        if (this.resetPasswordModal) {
            this.resetPasswordModal.classList.remove('hidden');
        }
    }

    closeResetPasswordModal() {
        if (this.resetPasswordModal) {
            this.resetPasswordModal.classList.add('hidden');
        }
    }

    async resetPassword() {
        const oldPassword = this.oldPasswordInput ? this.oldPasswordInput.value : '';
        const newPassword = this.newPasswordInput ? this.newPasswordInput.value : '';
        const confirmPassword = this.confirmNewPasswordInput ? this.confirmNewPasswordInput.value : '';

        // Validate inputs
        if (!oldPassword) {
            this.showResetPasswordError('Please enter your current password');
            return;
        }

        if (oldPassword !== this.encryptionPassword) {
            this.showResetPasswordError('Current password is incorrect');
            return;
        }

        if (!newPassword) {
            this.showResetPasswordError('Please enter a new password');
            return;
        }

        if (newPassword.length < 8) {
            this.showResetPasswordError('New password must be at least 8 characters');
            return;
        }

        if (newPassword !== confirmPassword) {
            this.showResetPasswordError('New passwords do not match');
            return;
        }

        if (newPassword === oldPassword) {
            this.showResetPasswordError('New password must be different from current password');
            return;
        }

        // Disable button during processing
        if (this.confirmResetBtn) {
            this.confirmResetBtn.disabled = true;
            this.confirmResetBtn.textContent = 'Resetting...';
        }

        try {
            // Re-encrypt and save todos with new password
            if (this.todos.length > 0 || this.fileSha) {
                const todosPlaintext = JSON.stringify(this.todos, null, 2);
                const todosEncrypted = await Crypto.encrypt(todosPlaintext, newPassword);

                const todosBody = {
                    message: 'Re-encrypt todos with new password',
                    content: btoa(todosEncrypted)
                };
                if (this.fileSha) {
                    todosBody.sha = this.fileSha;
                }

                const todosResponse = await this.githubFetch(
                    `https://api.github.com/repos/${this.repo}/contents/${this.dataFile}`,
                    { method: 'PUT', body: JSON.stringify(todosBody) }
                );

                if (!todosResponse.ok) {
                    const error = await todosResponse.json();
                    throw new Error('Failed to save todos: ' + (error.message || 'Unknown error'));
                }
            }

            // Re-encrypt and save notes with new password
            if (this.notes.length > 0 || this.notesFileSha) {
                const notesPlaintext = JSON.stringify(this.notes, null, 2);
                const notesEncrypted = await Crypto.encrypt(notesPlaintext, newPassword);

                const notesBody = {
                    message: 'Re-encrypt notes with new password',
                    content: btoa(notesEncrypted)
                };
                if (this.notesFileSha) {
                    notesBody.sha = this.notesFileSha;
                }

                const notesResponse = await this.githubFetch(
                    `https://api.github.com/repos/${this.repo}/contents/${this.notesDataFile}`,
                    { method: 'PUT', body: JSON.stringify(notesBody) }
                );

                if (!notesResponse.ok) {
                    const error = await notesResponse.json();
                    throw new Error('Failed to save notes: ' + (error.message || 'Unknown error'));
                }
            }

            // Re-encrypt and save files with new password
            if (this.files.length > 0 || this.filesIndexSha) {
                // Re-encrypt the files index
                const filesIndexPlaintext = JSON.stringify(this.files, null, 2);
                const filesIndexEncrypted = await Crypto.encrypt(filesIndexPlaintext, newPassword);

                const filesIndexBody = {
                    message: 'Re-encrypt files index with new password',
                    content: btoa(filesIndexEncrypted)
                };
                if (this.filesIndexSha) {
                    filesIndexBody.sha = this.filesIndexSha;
                }

                const filesIndexResponse = await this.githubFetch(
                    `https://api.github.com/repos/${this.repo}/contents/${this.filesIndexFile}`,
                    { method: 'PUT', body: JSON.stringify(filesIndexBody) }
                );

                if (!filesIndexResponse.ok) {
                    const error = await filesIndexResponse.json();
                    throw new Error('Failed to save files index: ' + (error.message || 'Unknown error'));
                }

                // Re-encrypt each individual file blob
                for (const file of this.files) {
                    try {
                        // Load file data (uses cache if available)
                        const fileData = await this.loadFileData(file.id);
                        const filePath = `${this.filesDir}/${file.id}.encrypted`;

                        // Get current file SHA
                        const currentFileResponse = await this.githubFetch(
                            `https://api.github.com/repos/${this.repo}/contents/${filePath}`
                        );

                        if (currentFileResponse.ok) {
                            const currentFileData = await currentFileResponse.json();

                            // Re-encrypt with new password
                            const reEncrypted = await Crypto.encrypt(fileData, newPassword);

                            const fileBody = {
                                message: `Re-encrypt file ${file.id} with new password`,
                                content: btoa(reEncrypted),
                                sha: currentFileData.sha
                            };

                            const saveResponse = await this.githubFetch(
                                `https://api.github.com/repos/${this.repo}/contents/${filePath}`,
                                { method: 'PUT', body: JSON.stringify(fileBody) }
                            );

                            if (!saveResponse.ok) {
                                console.warn(`Failed to re-encrypt file ${file.id}`);
                            }
                        }
                    } catch (fileError) {
                        console.warn(`Error re-encrypting file ${file.id}:`, fileError);
                    }
                }
            }

            // Success - close modal and logout
            this.closeResetPasswordModal();
            alert('Password reset successful! Please sign in with your new password.');
            this.logout();

        } catch (error) {
            console.error('Reset password error:', error);
            this.showResetPasswordError(error.message);
        } finally {
            if (this.confirmResetBtn) {
                this.confirmResetBtn.disabled = false;
                this.confirmResetBtn.textContent = 'Reset Password';
            }
        }
    }

    showResetPasswordError(message) {
        if (this.resetPasswordError) {
            this.resetPasswordError.textContent = message;
        }
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
        // Clear notes
        this.notes = [];
        this.notesFileSha = null;
        this.currentTab = 'todos';
        this.editingNoteId = null;
        // Clear files
        this.files = [];
        this.filesIndexSha = null;
        this.previewingFileId = null;
        this.fileDataCache.clear();
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
