# DESIGN.md — مشوار / Mashwar
## Global Design System & AI Prompt Reference

> This file is the single source of truth for all design decisions in the Mashwar codebase.
> Any AI agent, developer, or tool modifying UI must follow this document.

---

## 1. Brand Identity

**Mashwar (مشوار)** is Palestine's first movement intelligence platform.
The aesthetic must feel: **precise, trustworthy, human, and unapologetically Palestinian.**

**Tone:** Refined dark glassmorphism. Military-precision data clarity. Warmth in the Arabic.
**NOT:** Corporate SaaS. Google Maps clone. Generic "AI dashboard". Purple gradient hell.

---

## 2. Color System

All colors are defined as CSS custom properties in `global.css`.
Always reference tokens — never hardcode hex values in components.

```css
:root {
  /* ── Palestinian Core ─────────────────────────── */
  --clr-green:        #006233;   /* Palestine flag green — primary brand */
  --clr-green-bright: #00a651;   /* Active states, success, live indicators */
  --clr-green-soft:   #b8e6ce;   /* Subtle green tints, hover fills */
  --clr-green-dim:    rgba(0, 98, 51, 0.15); /* Green glass layer */

  --clr-red:          #EE2A35;   /* Palestine flag red — danger, HIGH risk */
  --clr-red-deep:     #c41f29;   /* Pressed states, deep alerts */
  --clr-red-soft:     rgba(238, 42, 53, 0.12); /* Red glass tint */

  --clr-black:        #0D0D0D;   /* Near-black — text, deep surfaces */
  --clr-night:        #111827;   /* Dark panel base */
  --clr-night-mid:    #1a1f2e;   /* Layered card backgrounds */

  --clr-white:        #F5F5F0;   /* Warm off-white — primary light text */
  --clr-sand:         #E8E8E0;   /* Secondary text on dark */
  --clr-slate:        #8b9196;   /* Muted/tertiary text */
  --clr-border:       rgba(255, 255, 255, 0.10); /* Default border on dark */
  --clr-border-mid:   rgba(255, 255, 255, 0.18); /* Hover border */
  --clr-border-bright:rgba(255, 255, 255, 0.28); /* Active/focus border */

  /* ── Risk Semantic Colors ─────────────────────── */
  --risk-low:         #00a651;
  --risk-low-bg:      rgba(0, 166, 81, 0.12);
  --risk-med:         #f59e0b;
  --risk-med-bg:      rgba(245, 158, 11, 0.12);
  --risk-high:        #EE2A35;
  --risk-high-bg:     rgba(238, 42, 53, 0.12);

  /* ── Glassmorphism ────────────────────────────── */
  --glass-bg:         rgba(255, 255, 255, 0.06);
  --glass-bg-mid:     rgba(255, 255, 255, 0.10);
  --glass-bg-raised:  rgba(255, 255, 255, 0.14);
  --glass-border:     rgba(255, 255, 255, 0.12);
  --glass-border-mid: rgba(255, 255, 255, 0.22);
  --glass-blur:       blur(20px);
  --glass-blur-heavy: blur(32px);

  /* ── App Background ───────────────────────────── */
  --bg-base: linear-gradient(160deg, #0d1117 0%, #0a1628 50%, #0d1a0e 100%);
  /* This is the dark gradient all panels float on top of.
     Sits behind the map. Panels are transparent glass over it. */
}
```

### Color Usage Rules

| Situation | Token to use |
|---|---|
| Primary brand action (buttons, active links) | `--clr-green` |
| Success / open checkpoint / low risk | `--clr-green-bright` |
| Danger / closed checkpoint / high risk | `--clr-red` |
| Body text on dark | `--clr-white` |
| Secondary/muted text | `--clr-sand` |
| Hints, placeholders, labels | `--clr-slate` |
| Panel background | `--glass-bg` + `backdrop-filter: var(--glass-blur)` |
| Card background (raised) | `--glass-bg-raised` |
| Borders on panels | `--glass-border` |
| Borders on hover | `--glass-border-mid` |

**Never use:** plain white `#ffffff` backgrounds, solid dark fills without transparency, purple, blue, or any color not in this palette.

---

## 3. Typography

### Font Stack

```css
/* In index.html <head> — load these from Google Fonts */
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=Cairo:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

:root {
  --font-display: 'Syne', sans-serif;      /* Headings, brand name, big numbers */
  --font-arabic:  'Cairo', sans-serif;     /* All Arabic text, RTL content */
  --font-mono:    'JetBrains Mono', monospace; /* Coordinates, confidence %, data */
}
```

**Why Syne:** Geometric, slightly experimental. Confident without being cold. Pairs with Arabic perfectly because of its clean structure. Not Inter. Not Space Grotesk. Not Roboto.

**Why Cairo:** The gold standard for Arabic UI. Legible at 11px. Beautiful at 24px. Handles RTL, mixed content, and diacritics cleanly.

**Why JetBrains Mono:** Data feels technical and precise. Confidence scores and checkpoint IDs should look like data, not labels.

### Type Scale

