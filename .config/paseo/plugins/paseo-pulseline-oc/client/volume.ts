import type { ToolCallDetail, ToolCallTimelineItem } from "@getpaseo/protocol/agent-types";

export type PulseHeightIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

const MAX_ESTIMATE_CHARS = 20_000;

function approximateTokens(text: string): number {
  const value = text.length > MAX_ESTIMATE_CHARS ? text.slice(0, MAX_ESTIMATE_CHARS) : text;
  let ascii = 0;
  let nonAscii = 0;
  for (const character of value) {
    if ((character.codePointAt(0) ?? 0) <= 0x7f) ascii += 1;
    else nonAscii += 1;
  }
  return Math.ceil(ascii / 4 + nonAscii / 2);
}

export function textTokenEstimate(text: string | undefined): number {
  return Math.max(1, text === undefined ? 0 : approximateTokens(text));
}

export function heightIndexForTokens(tokens: number): PulseHeightIndex {
  if (tokens <= 16) return 0;
  if (tokens <= 64) return 1;
  if (tokens <= 128) return 2;
  if (tokens <= 256) return 3;
  if (tokens <= 512) return 4;
  if (tokens <= 1_024) return 5;
  if (tokens <= 2_048) return 6;
  return 7;
}

export function pulseVolume(volumeTokens: number) {
  const normalized = Math.max(1, Math.ceil(volumeTokens));
  return { volumeTokens: normalized, heightIndex: heightIndexForTokens(normalized) };
}

function errorText(error: unknown): string | undefined {
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return undefined;
}

function toolDetailText(detail: ToolCallDetail): string | undefined {
  switch (detail.type) {
    case "shell":
      return detail.output;
    case "read":
      return detail.content;
    case "edit":
      return detail.unifiedDiff ?? detail.newString ?? detail.oldString;
    case "write":
      return detail.content;
    case "search":
      return detail.content ?? detail.annotations?.join("\n") ?? detail.filePaths?.join("\n") ?? detail.webResults?.map(({ title, url }) => `${title} ${url}`).join("\n");
    case "fetch":
      return detail.result ?? detail.codeText;
    case "worktree_setup":
      return detail.log;
    case "sub_agent":
      return detail.log ?? detail.description;
    case "plain_text":
      return detail.text ?? detail.label;
    case "plan":
      return detail.text;
    case "unknown":
      return typeof detail.output === "string"
        ? detail.output
        : typeof detail.input === "string"
          ? detail.input
          : undefined;
  }
}

export function toolTokenEstimate(item: ToolCallTimelineItem): number {
  return textTokenEstimate(toolDetailText(item.detail) ?? errorText(item.error) ?? item.name);
}
