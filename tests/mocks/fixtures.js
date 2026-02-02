/**
 * Mock fixtures for GitHub API responses
 */

const MOCK_USER = {
    login: 'testuser',
    id: 12345,
    avatar_url: 'https://avatars.githubusercontent.com/u/12345?v=4',
    name: 'Test User',
    email: 'test@example.com'
};

const MOCK_REPO = {
    id: 67890,
    name: 'test-repo',
    full_name: 'testuser/test-repo',
    private: true,
    owner: MOCK_USER,
    permissions: {
        admin: true,
        push: true,
        pull: true
    }
};

// Empty initial state - no existing data
const MOCK_404_NOT_FOUND = {
    message: 'Not Found',
    documentation_url: 'https://docs.github.com/rest'
};

// File content responses (base64 encoded)
function createContentResponse(path, content, sha = null) {
    const encodedContent = Buffer.from(content).toString('base64');
    const fileSha = sha || generateSha(content);
    return {
        name: path.split('/').pop(),
        path: path,
        sha: fileSha,
        size: content.length,
        type: 'file',
        content: encodedContent,
        encoding: 'base64'
    };
}

// Create/Update response
function createUpdateResponse(path, content, sha) {
    return {
        content: createContentResponse(path, content, sha),
        commit: {
            sha: generateSha(Date.now().toString()),
            message: 'Update ' + path
        }
    };
}

// Delete response
function createDeleteResponse(path, sha) {
    return {
        content: null,
        commit: {
            sha: generateSha(Date.now().toString()),
            message: 'Delete ' + path
        }
    };
}

// Git blob response
function createBlobResponse(content) {
    const sha = generateSha(content);
    return {
        sha: sha,
        url: `https://api.github.com/repos/testuser/test-repo/git/blobs/${sha}`
    };
}

// Git ref response
function createRefResponse(branch = 'main') {
    const sha = generateSha(branch + Date.now());
    return {
        ref: `refs/heads/${branch}`,
        object: {
            sha: sha,
            type: 'commit'
        }
    };
}

// Git commit response
function createCommitResponse(treeSha, parentSha, message = 'Update files') {
    const sha = generateSha(message + Date.now());
    return {
        sha: sha,
        tree: { sha: treeSha },
        parents: [{ sha: parentSha }],
        message: message
    };
}

// Git tree response
function createTreeResponse(baseTreeSha, files) {
    const sha = generateSha(JSON.stringify(files) + Date.now());
    return {
        sha: sha,
        tree: files.map(f => ({
            path: f.path,
            mode: '100644',
            type: 'blob',
            sha: f.sha
        }))
    };
}

// Simple SHA generator (not cryptographically secure, just for testing)
function generateSha(input) {
    let hash = 0;
    const str = String(input);
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(40, '0');
}

// Sample encrypted data (simulates AES-256-GCM encrypted content)
const MOCK_ENCRYPTED_TODOS = JSON.stringify({
    iv: 'mockInitVector123',
    data: 'encryptedTodoDataHere'
});

const MOCK_ENCRYPTED_NOTES = JSON.stringify({
    iv: 'mockInitVector456',
    data: 'encryptedNotesDataHere'
});

const MOCK_ENCRYPTED_FILES = JSON.stringify({
    iv: 'mockInitVector789',
    data: 'encryptedFilesIndexHere'
});

module.exports = {
    MOCK_USER,
    MOCK_REPO,
    MOCK_404_NOT_FOUND,
    MOCK_ENCRYPTED_TODOS,
    MOCK_ENCRYPTED_NOTES,
    MOCK_ENCRYPTED_FILES,
    createContentResponse,
    createUpdateResponse,
    createDeleteResponse,
    createBlobResponse,
    createRefResponse,
    createCommitResponse,
    createTreeResponse,
    generateSha
};
