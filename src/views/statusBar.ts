// Copyright (c) the Espanso.VSCode.Ext project contributors.

// Status bar indicator shown only while the active editor contains an
// espanso-related YAML file. Displays ":e|" (espanso-style glyph — the status
// bar only supports text/codicons, not custom images), a warning variant when
// the espanso CLI is not detected, and a QuickPick action menu on click.

import * as vscode from "vscode";
import { getEspansoPaths, getExecutablePath, runEspanso } from "../espanso/cli";

export class EspansoStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private detected = false;
  private version: string | undefined;
  /** Config folder from `espanso path`, used to recognize espanso files precisely. */
  private configDir: string | undefined;

  constructor() {
    this.item = vscode.window.createStatusBarItem("espanso.status", vscode.StatusBarAlignment.Right, 100);
    this.item.name = "Espanso";
    this.item.command = "espanso.showMenu";
  }

  /** Starts listening for editor switches; call once from activate(). */
  attach(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.updateVisibility())
    );
    this.updateVisibility();
  }

  /** Re-runs CLI detection and refreshes the indicator. */
  async update(): Promise<void> {
    try {
      const result = await runEspanso(["--version"], 5_000);
      if (result.exitCode !== 0) {
        throw new Error(result.stderr || `exit code ${result.exitCode}`);
      }
      this.detected = true;
      // `espanso --version` prints e.g. "espanso 2.2.1" (clap-generated).
      this.version = /(\d+\.\d+\.\d+\S*)/.exec(result.stdout)?.[1];
      // Cache the config folder so file detection also works for non-default locations.
      try {
        this.configDir = (await getEspansoPaths()).config;
      } catch {
        this.configDir = undefined;
      }
    } catch {
      this.detected = false;
      this.version = undefined;
    }
    this.render();
    this.updateVisibility();
  }

  private render(): void {
    if (this.detected) {
      this.item.text = ":e|";
      this.item.tooltip = new vscode.MarkdownString(
        `**espanso ${this.version ?? "(unknown version)"}** detected\n\n` +
          `\`${getExecutablePath()}\`\n\nClick for actions`
      );
      this.item.backgroundColor = undefined;
    } else {
      this.item.text = ":e| $(warning)";
      this.item.tooltip = new vscode.MarkdownString(
        "espanso CLI **not detected**. Install espanso or set `espanso.executablePath`.\n\nClick for actions"
      );
      this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    }
  }

  /** Shows the item only when the active editor holds an espanso-related YAML file. */
  private updateVisibility(): void {
    const editor = vscode.window.activeTextEditor;
    if (editor && this.isEspansoFile(editor.document)) {
      this.item.show();
    } else {
      this.item.hide();
    }
  }

  private isEspansoFile(document: vscode.TextDocument): boolean {
    if (document.languageId !== "yaml" && !/\.ya?ml$/i.test(document.fileName)) {
      return false;
    }
    const fsPath = document.uri.fsPath;
    // Default layout: .../espanso/match/... or .../espanso/config/...
    if (/[\\/]espanso[\\/](match|config)[\\/]/i.test(fsPath)) {
      return true;
    }
    // Non-default config location reported by `espanso path`.
    if (this.configDir) {
      const normalizedDir = this.configDir.replace(/[\\/]+$/, "").toLowerCase();
      const lowerPath = fsPath.toLowerCase();
      if (lowerPath.startsWith(normalizedDir + "\\") || lowerPath.startsWith(normalizedDir + "/")) {
        return true;
      }
    }
    return false;
  }

  /** QuickPick menu shown when the status bar item is clicked. */
  async showMenu(): Promise<void> {
    interface ActionItem extends vscode.QuickPickItem {
      command?: string;
      action?: () => Promise<void>;
    }

    const items: ActionItem[] = [];

    if (this.detected) {
      items.push(
        { label: "$(refresh) Refresh matches", command: "espanso.refreshMatches" },
        { label: "$(debug-restart) Restart espanso", command: "espanso.restart" },
        { label: "$(folder-opened) Open match folder", command: "espanso.openMatchFolder" },
        { label: "$(folder-opened) Open config folder", command: "espanso.openConfigFolder" },
        { label: "$(package) Open packages folder", command: "espanso.openPackagesFolder" },
        { label: "$(new-file) New match file", command: "espanso.newMatchFile" }
      );
    } else {
      items.push(
        {
          label: "$(gear) Set espanso.executablePath…",
          description: "Point the extension at your espanso installation",
          action: async () => {
            await vscode.commands.executeCommand(
              "workbench.action.openSettings",
              "espanso.executablePath"
            );
          },
        },
        {
          label: "$(link-external) espanso installation guide",
          action: async () => {
            await vscode.env.openExternal(vscode.Uri.parse("https://espanso.org/install/"));
          },
        }
      );
    }

    items.push({
      label: "$(sync) Re-detect espanso",
      description: "Run detection again",
      action: () => this.update(),
    });

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: this.detected
        ? `espanso ${this.version ?? ""} (${getExecutablePath()})`
        : "espanso was not detected",
    });
    if (!picked) {
      return;
    }
    if (picked.command) {
      await vscode.commands.executeCommand(picked.command);
    } else if (picked.action) {
      await picked.action();
    }
  }

  dispose(): void {
    this.item.dispose();
  }
}
