import { useEffect, useState } from "react";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const FRAME_MS = 80;

/**
 * A text spinner, not an `ActivityIndicator`: it sits inside a button label and
 * inherits that label's font, colour and size on every platform.
 */
export function useSpinnerFrame(spinning: boolean): string {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!spinning) return;
    const timer = setInterval(() => setFrame((value) => (value + 1) % FRAMES.length), FRAME_MS);
    return () => clearInterval(timer);
  }, [spinning]);
  return spinning ? (FRAMES[frame] as string) : "";
}