```css
:root {
  --text-xs:   11px;   /* Tags, timestamps, meta */
  --text-sm:   13px;   /* Secondary labels, descriptions */
  --text-base: 15px;   /* Body, list items */
  --text-md:   17px;   /* Card titles, section headers */
  --text-lg:   22px;   /* Panel headings */
  --text-xl:   32px;   /* Big numbers, hero metrics */
  --text-2xl:  48px;   /* Display / hero only */

  --weight-normal:  400;
  --weight-medium:  500;
  --weight-bold:    700;
  --weight-black:   800;

  --leading-tight:  1.2;
  --leading-normal: 1.5;
  --leading-loose:  1.8;  /* Arabic body text — always use this */
}
```

### Typography Rules

- **All Arabic text:** `font-family: var(--font-arabic); line-height: var(--leading-loose); direction: rtl;`
- **All headings:** `font-family: var(--font-display); font-weight: var(--weight-bold);`
- **All data/numbers:** `font-family: var(--font-mono);`
- **Never mix Syne and Cairo in the same line** — one language, one font per text block.
- Letter-spacing on uppercase labels: `letter-spacing: 0.06em`
- Never go below 11px font size.

---

## 4. Glass Panel System

This is the core visual language. Every panel, card, and modal is glass.

```css
/* Base glass panel — side panels, modals */
.glass-panel {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  border-radius: 20px;
}

/* Raised card inside a panel */
.glass-card {
  background: var(--glass-bg-mid);
  border: 1px solid var(--glass-border);
  border-radius: 14px;
  padding: 14px 16px;
}

/* Elevated card (hover state, active route) */
.glass-card--elevated {
  background: var(--glass-bg-raised);
  border-color: var(--glass-border-mid);
}

/* Top edge highlight — makes glass feel lit */
.glass-panel::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(
    180deg,
    rgba(255,255,255,0.08) 0%,
    transparent 40%
  );
  pointer-events: none;
}
```

### Glass Rules
- **Always** pair glass background with `backdrop-filter`. No glass without blur.
- Panels that sit over the map must have `background: var(--glass-bg)` — semi-transparent so the map bleeds through.
- Inner cards within panels use `--glass-bg-mid` (slightly more opaque) to create depth hierarchy.
- Never use solid `background: #1a1f2e` for panels. Always glass.
- The map itself is never touched — it's the canvas the glass floats on.

---

## 5. Spacing & Layout

```css
:root {
  --space-1:  4px;
  --space-2:  8px;
  --space-3:  12px;
  --space-4:  16px;
  --space-5:  20px;
  --space-6:  24px;
  --space-8:  32px;
  --space-10: 40px;

  --radius-sm:  8px;
  --radius-md:  12px;
  --radius-lg:  16px;
  --radius-xl:  20px;
  --radius-full: 9999px;

  --panel-width:     320px;  /* Side panel fixed width */
  --panel-padding:   20px;   /* Internal panel padding */
}
```

### Layout Rules
- Side panels: `width: var(--panel-width); padding: var(--panel-padding);`
- Section gap inside panels: `gap: var(--space-3)` (12px)
- Card internal padding: `16px 18px`
- Between major sections: `margin-top: var(--space-5)` (20px)
- Icon + label rows: `gap: var(--space-2)` (8px), `align-items: center`

---

## 6. Component Patterns

### Status Badges
```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: var(--radius-full);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  letter-spacing: 0.04em;
}

.badge--open   { background: var(--risk-low-bg);  color: var(--risk-low);  border: 1px solid var(--risk-low); }
.badge--slow   { background: var(--risk-med-bg);  color: var(--risk-med);  border: 1px solid var(--risk-med); }
.badge--closed { background: var(--risk-high-bg); color: var(--risk-high); border: 1px solid var(--risk-high); }
```

### Live Pulse Dot
```css
.pulse-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--clr-green-bright);
  box-shadow: 0 0 0 0 rgba(0, 166, 81, 0.4);
  animation: pulse 2s infinite;
}
@keyframes pulse {
  0%   { box-shadow: 0 0 0 0 rgba(0,166,81,0.4); }
  70%  { box-shadow: 0 0 0 6px rgba(0,166,81,0); }
  100% { box-shadow: 0 0 0 0 rgba(0,166,81,0); }
}
```

### Primary Button
```css
.btn-primary {
  background: var(--clr-green);
  color: var(--clr-white);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: var(--weight-bold);
  border: none;
  border-radius: var(--radius-md);
  padding: 10px 18px;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;
  letter-spacing: 0.02em;
}
.btn-primary:hover  { background: #005229; }
.btn-primary:active { transform: scale(0.98); }
```

### Ghost Button
```css
.btn-ghost {
  background: var(--glass-bg);
  color: var(--clr-sand);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  padding: 10px 18px;
  cursor: pointer;
  backdrop-filter: var(--glass-blur);
  transition: border-color 0.15s, background 0.15s;
}
.btn-ghost:hover { border-color: var(--glass-border-mid); background: var(--glass-bg-mid); }
```

