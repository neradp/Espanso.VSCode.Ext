// Copyright (c) the Espanso.VSCode.Ext project contributors.

// TreeDataProvider for the "Espanso Matches" view: match files (config match folder
// plus installed packages) grouped by file, each match clickable to jump to its
// YAML definition. Built by parsing the YAML directly (see matchFiles.ts) so it
// works even when espanso is not running.

import * as path from "node:path";
import * as vscode from "vscode";
import { getEspansoPaths } from "../espanso/cli";
import { parseMatchFile, type ParsedMatch } from "../espanso/matchFiles";

export interface FileGroup {
  readonly uri: vscode.Uri;
  /** Path shown as the group label, relative to the match/packages root. */
  readonly label: string;
  readonly matches: ParsedMatch[];
  readonly errors: string[];
}

export interface MatchEntry {
  readonly uri: vscode.Uri;
  readonly fileLabel: string;
  readonly match: ParsedMatch;
}

type TreeNode = FileGroup | MatchNode;

interface MatchNode {
  kind: "match";
  match: ParsedMatch;
  fileUri: vscode.Uri;
}

function isFileGroup(node: TreeNode): node is FileGroup {
  return !("kind" in node);
}

export class MatchesTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private groups: FileGroup[] = [];
  private loadError: string | undefined;
  private loaded = false;
  private loading: Promise<void> | undefined;
  /** Normalized fsPaths already added, to deduplicate imports and break cycles. */
  private visited = new Set<string>();

  refresh(): void {
    this.loaded = false;
    this.loading = undefined;
    this._onDidChangeTreeData.fire();
  }

  /** Returns the same parsed matches used by the tree, without a second filesystem scan. */
  async getMatchEntries(): Promise<MatchEntry[]> {
    await this.ensureLoaded();
    return this.groups.flatMap((group) =>
      group.matches.map((match) => ({ uri: group.uri, fileLabel: group.label, match }))
    );
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    if (isFileGroup(element)) {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Expanded);
      item.iconPath = vscode.ThemeIcon.File;
      item.resourceUri = element.uri;
      item.description = `${element.matches.length}`;
      if (element.errors.length > 0) {
        item.tooltip = element.errors.join("\n");
        item.description += " ⚠";
      }
      return item;
    }

    const m = element.match;
    const item = new vscode.TreeItem(m.triggers.join(", "), vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon("symbol-snippet");
    item.description = m.label;
    item.tooltip = m.replacePreview ?? m.label;
    item.command = {
      command: "vscode.open",
      title: "Open match definition",
      arguments: [
        element.fileUri,
        {
          selection: new vscode.Range(m.line, m.column, m.line, m.column),
        } satisfies vscode.TextDocumentShowOptions,
      ],
    };
    return item;
  }

  async getChildren(element?: TreeNode): Promise<TreeNode[]> {
    if (!element) {
      await this.ensureLoaded();
      return this.groups;
    }
    if (isFileGroup(element)) {
      return element.matches.map((m) => ({ kind: "match", match: m, fileUri: element.uri }));
    }
    return [];
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return;
    }
    this.loading ??= this.load();
    await this.loading;
  }

  private async load(): Promise<void> {
    this.groups = [];
    this.loadError = undefined;
    this.visited.clear();
    try {
      const paths = await getEspansoPaths();
      // Match files live in <config>/match; packages each ship their own package.yml.
      // (espanso also supports legacy layouts, out of scope for v1.)
      await this.collectFrom(vscode.Uri.file(path.join(paths.config, "match")), "");
      await this.collectFrom(vscode.Uri.file(paths.packages), "packages/");
    } catch (err) {
      this.loadError = err instanceof Error ? err.message : String(err);
      void vscode.window.showWarningMessage(`Espanso: failed to load matches — ${this.loadError}`);
    } finally {
      this.loaded = true;
      this.loading = undefined;
    }
  }

  /** Recursively collects *.yml / *.yaml files under `root` into file groups. */
  private async collectFrom(root: vscode.Uri, labelPrefix: string): Promise<void> {
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(root);
    } catch {
      return; // Folder may legitimately not exist (e.g. no packages installed).
    }

    for (const [name, type] of entries) {
      const child = vscode.Uri.joinPath(root, name);
      if (type === vscode.FileType.Directory) {
        await this.collectFrom(child, `${labelPrefix}${name}/`);
      } else if (type === vscode.FileType.File && /\.ya?ml$/i.test(name)) {
        // Package internals like _manifest.yml carry no matches; skip underscore files.
        if (name.startsWith("_")) {
          continue;
        }
        await this.addFile(child, `${labelPrefix}${name}`);
      }
    }
  }

  /**
   * Parses one match file into a file group and recursively follows its `imports`.
   * Import paths are resolved relative to the importing file
   * (espanso-config/src/matches/group/loader/yaml/mod.rs); already-visited files
   * are skipped, which also breaks import cycles.
   */
  private async addFile(uri: vscode.Uri, label: string): Promise<void> {
    const key = path.normalize(uri.fsPath).toLowerCase();
    if (this.visited.has(key)) {
      return;
    }
    this.visited.add(key);

    let bytes: Uint8Array;
    try {
      bytes = await vscode.workspace.fs.readFile(uri);
    } catch {
      return; // Imported file may not exist; espanso itself only warns here too.
    }
    const parsed = parseMatchFile(Buffer.from(bytes).toString("utf8"));
    if (parsed.matches.length > 0 || parsed.errors.length > 0) {
      this.groups.push({ uri, label, matches: parsed.matches, errors: parsed.errors });
    }
    for (const imported of parsed.imports) {
      const resolved = path.isAbsolute(imported)
        ? imported
        : path.resolve(path.dirname(uri.fsPath), imported);
      await this.addFile(vscode.Uri.file(resolved), `imports/${path.basename(resolved)}`);
    }
  }
}
