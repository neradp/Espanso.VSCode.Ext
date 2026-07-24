# AGENTS.md — instructions for AI agents working on Espanso.VSCode.Ext

## What this project is

**Espanso.VSCode.Ext** is a Visual Studio Code extension that makes editing
[espanso](https://espanso.org) configuration and match files fast and pleasant:
schema-driven validation and autocompletion, a clickable overview of all matches,
espanso-specific commands and snippets.

It is inspired by the feature set of **EspansoEdit** (https://ee.qqv.com.au — a closed-source
Windows-only GUI editor built on the SynEdit component; no public repository exists), but this
project is an independent, from-scratch implementation for VS Code. Do not copy anything from
EspansoEdit; it is inspiration for *features*, not a source of code or assets.

## Hard rules

1. **All code, comments, identifiers, file contents, and user-facing strings are English.**
   Conversation with the user may be Slovak; artifacts are English.
2. **Verify against primary sources; never invent APIs, fields, or versions.**
   - espanso YAML shape: the Rust parsers in github.com/espanso/espanso (see
     "Verified espanso facts" below) are the only ground truth — not blog posts.
   - VS Code API: https://code.visualstudio.com/api and the `@types/vscode` typings.
   - npm package versions: check the npm registry, not memory.
3. **Copyright header** for every source file:
   `// Copyright (c) the Espanso.VSCode.Ext project contributors.` — never use Microsoft or
   espanso copyright headers.
4. **Comment generously.** Non-obvious decisions get a comment explaining *why*, with a link
   to the upstream source or docs that verify the claim.
5. Do not bundle or depend on espanso binaries; integrate via the `espanso` CLI on PATH
   (same discovery caveats as the sibling project, see below) and via the filesystem.
6. Keep the extension lightweight: no heavyweight language server unless a plain
   extension host implementation proves insufficient.

## Planned feature set (v1)

1. **JSON Schemas** for espanso files, contributed via the Red Hat YAML extension
   (`redhat.vscode-yaml`) using its `yamlValidation` contribution point:
   - espanso publishes **official schemas** in its own repository
     (`espanso/schemas/match.schema.json` and `config.schema.json`, referenced by
     SchemaStore); the extension references those URLs instead of maintaining its own
     copies (espanso is GPL-3.0, this project is MIT — reference, do not vendor).
   Schemas provide validation, autocompletion, and hover documentation for free.
2. **"Espanso Matches" TreeView** in the Explorer/side bar: every trigger from all match
   files (including `imports` and installed packages), click → jump to the YAML definition.
3. **Commands** (Command Palette):
   - Open espanso config / match / packages folder (`espanso path` to locate them)
   - Restart espanso (`espanso service restart`)
   - Reload/refresh the matches tree
   - New match file from template
4. **Snippets** for common match patterns: basic replace, multi-trigger, word, regex, form,
   clipboard/date/shell/script/choice/random variables.

Out of scope for v1: editing GUI/webview builders, import/export converters, backup tooling.

## Verified espanso facts (do not re-guess; re-verify on espanso upgrades)

- **Match file fields** — ground truth:
  `espanso-config/src/matches/group/loader/yaml/parse.rs`
  - Top level (`YAMLMatchGroup`): `imports: [string]`, `global_vars: [YAMLVariable]`,
    `matches: [YAMLMatch]`.
  - `YAMLMatch`: `label`, `trigger`, `triggers`, `regex`, `replace`, `image_path`, `form`,
    `form_fields`, `vars`, `word`, `left_word`, `right_word`, `propagate_case`,
    `uppercase_style`, `force_clipboard`, `force_mode`, `markdown`, `paragraph`, `html`,
    `search_terms` (all optional).
  - `YAMLVariable`: `name` (required), `type` (required, field name `type` in YAML),
    `params` (mapping), `inject_vars`, `depends_on`.
- **Config file fields** — ground truth: `espanso-config/src/config/parse/yaml.rs`
  (`label`, `backend`, `enable`, `clipboard_threshold`, `pre_paste_delay`, `toggle_key`,
  `auto_restart`, `preserve_clipboard`, `restore_clipboard_delay`,
  `paste_shortcut_event_delay`, `paste_shortcut`, `inject_delay`, `key_delay`,
  `backspace_delay`, `evdev_modifier_delay`, `word_separators`, `backspace_limit`,
  `apply_patch`, `keyboard_layout`, `search_trigger`, `search_shortcut`, `undo_backspace`,
  `show_notifications`, `show_icon`, `post_form_delay`, `post_search_delay`,
  `secure_input_notification`, `emulate_alt_codes`, `includes`, `excludes`,
  `extra_includes`, `extra_excludes`, `use_standard_includes`, `filter_title`,
  `filter_class`, `filter_exec`, `filter_os`).
- **Variable types and their `params`**: verify in `espanso-render/src/extension/*` before
  encoding them in the schema (date, echo, shell, script, clipboard, random, choice, form…).
  Do not trust docs alone; the extension list in the code is authoritative.
- **Folder discovery**: `espanso path` prints config/packages/runtime folders
  (`espanso/src/cli/path.rs`). Default config location on Windows is `%APPDATA%\espanso`.
- **Windows binary**: the installer ships **`espansod.exe`** only; `espanso.cmd` is a
  one-line shim. `espanso env-path register` writes to the *user* PATH in `HKCU\Environment`
  (`espanso/src/path/win.rs`). The sibling project
  `../Microsoft.CmdPal.Ext.EspansoSearchBar` contains a verified C# implementation of this
  discovery logic (`EspansoSearchBar/Espanso/EspansoCliRunner.cs`) — mirror its order in
  TypeScript when shelling out to espanso.
- `espanso match list -j` emits `[{"triggers": [...], "replace": "...", "label": ...}]` and
  can serve as a cross-check for the tree view, but the tree should primarily be built by
  parsing the YAML files (so it works even when espanso isn't running and can map triggers
  back to file/line).

## Technology choices

- TypeScript, esbuild bundling, `vsce`/`@vscode/vsce` for packaging — follow the official
  "Your First Extension" + bundling guides at code.visualstudio.com/api.
- YAML parsing inside the extension: use the `yaml` npm package (supports source positions,
  needed for click-to-jump). Do not hand-roll a YAML parser.
- Depend on `redhat.vscode-yaml` as an extension dependency for schema features rather than
  implementing a YAML language service.
- Testing: `@vscode/test-electron` (integration) only where valuable; prefer plain unit tests
  for the YAML/tree logic.
- CI: GitHub Actions on `windows-latest` (build, lint, test, package `.vsix` artifact) —
  the user builds via CI, not locally with Visual Studio.

## Layout (planned)

```
Espanso.VSCode.Ext/
├── package.json                 Extension manifest (contributes: schema URLs, views, commands, snippets)
├── snippets/espanso.code-snippets
├── src/
│   ├── extension.ts             activate(): wire commands + tree
│   ├── espanso/cli.ts           espanso CLI discovery + invocation (mirror sibling project)
│   ├── espanso/matchFiles.ts    YAML parsing of match files with positions
│   └── views/matchesTree.ts     TreeDataProvider for the matches view
└── .github/workflows/build.yml
```
