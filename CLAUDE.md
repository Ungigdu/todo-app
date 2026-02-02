# CLAUDE.md - Development Workflow

## Task Classification

| Size | Criteria | Examples |
|------|----------|----------|
| **Trivial** | Single-line, obvious fix | Typos, config tweaks, text changes |
| **Small** | Single-file, clear scope | Simple bug fix, minor UI tweak |
| **Large** | Multi-file, design decisions | New features, refactors, architecture changes |

---

## Workflow by Size

### Trivial Tasks
1. **Implement** → Fix directly
2. **Verify** → Quick manual check
3. **Commit** → Simple commit message

### Small Tasks
1. **Plan** → Brief description of approach (1-2 sentences)
2. **Test** → Write/update test for the change
3. **Implement** → Make the change
4. **Verify** → Run tests, manual check
5. **Commit** → Descriptive commit message

### Large Tasks
1. **Plan** → Full implementation plan with steps
2. **Options** → Present alternatives with pros/cons
3. **Test** → Write comprehensive tests first
4. **Implement** → Execute approved plan
5. **Verify** → Run all tests, manual verification
6. **Document** → Update relevant docs if needed
7. **Commit** → Detailed commit message

---

## Special Rules

### Image Bug Handling
1. **Confirm position** → Ask user to identify exact location/coordinates
2. **Reproduce** → Verify the issue visually
3. **Fix** → Apply correction
4. **Verify** → Screenshot comparison if needed

### Rollback Guidance
- If implementation fails or breaks other functionality:
  1. Revert changes (`git checkout -- <file>`)
  2. Re-analyze the problem
  3. Propose alternative approach

---

## Agent Context Directory

### Structure
```
agent/
  history.md      # Change/fix history log
  context/        # Task-specific context files
  screenshots/    # Image references for bugs
```

### What to Save
- Requirements clarifications
- Screenshots of issues
- Implementation decisions made
- Links to relevant resources

---

## Commit Conventions

```
<type>: <short description>

Types:
- fix:      Bug fix
- feat:     New feature
- refactor: Code restructure
- style:    UI/CSS changes
- test:     Test additions/changes
- docs:     Documentation
```

---

## Testing

- **Framework**: Playwright (`@playwright/test` v1.58.1)
- **Run tests**: `npm test` or `npx playwright test`
- **Test files**: `*.test.js`

### Test Pattern
```javascript
const { test, expect } = require('@playwright/test');

test.describe('Feature Tests', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(`file://${__dirname}/index.html`);
    });

    test('should do something', async ({ page }) => {
        // Test implementation
    });
});
```

---

## History

All changes logged in `agent/history.md`
