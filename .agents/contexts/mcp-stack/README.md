# MCP Stack

## State

- Status: active pilot on `mcpproxy-go`
- Last updated: 2026-06-21
- Next step: keep `plan-v2.md` as the canonical current-state plan; treat `plan.md` as the older per-server design until it is either archived or folded into `plan-v2.md`.

## Purpose

Design the dotfiles-managed MCP stack for multiple agents and projects: shared MCP fleet, per-project inclusion, process ownership, OMO/OpenCode interaction, and tool filtering.

## Files

- `plan-v2.md` - canonical current-state plan for `mcpproxy-go`, profiles, `mcpd`, and rulesync contexts.
- `plan.md` - older per-server `mcp-proxy` design, kept for historical comparison.
- `research.md` - ecosystem research, ported from `docs/mcp-stack/RESEARCH.md`.
- `omo.md` - OMO/OpenCode-specific integration notes, ported from `docs/mcp-stack/OMO.md`.
- `opencode-mcp-lazy-loading.md` - OpenCode/OMO MCP lazy-loading research, ported from the former `opencode-optimisations-ep1` context.

## Load policy

Read this file first. For current design work, read `plan-v2.md` and `research.md`. Read `plan.md` only when comparing with the older design. For OMO/OpenCode changes, also read `omo.md` and `opencode-mcp-lazy-loading.md`.
