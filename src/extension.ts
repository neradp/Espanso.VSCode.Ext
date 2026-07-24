// Copyright (c) the Espanso.VSCode.Ext project contributors.

// Extension entry point: wires up commands and the "Espanso Matches" tree view.
// Schema validation and snippets are pure contributions in package.json and need
// no code here.

import * as path from "node:path";
import * as vscode from "vscode";
import { getEspansoPaths, runEspanso, setExecutableOverride } from "./espanso/cli";
import { MatchesTreeProvider } from "./views/matchesTree";
import { EspansoStatusBar } from "./views/statusBar";

const NEW_MATCH_FILE_TEMPLATE = `# espanso match file
# For the full list of options see https://espanso.org/docs/matches/basics/

matches:
  - trigger: ":example"
    replace: "Hello from espanso!"
`;

export function activate(context: vscode.ExtensionContext): void {
  applyConfiguration();

  const tree = new MatchesTreeProvider();
  const statusBar = new EspansoStatusBar();
  statusBar.attach(context);
  void statusBar.update();
  context.subscriptions.push(
    statusBar,
    vscode.window.registerTreeDataProvider("espansoMatches", tree),

    vscode.commands.registerCommand("espanso.showMenu", () => statusBar.showMenu()),

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("espanso")) {
        applyConfiguration();
        tree.refresh();
        void statusBar.update();
      }
    }),

    vscode.commands.registerCommand("espanso.refreshMatches", () => tree.refresh()),

    vscode.commands.registerCommand("espanso.openMatchFolder", () =>
      withEspansoPaths((p) => openFolder(path.join(p.config, "match")))
    ),
    vscode.commands.registerCommand("espanso.openConfigFolder", () =>
      withEspansoPaths((p) => openFolder(p.config))
    ),
    vscode.commands.registerCommand("espanso.openPackagesFolder", () =>
      withEspansoPaths((p) => openFolder(p.packages))
    ),

    vscode.commands.registerCommand("espanso.restart", async () => {
      try {
        const result = await runEspanso(["service", "restart"], 30_000);
        if (result.exitCode === 0) {
          void vscode.window.showInformationMessage("Espanso restarted.");
        } else {
          void vscode.window.showErrorMessage(
            `Espanso restart failed: ${result.stderr || result.stdout || `exit code ${result.exitCode}`}`
          );
        }
      } catch (err) {
        showEspansoNotFound(err);
      }
    }),

    vscode.commands.registerCommand("espanso.newMatchFile", async () => {
      await withEspansoPaths(async (p) => {
        const name = await vscode.window.showInputBox({
          prompt: "Name of the new match file (without extension)",
          placeHolder: "my-snippets",
          validateInput: (value) =>
            /^[\w][\w.-]*$/.test(value) ? undefined : "Use letters, digits, '.', '-' or '_'.",
        });
        if (!name) {
          return;
        }
        const fileUri = vscode.Uri.file(path.join(p.config, "match", `${name}.yml`));
        try {
          await vscode.workspace.fs.stat(fileUri);
          void vscode.window.showErrorMessage(`File already exists: ${fileUri.fsPath}`);
          return;
        } catch {
          // Does not exist — good.
        }
        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(NEW_MATCH_FILE_TEMPLATE, "utf8"));
        await vscode.window.showTextDocument(fileUri);
        tree.refresh();
      });
    })
  );
}

export function deactivate(): void {
  // Nothing to clean up: all disposables are registered in context.subscriptions.
}

function applyConfiguration(): void {
  const config = vscode.workspace.getConfiguration("espanso");
  setExecutableOverride(config.get<string>("executablePath"));
}

async function withEspansoPaths(
  action: (paths: Awaited<ReturnType<typeof getEspansoPaths>>) => void | Promise<void>
): Promise<void> {
  try {
    const paths = await getEspansoPaths();
    await action(paths);
  } catch (err) {
    showEspansoNotFound(err);
  }
}

function openFolder(fsPath: string): void {
  // Open the folder in a new VS Code window (not the OS file manager), so the
  // user can edit the YAML files right away with schema support active.
  void vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(fsPath), {
    forceNewWindow: true,
  });
}

function showEspansoNotFound(err: unknown): void {
  const detail = err instanceof Error ? err.message : String(err);
  void vscode.window.showErrorMessage(
    `Espanso CLI not available. Is espanso installed? (${detail})`
  );
}
