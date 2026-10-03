// Test-only stand-in for a React renderer. React Native cannot be imported under
// `node --test`, so the popover tree is built with marker primitives and walked
// into plain nodes: real element hierarchy, real style objects, real accessible
// names, no native runtime.
import { Fragment, isValidElement, type FunctionComponent, type ReactElement, type ReactNode } from "react";
import type { DetailModel } from "./detail-model.ts";
import {
  detailStyles,
  pulseDetailTree,
  type PulsePrimitives,
  type PulseThemeColors,
} from "./detail-tree.ts";

const FakeView: FunctionComponent = () => null;
const FakeText: FunctionComponent = () => null;

export const FAKE_PRIMITIVES: PulsePrimitives = { View: FakeView, Text: FakeText };

/** Sentinel values: any colour not taken from the theme is visible as itself. */
export const FAKE_COLORS: PulseThemeColors = {
  foreground: "theme:foreground",
  foregroundMuted: "theme:foregroundMuted",
  accent: "theme:accent",
  statusSuccess: "theme:statusSuccess",
  statusWarning: "theme:statusWarning",
  statusDanger: "theme:statusDanger",
  border: "theme:border",
  surface0: "theme:surface0",
};

export const FAKE_COLOR_VALUES: string[] = Object.values(FAKE_COLORS);

export interface FakeNode {
  /** "View" or "Text" for the injected primitives; anything else is foreign. */
  readonly type: string;
  readonly props: Record<string, unknown>;
  readonly style: Record<string, unknown>;
  /** Direct string children only; child elements live in `children`. */
  readonly text: string;
  readonly children: FakeNode[];
}

function typeName(type: unknown): string {
  if (type === FakeView) return "View";
  if (type === FakeText) return "Text";
  if (typeof type === "string") return type;
  if (typeof type === "function") return type.name || "anonymous";
  return "foreign";
}

function textOf(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  return "";
}

function nodesOf(node: ReactNode): FakeNode[] {
  if (Array.isArray(node)) return node.flatMap(nodesOf);
  if (!isValidElement(node)) return [];
  const element = node as ReactElement<Record<string, unknown>>;
  const children = element.props.children as ReactNode;
  // Fragments are grouping only: flattening them exposes the drawn hierarchy.
  if (element.type === Fragment) return nodesOf(children);
  const { style, children: _children, ...props } = element.props;
  return [
    {
      type: typeName(element.type),
      props,
      style: (style ?? {}) as Record<string, unknown>,
      text: textOf(children),
      children: nodesOf(children),
    },
  ];
}

export function render(element: ReactNode): FakeNode {
  const [root] = nodesOf(element);
  if (!root) throw new Error("nothing was rendered");
  return root;
}

export interface RenderDetailOptions {
  readonly compact?: boolean;
  readonly colors?: PulseThemeColors;
}

export function renderDetail(
  detail: DetailModel | null,
  options: RenderDetailOptions = {},
): FakeNode {
  const colors = options.colors ?? FAKE_COLORS;
  const styles = detailStyles(colors, options.compact ?? false);
  return render(pulseDetailTree(detail, styles, colors, FAKE_PRIMITIVES));
}

/** Pre-order walk, the node itself first. */
export function descendants(node: FakeNode): FakeNode[] {
  return [node, ...node.children.flatMap(descendants)];
}

/** The footer is the popover's last child, in every state. */
export function footerOf(root: FakeNode): FakeNode {
  const last = root.children.at(-1);
  if (!last) throw new Error("the popover body has no children");
  return last;
}

/** A separator is a bare view; a segment wrapper always holds its bar. */
export function isSeparator(node: FakeNode): boolean {
  return node.children.length === 0;
}
