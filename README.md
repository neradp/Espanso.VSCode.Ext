# Espanso.VSCode.Ext — espanso config editing for Visual Studio Code

A Visual Studio Code extension that makes editing [espanso](https://espanso.org)
configuration and match files fast and pleasant, directly in the editor you already use.

> Status: **early development** — the project skeleton (build, schemas, tree view,
> commands, snippets, CI) is in place; features are being fleshed out towards the v1
> scope described below.

## Why

espanso match files are plain YAML, so any editor can open them — but nothing understands
them. Typos in field names fail silently, the set of allowed fields is hard to remember,
and once your snippets grow across multiple files (plus imports and installed packages),
finding the match you want to edit becomes a chore.

Feature-wise this project takes inspiration from
[EspansoEdit](https://ee.qqv.com.au/usage/summary/), an excellent Windows-only freeware GUI
editor for espanso (closed source, built on SynEdit). Instead of a separate GUI application,
this project brings the most useful of those capabilities into VS Code, cross-platform, as
an ordinary extension.

## Planned features (v1)

### 1. Validation, autocompletion and hover docs (JSON Schema)

espanso publishes **official JSON Schemas** for both file types in its own repository
(`espanso/schemas/match.schema.json` and `config.schema.json`, also listed on
[SchemaStore](https://www.schemastore.org)). This extension registers those official
schemas with the
[Red Hat YAML](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-yaml)
language server via VS Code contribution points, matching files under espanso's
`match/` and `config/` folders. That immediately provides:

- red squiggles for unknown/mistyped fields and wrong value types,
- `Ctrl+Space` completion for every espanso field (`trigger`, `replace`, `word`,
  `propagate_case`, `uppercase_style`, …) including variable `type` values and their
  per-type `params`,
- hover documentation for each field.

The schemas are maintained upstream by the espanso project itself, so they stay in
sync with what espanso actually accepts.

### 2. "Espanso Matches" tree view

A side-bar view listing every match (trigger + label) from all match files — including
`imports` and installed packages — grouped by file. Click a match to jump straight to its
definition (file + line). Works by parsing the YAML with source positions; espanso does not
need to be running.

### 3. Commands

| Command | What it does |
|---|---|
| `Espanso: Open Match Folder` | Opens the match folder (located via `espanso path`) |
| `Espanso: Open Config Folder` | Opens the config folder |
| `Espanso: Open Packages Folder` | Opens the packages folder |
| `Espanso: Restart Espanso` | Runs `espanso service restart` |
| `Espanso: Refresh Matches` | Re-parses match files and refreshes the tree |
| `Espanso: New Match File` | Creates a new `.yml` from a template |

### 4. Snippets

Ready-made snippets for the common match patterns: basic replace, multi-trigger, word-only,
regex, cursor position (`$|$`), form matches, and `vars` blocks for the date / shell /
script / clipboard / choice / random / echo variable types.

## Out of scope for v1

GUI match builders (webviews), converters from other text expanders, backups, match
sorting/reordering tools. These may come later; the goal of v1 is to make hand-editing
espanso YAML genuinely comfortable.

## Relationship to espanso

The extension integrates with espanso in two ways:

- **Filesystem**: parsing and editing the YAML files under espanso's config directory
  (found via `espanso path`; on Windows typically `%APPDATA%\espanso`).
- **CLI**: shelling out to the `espanso` executable for `path`, `service restart`, and
  `match list -j` as a cross-check. On Windows the real binary is `espansod.exe` and the
  user-PATH registration lives in `HKCU\Environment`, so the extension performs its own
  executable discovery instead of blindly trusting `PATH` (the same verified approach as the
  sibling [EspansoSearchBar](../Microsoft.CmdPal.Ext.EspansoSearchBar) Command Palette
  extension).

No espanso binaries are bundled; espanso itself remains the single source of truth for
expansion behavior.

## Credits

This project is being created with the help of AI.

Co-authored-by: [GitHub Copilot](https://github.com/features/copilot) — design,
implementation and documentation developed collaboratively with GitHub Copilot CLI, with
espanso file formats verified against the upstream espanso sources.
