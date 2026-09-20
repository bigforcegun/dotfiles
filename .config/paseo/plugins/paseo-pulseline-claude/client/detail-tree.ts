// The popover's element tree, built without JSX and with the host primitives
// injected. Production passes React Native's View and Text; tests pass markers,
// so the real hierarchy, styles and accessible names are assertable without a
// native renderer. Nothing here holds state: the hooks stay in pulse-detail.tsx.
import { Fragment, createElement, type ElementType, type ReactElement, type ReactNode } from "react";
import type { DetailFooter, DetailModel, DetailRow } from "./detail-model.ts";

export interface PulsePrimitives {
  readonly View: ElementType;
  readonly Text: ElementType;
}

/** Only the theme tokens the popover actually paints with. */
export interface PulseThemeColors {
  readonly foreground: string;
  readonly foregroundMuted: string;
  readonly accent: string;
  readonly statusSuccess: string;
  readonly statusWarning: string;
  readonly statusDanger: string;
  readonly border: string;
  readonly surface0: string;
}

/**
 * Drawn geometry. The model's height units are the agreed cross-plugin steps and
 * never change here; pixels are this plugin's own. One unit was one pixel, which
 * squeezed eight buckets into 14 px and made neighbours indistinguishable — a glyph
 * step (two units) is now 8 px tall. Wrappers are a constant narrow width — volume
 * decides height, nothing decides width — and the footer has a fixed height and
 * aligns to flex-end, so every bar stands on one common baseline.
 */
export const BAR_BASE_PX = 8;
export const BAR_UNIT_PX = 4;
export const BAR_WIDTH = 6;
export const BAR_WIDTH_COMPACT = 5;
const MIN_UNITS = 4;

/** Model units -> drawn pixels: linear, so the bucket order is preserved exactly. */
export function barHeightPx(units: number): number {
  return BAR_BASE_PX + (units - MIN_UNITS) * BAR_UNIT_PX;
}

/** Fixed, not minimum: the shared bottom edge every bar grows from (18 units -> 64 px). */
export const FOOTER_HEIGHT = barHeightPx(18) + 4;

export const STARTING_TEXT = "Pulseline is starting…";
export const INCOMPLETE_TEXT = "Older history was not read; counts describe the tail only.";

export function detailStyles(colors: PulseThemeColors, compact: boolean) {
  return {
    body: { gap: compact ? 10 : 14, minWidth: compact ? 220 : 320 },
    status: { color: colors.foreground, fontSize: compact ? 15 : 17 },
    note: { color: colors.foregroundMuted, fontSize: compact ? 11 : 12 },
    rows: { gap: compact ? 2 : 4 },
    row: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
    glyph: { color: colors.foregroundMuted, fontSize: compact ? 12 : 13, minWidth: 18 },
    value: { color: colors.foreground, fontSize: compact ? 12 : 13 },
    valueApprox: { color: colors.foregroundMuted, fontSize: compact ? 12 : 13 },
    divider: { height: 1, backgroundColor: colors.border },
    footer: {
      width: "100%" as const,
      flexDirection: "row" as const,
      alignItems: "flex-end" as const,
      height: FOOTER_HEIGHT,
      minHeight: FOOTER_HEIGHT,
    },
    barWidth: compact ? BAR_WIDTH_COMPACT : BAR_WIDTH,
  };
}

export type PulseStyles = ReturnType<typeof detailStyles>;

/** Glyph and value only: the row name exists for screen readers, not for the eye. */
function rowElement(row: DetailRow, styles: PulseStyles, ui: PulsePrimitives): ReactElement {
  return createElement(
    ui.View,
    {
      key: `${row.glyph}-${row.label}`,
      accessibilityLabel: `${row.label} ${row.value}`,
      style: styles.row,
    },
    createElement(ui.Text, { style: styles.glyph }, row.glyph),
    createElement(ui.Text, { style: row.approx ? styles.valueApprox : styles.value }, row.value),
  );
}

/** Full-width pulse, drawn from the same segments the pill turns into glyphs. */
export function pulseFooterElement(
  footer: DetailFooter,
  styles: PulseStyles,
  colors: PulseThemeColors,
  ui: PulsePrimitives,
): ReactElement {
  return createElement(
    ui.View,
    { accessibilityLabel: footer.accessibilityLabel, style: styles.footer },
    footer.segments.map((segment) =>
      createElement(
        Fragment,
        { key: segment.key },
        createElement(
          ui.View,
          { style: { flexDirection: "row", width: styles.barWidth } },
          createElement(ui.View, {
            accessibilityLabel: segment.kind,
            style: {
              flex: 1,
              borderRadius: 2,
              height: barHeightPx(segment.height),
              backgroundColor: colors[segment.token],
              opacity: 1,
            },
          }),
        ),
        // Separators sit between bars, so the trailing segment never draws one.
        segment.separator
          ? createElement(ui.View, {
              style: { width: 1, alignSelf: "stretch", backgroundColor: colors.surface0 },
            })
          : null,
      ),
    ),
  );
}

/** The popover body. The footer is the last child in every state. */
export function pulseDetailTree(
  detail: DetailModel | null,
  styles: PulseStyles,
  colors: PulseThemeColors,
  ui: PulsePrimitives,
): ReactElement {
  if (!detail) {
    return createElement(
      ui.View,
      { style: styles.body },
      createElement(ui.Text, { style: styles.status }, STARTING_TEXT),
    );
  }
  const metrics: ReactNode =
    detail.rows.length > 0
      ? createElement(
          ui.View,
          { style: styles.rows },
          detail.rows.map((row) => rowElement(row, styles, ui)),
        )
      : createElement(ui.Text, { style: styles.note }, detail.emptyMetricsText);
  return createElement(
    ui.View,
    { style: styles.body },
    createElement(ui.Text, { style: styles.status }, detail.status),
    createElement(ui.View, { style: styles.divider }),
    metrics,
    detail.incomplete ? createElement(ui.Text, { style: styles.note }, INCOMPLETE_TEXT) : null,
    pulseFooterElement(detail.footer, styles, colors, ui),
  );
}
