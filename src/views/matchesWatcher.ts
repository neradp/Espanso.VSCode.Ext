// Copyright (c) the Espanso.VSCode.Ext project contributors.

import * as path from "node:path";
import * as vscode from "vscode";
import type { EspansoPaths } from "../espanso/cli";

/** Watches Espanso-owned YAML roots and coalesces bursts into one tree refresh. */
export class MatchesWatcher implements vscode.Disposable {
  private readonly watchers: vscode.FileSystemWatcher[] = [];
  private refreshTimer: NodeJS.Timeout | undefined;

  constructor(private readonly onChanged: () => void) {}

  watch(paths: EspansoPaths): void {
    this.disposeWatchers();
    this.addRoot(path.join(paths.config, "match"));
    this.addRoot(paths.packages);
  }

  private addRoot(root: string): void {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(root, "**/*.{yml,yaml}")
    );
    watcher.onDidCreate(() => this.scheduleRefresh());
    watcher.onDidChange(() => this.scheduleRefresh());
    watcher.onDidDelete(() => this.scheduleRefresh());
    this.watchers.push(watcher);
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      this.onChanged();
    }, 200);
  }

  private disposeWatchers(): void {
    for (const watcher of this.watchers.splice(0)) {
      watcher.dispose();
    }
  }

  dispose(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    this.disposeWatchers();
  }
}