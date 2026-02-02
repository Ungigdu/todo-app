# Change History

## 2026-02-03

### GitHub API Mock System
- Created `tests/mocks/fixtures.js` - Mock response data for GitHub API
- Created `tests/mocks/github-api.js` - Playwright route interception for mocking
- Created `tests/helpers/test-utils.js` - Common test utilities
- Created `tests/api.test.js` - 12 new API integration tests
- Created `playwright.config.js` - Config with local HTTP server
- Updated `layout.test.js` to use HTTP server instead of file://
- Added `http-server` as dev dependency
- All 22 tests passing (10 layout + 12 API)

### Workflow Enhancement
- Upgraded to tiered workflow (Trivial/Small/Large tasks)
- Added verification steps to all workflows
- Added rollback guidance
- Added commit conventions
- Created `agent/context/` for task-specific files
- Created `agent/screenshots/` for image bug references

### Initial Setup
- Created `CLAUDE.md` with development workflow guidelines
- Created `agent/` directory for context storage
- Created `agent/history.md` for change tracking
- Documented existing Playwright test framework in CLAUDE.md
