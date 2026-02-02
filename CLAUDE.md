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
2. **Options** → Present alternatives with pros/cons, **wait for user choice**
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
        await page.goto('/index.html');
    });

    test('should do something', async ({ page }) => {
        // Test implementation
    });
});
```

---

## UI Style Guide

### Design Principles
- **Consistency**: Use the same colors, fonts, and spacing throughout
- **Hierarchy**: Larger = more important, use weight and size to guide attention
- **Simplicity**: Limit to 2-3 main colors, 2-3 font weights
- **Accessibility**: Maintain 4.5:1 contrast ratio for text

### Colors

#### Primary Palette
| Token | Hex | Usage |
|-------|-----|-------|
| `primary` | `#667eea` | Buttons, links, active states, accents |
| `primary-gradient` | `#667eea → #764ba2` | Primary buttons, headers |

#### Semantic Colors
| Token | Hex | Usage |
|-------|-----|-------|
| `success` | `#22c55e` | Success states, confirmations |
| `warning` | `#f59e0b` | Warnings, pending states |
| `error` | `#ef4444` | Errors, destructive actions |

#### Text Colors (limit to these)
| Token | Hex | Usage |
|-------|-----|-------|
| `text-primary` | `#333` | Headings, important text |
| `text-secondary` | `#666` | Body text, descriptions |
| `text-muted` | `#888` | Helper text, timestamps, placeholders |

#### Background Colors
| Token | Hex | Usage |
|-------|-----|-------|
| `bg-page` | `#f5f5f5` | Page background |
| `bg-card` | `#ffffff` | Cards, modals |
| `bg-hover` | `#f0f0f0` | Hover states |
| `border` | `#e1e1e1` | Borders, dividers |

### Typography

#### Font Sizes (CSS Variables)
```css
--font-size-big: 15px;    /* Headings, buttons, labels */
--font-size-small: 12px;  /* Helper text, timestamps */
/* Body text: 14px (default) */
```

#### Font Weights
| Weight | Usage |
|--------|-------|
| `400` (normal) | Body text, descriptions |
| `500` (medium) | Labels, buttons |
| `600` (semibold) | Headings, emphasis |

#### Hierarchy Rules
- **H1**: 24-32px, weight 600, color `text-primary`
- **H2**: 18-20px, weight 600, color `text-primary`
- **Body**: 14px, weight 400, color `text-secondary`
- **Small/Helper**: 12px, weight 400, color `text-muted`

### Spacing

Use consistent spacing multiples of 4px:
| Token | Value | Usage |
|-------|-------|-------|
| `xs` | 4px | Tight spacing, inline elements |
| `sm` | 8px | Between related elements |
| `md` | 16px | Section padding, gaps |
| `lg` | 24px | Between sections |
| `xl` | 32px | Page margins, large gaps |

### Components

#### Buttons
- **Primary**: Gradient background, white text, rounded corners
- **Secondary**: Light background (`#f0f0f0`), dark text
- **Danger**: Red background (`#fee2e2`), red text (`#dc2626`)
- **Size**: Padding 10px 20px, font-size 15px

#### Inputs
- Border: 2px solid `#e1e1e1`
- Focus: Border color `#667eea`
- Padding: 12px 15px
- Border-radius: 8px

#### Cards/Modals
- Background: white
- Border-radius: 12px
- Shadow: `0 10px 25px rgba(0,0,0,0.1)`
- Padding: 20px

### Do's and Don'ts

**DO:**
- Use CSS variables for colors and sizes
- Maintain consistent spacing (multiples of 4px)
- Use `text-primary` for headings, `text-muted` for helper text
- Keep text contrast ratio above 4.5:1

**DON'T:**
- Introduce new gray shades (use existing `#333`, `#666`, `#888`)
- Mix different success/error color shades
- Use hardcoded font sizes (use variables)
- Add shadows without purpose

---

## History

All changes logged in `agent/history.md`
