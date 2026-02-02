# Change History

## 2026-02-03

### CSS Design System Implementation
- Added 20+ CSS variables for colors, spacing, borders
- Converted all hardcoded colors to use CSS variables
- Standardized text colors: `--text-primary`, `--text-secondary`, `--text-muted`
- Standardized semantic colors: `--color-success`, `--color-warning`, `--color-error`
- Standardized backgrounds: `--bg-page`, `--bg-card`, `--bg-hover`, `--bg-input`
- Standardized borders: `--border-color`, `--border-light`
- All 22 tests passing

### UI Style Guide
- Added comprehensive UI style guide to CLAUDE.md
- Documented color palette (primary, semantic, text, background)
- Documented typography hierarchy and font sizes
- Documented spacing system (4px multiples)
- Added component guidelines (buttons, inputs, cards)
- Added Do's and Don'ts section

### Modal Footer Spacing Fix
- Fixed overlap between timestamp and Download button in file preview modal
- Added `gap: 20px` to `.modal-footer`
- Added proper flex-shrink behavior

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
