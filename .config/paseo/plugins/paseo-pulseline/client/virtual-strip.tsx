import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ScrollView as NativeScrollView } from "react-native";
import { View } from "react-native";
import { ScrollView } from "@getpaseo/plugin/client/ui";
import { PulseColumn } from "./pulse-column";
import { pulseSegmentIcon, type PulseSegment, type PulseStripData } from "./pulse-view";
import { stripExtent, stripWindow, STRIP_COLUMN_PITCH } from "./strip-window";
import { attachStripWheel } from "./strip-wheel";
import type { PluginButtonContentProps } from "@getpaseo/plugin/client";

export function VirtualStrip({ segments, data, colors, historyLoaded, hoveredId, onSelect }: {
  segments: readonly PulseSegment[]; data: PulseStripData; colors: PluginButtonContentProps["theme"]["colors"];
  historyLoaded: boolean;
  hoveredId: string | null; onSelect: (id: string | null) => void;
}) {
  const scroller = useRef<NativeScrollView | null>(null);
  const [viewport, setViewport] = useState(360);
  const position = useRef(Math.max(0, stripExtent(segments.length) - 360));
  const initialRange = stripWindow(segments.length, position.current, viewport);
  const [window, setWindow] = useState({ first: initialRange.first, end: initialRange.end });
  const windowRef = useRef(window);
  const previous = useRef({ data, segments });
  const initiallyScrolled = useRef(false);
  const followPending = useRef(false);
  const updatePosition = (requested: number) => {
    const x = Math.max(0, Math.min(requested, Math.max(0, stripExtent(segments.length) - viewport)));
    position.current = x;
    const next = stripWindow(segments.length, x, viewport);
    if (next.first !== windowRef.current.first || next.end !== windowRef.current.end) {
      const range = { first: next.first, end: next.end };
      windowRef.current = range; setWindow(range);
    }
    return x;
  };
  useLayoutEffect(() => {
    // Establish the newest position before processing position-based anchoring.
    if (historyLoaded && segments.length && !initiallyScrolled.current) newest();
    const old = previous.current;
    if (old.data !== data) {
      const tail = old.segments.at(-1);
      const nextTail = segments.at(-1);
      const oldEnd = Math.max(0, stripExtent(old.segments.length) - viewport);
      const nearEnd = position.current >= oldEnd - STRIP_COLUMN_PITCH;
      const tailIndex = tail ? data.indices.get(tail.id) : undefined;
      const extended = tailIndex !== undefined && (tailIndex < segments.length - 1 || segments.length > old.segments.length);
      const grew = tail !== undefined && nextTail?.id === tail.id && nextTail.volumeTokens > tail.volumeTokens;
      if (nearEnd && (extended || grew)) {
        // Update the virtual range immediately, then repeat after native content
        // layout if necessary. Prepends follow only if the user was at the end;
        // phase-only blink renders never initiate scrolling.
        followPending.current = true;
        newest();
      } else {
        // Preserve the old visible pixel of the first surviving visible column.
        // This survives prepends, head eviction and coalescing of an earlier head.
        const first = Math.max(0, Math.floor(position.current / STRIP_COLUMN_PITCH));
        const end = Math.min(old.segments.length, Math.ceil((position.current + viewport) / STRIP_COLUMN_PITCH) + 1);
        const oldOffset = position.current;
        let target = oldOffset;
        for (let index = first; index < end; index++) {
          const id = old.segments[index]!.id;
          const nextIndex = data.indices.get(id);
          if (nextIndex !== undefined) { target += (nextIndex - index) * STRIP_COLUMN_PITCH; break; }
        }
        const x = updatePosition(target);
        if (x !== oldOffset) scroller.current?.scrollTo({ x, animated: false });
      }
    }
    updatePosition(position.current);
    previous.current = { data, segments };
  }, [data, segments, viewport, historyLoaded]);
  useLayoutEffect(() => {
    const index = hoveredId === null ? undefined : data.indices.get(hoveredId);
    if (hoveredId !== null && (index === undefined || index < window.first || index >= window.end)) onSelect(null);
  }, [hoveredId, data, window.first, window.end, onSelect]);
  useEffect(() => attachStripWheel(scroller.current?.getScrollableNode?.()), []);
  const newest = () => {
    updatePosition(Math.max(0, stripExtent(segments.length) - viewport));
    scroller.current?.scrollToEnd({ animated: false }); initiallyScrolled.current = true;
  };
  const visible = window.first === window.end && segments.length ? stripWindow(segments.length, position.current, viewport) : window;
  return <ScrollView horizontal ref={scroller} showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}
    style={{ width: "100%", height: 76, flexShrink: 0 }} contentContainerStyle={{ paddingBottom: 20 }} scrollEventThrottle={16}
    onLayout={event => {
      const width = event.nativeEvent.layout.width;
      if (position.current >= Math.max(0, stripExtent(segments.length) - viewport) - 1) {
        const x = Math.max(0, stripExtent(segments.length) - width); position.current = x;
        scroller.current?.scrollTo({ x, animated: false });
      }
      setViewport(width);
    }}
    onScrollBeginDrag={() => { followPending.current = false; onSelect(null); }}
    onScroll={event => {
      onSelect(null);
      updatePosition(event.nativeEvent.contentOffset.x);
      if (position.current < Math.max(0, stripExtent(segments.length) - viewport) - STRIP_COLUMN_PITCH) followPending.current = false;
    }}
    onContentSizeChange={() => {
      if (followPending.current || (!initiallyScrolled.current && historyLoaded && segments.length)) newest();
      followPending.current = false;
    }}>
    <View style={{ flexDirection: "row", alignItems: "flex-end", height: 54, width: stripExtent(segments.length) }}>
      <View accessibilityLabel="Earlier activity spacer" style={{ width: visible.first * STRIP_COLUMN_PITCH, height: 54, flexShrink: 0 }} />
      {segments.slice(visible.first, visible.end).map((item, index) => <PulseColumn key={item.id}
        id={item.id} label={`${item.kind} size bucket ${item.sizeBucket}`} icon={pulseSegmentIcon(item)} color={colors[item.color]}
        height={item.height * 2} opacity={item.opacity} hovered={hoveredId === item.id} highlight={colors.surface2}
        last={visible.first + index === segments.length - 1} onSelect={onSelect} />)}
      <View accessibilityLabel="Later activity spacer" style={{ width: Math.max(0, stripExtent(segments.length) - visible.end * STRIP_COLUMN_PITCH), height: 54, flexShrink: 0 }} />
    </View>
  </ScrollView>;
}
