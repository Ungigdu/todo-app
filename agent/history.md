# Change History

## 2026-02-03

### Arweave-Inspired Style Redesign
- Replaced pixel/game theme with clean, high-tech Arweave-inspired design
- Created `agent/style-guide.md` with complete design system documentation
- Updated color system: orange accent (#FF6600), black & white neutral palette
- Implemented subtle glass effects (backdrop-filter blur) on modals and forms
- Updated typography to use system monospace fonts (SF Mono, Fira Code, Consolas)
- Removed Press Start 2P pixel font from index.html
- Updated all components to use 1px borders (from 2px) for cleaner look
- Updated buttons: removed pixel-style 3D shadows, cleaner flat design
- Updated form inputs: lighter borders, orange focus states
- Updated todo/note items: cleaner backgrounds, subtle hover states
- All 23 tests passing

### Pixel/Game Theme Redesign
- Renamed app from "GitHub Todo List" to "Life Console"
- Removed subtitle text and encryption helper text
- Added Press Start 2P pixel font for headings
- Implemented dark theme with game-like color palette
- Updated all components: login, sidebar, modals, todos, notes
- Added glow effects and pixel-inspired borders
- Sharper corners (reduced border-radius)
- Button press effects (3D shadow on click)

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