### Section Label
```css
.section-label {
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: var(--weight-bold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--clr-slate);
  margin-bottom: var(--space-2);
}
```

### Divider
```css
.divider {
  height: 1px;
  background: var(--glass-border);
  margin: var(--space-4) 0;
}
```

---

## 7. RTL / Bilingual Rules

Mashwar serves Arabic-first users. Follow these rules strictly:

- **Default direction is RTL.** Set `dir="rtl"` on `<html>` or panel root.
- Arabic text always uses `font-family: var(--font-arabic)`.
- Latin/number text inside Arabic sentences: wrap in `<span dir="ltr" style="font-family: var(--font-mono)">`.
- Icons in RTL panels: flip directional icons with `transform: scaleX(-1)`.
- Padding in RTL: use `padding-inline-start` / `padding-inline-end` not left/right.
- Never use `text-align: right` as a substitute for `direction: rtl`.

---

## 8. Animation Principles

- **Panels entering:** `transform: translateX(-12px); opacity: 0;` → `transform: none; opacity: 1;` over `250ms ease-out`
- **Cards appearing:** stagger with `animation-delay: calc(var(--i) * 60ms)`
- **Risk score change:** pulse the badge color once — `animation: badge-pulse 0.4s ease`
- **Route lines on map:** draw with CSS `stroke-dasharray` animation, 600ms
- **No bounce.** No spring physics. No elastic. Clean ease-out only.
- Respect `prefers-reduced-motion` — wrap all animations:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
```

---

## 9. Map Integration Rules

- Map tiles are always visible through glass panels. Panels are never fully opaque.
- Checkpoint markers: circles, 12px, colored by status (`--risk-low/med/high`)
- Active route: 4px stroke, `--clr-green-bright` for primary, `--clr-red` for high-risk segments
- Heatmap overlay: radial gradients using risk colors at 40% opacity max
- Cluster numbers: `font-family: var(--font-mono); font-size: 11px;`
- Never render map controls behind panels — keep z-index hierarchy clean

---

## 10. Do / Don't Quick Reference

| ✅ DO | ❌ DON'T |
|---|---|
| Glass panels with backdrop-filter | Solid opaque panel backgrounds |
| Palestinian green as primary action | Blue, purple, or teal as primary |
| Cairo for all Arabic text | Arabic text in Inter or Roboto |
| Syne for all headings and display | Generic system fonts for headings |
| JetBrains Mono for data/numbers | Regular font for confidence scores |
| Warm off-white `#F5F5F0` for text | Pure white `#ffffff` for text |
| Risk colors semantically (low/med/high) | Random colors for status badges |
| `direction: rtl` on Arabic containers | `text-align: right` for Arabic |
| 20px border-radius on panels | Sharp corners or tiny radius |
| Subtle pulse animation for live data | Heavy bounce or spring animations |

---

## 11. AI Agent Prompt

When instructing any AI (Claude, Cursor, Copilot, v0, etc.) to modify UI in this repo, prepend this prompt:

```
You are modifying the UI of Mashwar (مشوار), Palestine's movement intelligence platform.

DESIGN SYSTEM (follow exactly):
- Colors: Use CSS tokens from global.css. Primary = --clr-green (#006233). Danger = --clr-red (#EE2A35). Never use blue, purple, or hardcoded hex values.
- All panels and cards must use glassmorphism: background: var(--glass-bg); backdrop-filter: blur(20px); border: 1px solid var(--glass-border). Never use solid opaque backgrounds.
- Fonts: Headings → 'Syne'. Arabic text → 'Cairo'. Data/numbers → 'JetBrains Mono'. Never use Inter, Roboto, or system fonts.
- The app is RTL-first. All Arabic text uses dir="rtl" and font-family: var(--font-arabic).
- Risk status uses exactly three states: LOW (#00a651), MEDIUM (#f59e0b), HIGH (#EE2A35).
- Spacing uses --space-* tokens. Border-radius uses --radius-* tokens. Never hardcode px values for these.
- The map is always visible behind panels. Panels float as glass over the map. Never cover the map with opaque elements.
- Animations: ease-out only, 200–300ms. No bounce, no spring. Always add prefers-reduced-motion fallback.
- Reference DESIGN.md for any token or pattern not listed here.
```

---

## 12. File Structure Reference

```
src/
├── styles/
│   ├── global.css          ← All CSS tokens live here (:root block)
│   ├── glass.css           ← Glass panel utility classes
│   ├── typography.css      ← Font imports, type scale, RTL rules
│   ├── components.css      ← Buttons, badges, dividers
│   └── animations.css      ← All keyframes
├── components/
│   ├── SidePanel/          ← The routing control panel
│   ├── CheckpointCard/     ← Individual checkpoint status cards
│   ├── RiskBadge/          ← LOW/MED/HIGH badge component
│   ├── RouteCard/          ← Route option display
│   └── HardshipIndex/      ← Movement hardship score widget
└── DESIGN.md               ← This file
```

---

*Last updated: Mashwar v1 — Palestine TechnoPark AI Week Hackathon 2026*
*"The map Palestine was never given. So we built it ourselves."*