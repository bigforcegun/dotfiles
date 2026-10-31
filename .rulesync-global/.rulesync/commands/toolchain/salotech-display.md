---
targets:
  - '*'
description: Publish HTML/Markdown artifacts to display.dev (salote.ch org) via the toolchain proxy
---
Scope `/toolchain` to display.dev: `retrieve_tools` with `query: "display artifact <English action from $ARGUMENTS>"`, server `salotech-display`. The org is fixed by the OAuth grant — no org parameter exists.

- New artifact: `publish` with inline `content` and `format` (`html` default, or `md`), plus `name`. Omitted `visibility` = `private`; `company` = whole salote.ch org; `public` = anyone with the link. Return the URL and `short_id` from the response.
- Large file: `create_upload` (`filename`, exact `size_bytes`), PUT the raw bytes to the returned URL with every `required_headers` entry, then `publish` with `upload_id`. Do not echo the upload URL or headers.
- Update: `get_metadata` for the current version, then `publish` with `short_id` + `base_version`, or `edit` for a single unique span. Find existing ones with `list` / `search`.
- `publish`, `edit`, `share`, `rename` are annotated destructive. My request to publish a new artifact is the confirmation; confirm before updating an existing artifact, `public` visibility, adding shares, or `delete`.
