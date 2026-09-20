# Paseo Pulseline OC Design System

## 1. Atmosphere & Identity

A compact operational signal that reads instantly without competing with the composer. Its signature matches Claude's twelve-cell braille pulse exactly: semantic color identifies activity kind, the ordered `⣀⣤⣶⣿` vocabulary identifies folded volume, and a restrained active-tail blink confirms live work.

## 2. Color

All colors come from the host theme. No plugin-owned color literals are allowed.

| Role | Host token | Usage |
| --- | --- | --- |
| Primary | `theme.colors.foreground` | Assistant output |
| Accent | `theme.colors.accent` | Reasoning |
| Success | `theme.colors.success` | Completed tools |
| Warning | `theme.colors.warning` | Running tools |
| Error | `theme.colors.error` | Failed tools |
| Muted | `theme.colors.foregroundMuted` | Activity dot at rest |

## 3. Typography

The custom label uses the host composer's 12 px text scale with an 18 px line box. Both the custom label and compatibility fallback use Claude's exact contiguous `⣀⣤⣶⣿` braille vocabulary.

## 4. Spacing & Layout

- Base unit: 4 px.
- Label capacity: 12 slots.
- Label container: 96 px wide by 18 px high.
- Visible glyph slot: 8 px wide by 18 px high.
- Spacing: zero gap; braille glyphs provide their own apparent side bearing.
- The container and every slot keep fixed dimensions in every phase.

## 5. Components

### Composer Pulse Label

- **Structure**: fixed-width horizontal `View` containing one fixed-width React Native `Text` child per visible glyph, right-aligned within the twelve-slot capacity. No rectangular pulse bars are used.
- **Variants**: optional host custom `Label`; contiguous Unicode braille string fallback with the same symbols and order.
- **Spacing**: dimensions from Section 4; no flex growth and no phase-dependent padding or gaps.
- **States**: idle history, active tail phase 0, active tail phase 1.
- **Accessibility**: the container has an activity label; color is not the only signal because kind and volume remain available in the expanded content.
- **Motion**: only the final active `Text` child changes glyph level and opacity. Width, capacity, spacing, and neighboring geometry never change.
- **Layout**: fixed inline cluster with `overflow: hidden` and one shared bottom baseline.

## 6. Motion & Interaction

- Motion communicates active agent work only.
- The existing runtime phase timer drives a discrete one-bucket step, folded into Claude's four glyph levels, plus opacity on the final active child.
- No width, position, padding, flex, glyph-count, or container-size animation is permitted.
- The mechanism follows the fixed-shell principle from the beui.dev animated badge: activity changes inside an invariant outer box.

## 7. Depth & Surface

Strategy: tonal only. The label adds no border, shadow, background, or elevation; semantic glyphs inherit host theme colors and remain subordinate to pill chrome owned by Paseo.

## 8. Accessibility Constraints & Accepted Debt

### Constraints

- Preserve host-theme contrast and support both light and dark themes.
- Keep a stable layout during streaming to avoid visual reflow.
- Expose one descriptive accessibility label for the pulse group.

### Accepted Debt

None.
