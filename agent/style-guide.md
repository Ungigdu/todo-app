# Life Console - Style Guide

## Design Philosophy
- **Clean**: Minimal, uncluttered interfaces
- **High-tech**: Modern, professional aesthetic
- **Readable**: High contrast, clear typography

---

## Colors

### Primary Palette
| Token | Hex | Usage |
|-------|-----|-------|
| `--color-accent` | `#FF6600` | Highlights, active states, CTAs |
| `--color-accent-hover` | `#E55C00` | Hover states |
| `--color-accent-light` | `#FFF4ED` | Accent backgrounds |

### Neutral Palette
| Token | Hex | Usage |
|-------|-----|-------|
| `--color-black` | `#000000` | Primary text, headings |
| `--color-gray-900` | `#1A1A1A` | Strong text |
| `--color-gray-600` | `#666666` | Secondary text |
| `--color-gray-400` | `#999999` | Muted text, placeholders |
| `--color-gray-200` | `#E5E5E5` | Borders, dividers |
| `--color-gray-100` | `#F5F5F5` | Backgrounds, hover |
| `--color-white` | `#FFFFFF` | Cards, primary background |

### Semantic Colors
| Token | Hex | Usage |
|-------|-----|-------|
| `--color-success` | `#22C55E` | Success states |
| `--color-warning` | `#F59E0B` | Warning states |
| `--color-error` | `#EF4444` | Error states |

---

## Typography

### Font Families
```css
--font-mono: 'SF Mono', 'Fira Code', 'Consolas', monospace;
--font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

### Usage
| Element | Font | Weight | Size |
|---------|------|--------|------|
| H1 | Monospace | 400 | 32px |
| H2 | Monospace | 400 | 24px |
| H3 | Monospace | 400 | 18px |
| Body | Sans-serif | 400 | 15px |
| Small | Sans-serif | 400 | 13px |
| Labels | Sans-serif | 500 | 12px (uppercase) |

---

## Effects

### Glass Effect (Subtle)
```css
background: rgba(255, 255, 255, 0.8);
backdrop-filter: blur(10px);
-webkit-backdrop-filter: blur(10px);
border: 1px solid rgba(0, 0, 0, 0.1);
```

### Shadows
```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
--shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08);
--shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.12);
```

---

## Spacing

| Token | Value |
|-------|-------|
| `--space-xs` | 4px |
| `--space-sm` | 8px |
| `--space-md` | 16px |
| `--space-lg` | 24px |
| `--space-xl` | 32px |
| `--space-2xl` | 48px |

---

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 4px | Small elements |
| `--radius-md` | 8px | Buttons, inputs |
| `--radius-lg` | 12px | Cards, modals |

---

## Components

### Buttons

**Primary (Orange)**
```css
background: var(--color-accent);
color: white;
border: none;
padding: 12px 24px;
border-radius: var(--radius-md);
font-weight: 500;
```

**Secondary (Outlined)**
```css
background: transparent;
color: var(--color-black);
border: 1px solid var(--color-gray-200);
```

**Ghost**
```css
background: transparent;
color: var(--color-gray-600);
border: none;
```

### Inputs
```css
background: var(--color-white);
border: 1px solid var(--color-gray-200);
border-radius: var(--radius-md);
padding: 12px 16px;
/* Focus state */
border-color: var(--color-accent);
box-shadow: 0 0 0 3px var(--color-accent-light);
```

### Cards (Glass)
```css
background: rgba(255, 255, 255, 0.8);
backdrop-filter: blur(10px);
border: 1px solid var(--color-gray-200);
border-radius: var(--radius-lg);
box-shadow: var(--shadow-md);
```

---

## Do's and Don'ts

### DO
- Use orange sparingly for important actions only
- Maintain high contrast for readability
- Use monospace font for headings
- Keep interfaces clean with lots of whitespace
- Use subtle glass effects on overlays

### DON'T
- Overuse the accent color
- Use low contrast text
- Add unnecessary decorations
- Use heavy shadows or gradients
- Mix multiple accent colors
