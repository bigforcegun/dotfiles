import { expect, it } from "vitest";
import { PULSE_LABEL_WIDTH } from "./pulse-view";

// Host composer pill (Paseo 0.14 buttons/view.tsx + composer/pill-styles.ts):
// maxWidth 160, paddingHorizontal 12+12, icon slot 16, gap 8, label fontSize 12, numberOfLines 1.
// Braille cells measure 8.2px at 12pt (measured with NSFont.systemFont on macOS) so the newest cell is never ellipsised.
it("composer label fits the host pill so the blinking last cell is never cut off", () => {
  const textBudget = 160 - 24 - 16 - 8;
  expect(PULSE_LABEL_WIDTH * 8.2).toBeLessThanOrEqual(textBudget);
});
