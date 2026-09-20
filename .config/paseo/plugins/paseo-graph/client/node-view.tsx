import { useCallback, useMemo, useRef } from "react";
import {
  type AccessibilityActionEvent,
  PanResponder,
  Pressable,
  View,
  type ViewProps,
} from "react-native";
import { type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { type GraphNode } from "./model";
import { canvas } from "./styles";
import { LAYER, NODE_BORDER_WIDTH } from "./view";

/**
 * One dot: its gesture handling, its keyboard and assistive activation, and the
 * distinction between a tap that opens it and a drag that moves it.
 */

/** Pointer travel below this never counts as a drag. */
const TAP_SLOP = 5;

/**
 * iOS routes `accessibilityActivate` to `onAccessibilityTap`, Android delivers
 * the named action. Both are wired, plus Enter and Space on the web; a platform
 * only ever delivers one of them, so activation stays single.
 */
const ACTIVATE_ACTION = [{ name: "activate" }] as const;

interface NodeViewProps {
  node: GraphNode;
  left: number;
  top: number;
  radius: number;
  color: string;
  theme: PluginSurfaceProps["theme"];
  hovered: boolean;
  opacity: number;
  onHover: (nodeId: string | null) => void;
  onGrab: (nodeId: string) => void;
  onMove: (nodeId: string, dx: number, dy: number) => void;
  onRelease: () => void;
  onActivate: (node: GraphNode) => void;
}

/** Just the dot. Its label is drawn by the canvas-level label layer, because a
 * node view is only a few pixels across and clips anything past its edge. */
export function NodeView({
  node,
  left,
  top,
  radius,
  color,
  theme,
  hovered,
  opacity,
  onHover,
  onGrab,
  onMove,
  onRelease,
  onActivate,
}: NodeViewProps) {
  // A status refetch replaces the node object on every backstop poll, and a
  // stream event can do it sooner. Rebuilding the responder then would abandon
  // an in-flight gesture together with its InteractionManager handle, and the
  // restarted one reports zero travel - a drag read as a tap.
  const latest = useRef({ node, onGrab, onMove, onRelease, onActivate, onHover });
  latest.current = { node, onGrab, onMove, onRelease, onActivate, onHover };

  // Travel is remembered for the whole gesture: dragging out and back lands on
  // a final delta of zero, which read as a tap and opened the node.
  const travelled = useRef(false);
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponderCapture: () => true,
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          travelled.current = false;
          latest.current.onGrab(latest.current.node.id);
        },
        onPanResponderMove: (_event, gesture) => {
          if (Math.abs(gesture.dx) >= TAP_SLOP || Math.abs(gesture.dy) >= TAP_SLOP) {
            travelled.current = true;
          }
          latest.current.onMove(latest.current.node.id, gesture.dx, gesture.dy);
        },
        onPanResponderRelease: (_event, gesture) => {
          latest.current.onRelease();
          const moved =
            travelled.current || Math.abs(gesture.dx) >= TAP_SLOP || Math.abs(gesture.dy) >= TAP_SLOP;
          travelled.current = false;
          if (!moved) latest.current.onActivate(latest.current.node);
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderTerminate: () => {
          travelled.current = false;
          latest.current.onRelease();
        },
      }),
    // Nothing above is read from the render scope, and the parent keys this
    // component by node.id, so an instance's id never changes: built once.
    [],
  );

  // Read through the ref, so none of these is rebuilt when a refetch replaces
  // the node object - and the dot, drawn once per node per frame, hands React
  // the same props it had last frame.
  const hoverIn = useCallback(() => latest.current.onHover(latest.current.node.id), []);
  const hoverOut = useCallback(() => latest.current.onHover(null), []);
  const activate = useCallback(() => latest.current.onActivate(latest.current.node), []);
  const accessibilityAction = useCallback((event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName !== "activate") return;
    latest.current.onActivate(latest.current.node);
  }, []);
  // Only the corner radius follows the dot; the fill itself is fixed.
  const fillStyle = useMemo(() => [canvas.fill, { borderRadius: radius }], [radius]);

  // Keyboard and assistive activation never reach the responder above, so these
  // are the only paths that fire them - no pointer tap is doubled.
  const hostHandlers = useMemo(
    () =>
      ({
        onMouseEnter: () => latest.current.onHover(latest.current.node.id),
        onMouseLeave: () => latest.current.onHover(null),
        onKeyDown: (event: { key?: string; preventDefault?: () => void }) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault?.();
          latest.current.onActivate(latest.current.node);
        },
      }) as unknown as ViewProps,
    [],
  );

  return (
    <View
      {...responder.panHandlers}
      {...hostHandlers}
      accessible
      focusable
      accessibilityRole="button"
      accessibilityLabel={`${node.kind}: ${node.label}`}
      accessibilityActions={ACTIVATE_ACTION}
      onAccessibilityTap={activate}
      onAccessibilityAction={accessibilityAction}
      // Positional: left, top and radius come from the simulation and differ
      // every frame, so there is no stable object to hand React instead.
      // oxlint-disable-next-line jsx-no-new-object-as-prop
      style={{
        position: "absolute",
        left: left - radius,
        top: top - radius,
        width: radius * 2,
        height: radius * 2,
        borderRadius: radius,
        backgroundColor: color,
        borderWidth:
          hovered || node.kind === "project"
            ? NODE_BORDER_WIDTH.emphasised
            : NODE_BORDER_WIDTH.resting,
        borderColor: hovered
          ? theme.colors.foreground
          : node.kind === "project"
            ? theme.colors.foregroundMuted
            : theme.colors.surface0,
        opacity,
        zIndex: hovered ? LAYER.hoveredNode : LAYER.node,
      }}
    >
      <Pressable
        accessible={false}
        focusable={false}
        onHoverIn={hoverIn}
        onHoverOut={hoverOut}
        style={fillStyle}
      />
    </View>
  );
}
