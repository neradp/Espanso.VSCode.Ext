// Copyright (c) the Espanso.VSCode.Ext project contributors.

// Extension entry point: wires up commands and the "Espanso Matches" tree view.
// Schema validation and snippets are pure contributions in package.json and need
// no code here.

import * as path from "node:path";
import * as vscode from "vscode";
import { getEspansoPaths, runEspanso, setExecutableOverride } from "./espanso/cli";
import { parseFormMatchYaml } from "./espanso/formMatch";
import { FormEditorPanel } from "./views/formEditor";
import { EspansoLogOutput } from "./views/logOutput";
import {
  MatchesTreeProvider,
  type FileGroup,
  type MatchNode,
} from "./views/matchesTree";
import { MatchesWatcher } from "./views/matchesWatcher";
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
  const logOutput = new EspansoLogOutput();
  const matchesWatcher = new MatchesWatcher(() => tree.refresh());
  statusBar.attach(context);
  void statusBar.update();
  void configureWatcher(matchesWatcher);
  context.subscriptions.push(
    statusBar,
    logOutput,
    matchesWatcher,
    vscode.window.registerTreeDataProvider("espansoMatches", tree),

    vscode.commands.registerCommand("espanso.showMenu", () => statusBar.showMenu()),

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("espanso")) {
        applyConfiguration();
        tree.refresh();
        void statusBar.update();
        void configureWatcher(matchesWatcher);
      }
    }),

    vscode.commands.registerCommand("espanso.refreshMatches", () => tree.refresh()),
    vscode.commands.registerCommand("espanso.showLog", () => logOutput.show()),
    vscode.commands.registerCommand("espanso.searchMatches", () => searchMatches(tree)),
    vscode.commands.registerCommand("espanso.createFormMatch", async (file?: FileGroup) => {
      const target = file?.uri ?? await chooseMatchFile(tree);
      if (target) {
        FormEditorPanel.open(target, () => tree.refresh());
      }
    }),
    vscode.commands.registerCommand("espanso.editFormMatch", async (node: MatchNode | undefined) => {
      if (!node?.match.editableForm) {
        return;
      }
      try {
        const document = await vscode.workspace.openTextDocument(node.fileUri);
        const input = parseFormMatchYaml(document.getText(), node.match.matchIndex);
        FormEditorPanel.open(node.fileUri, () => tree.refresh(), {
          input,
          matchIndex: node.match.matchIndex,
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`Cannot edit this Espanso form: ${detail}`);
      }
    }),

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

async function configureWatcher(watcher: MatchesWatcher): Promise<void> {
  try {
    watcher.watch(await getEspansoPaths());
  } catch {
    // CLI detection and its actionable error are already surfaced by the status bar.
  }
}

async function searchMatches(tree: MatchesTreeProvider): Promise<void> {
  const entries = await tree.getMatchEntries();
  const picked = await vscode.window.showQuickPick(
    entries.map((entry) => ({
      label: entry.match.triggers.join(", "),
      description: entry.match.label,
      detail: [entry.match.replacePreview, entry.fileLabel].filter(Boolean).join(" · "),
      entry,
    })),
    {
      matchOnDescription: true,
      matchOnDetail: true,
      placeHolder: entries.length > 0 ? "Search Espanso matches" : "No Espanso matches found",
    }
  );
  if (!picked) {
    return;
  }
  const { match } = picked.entry;
  await vscode.window.showTextDocument(picked.entry.uri, {
    preview: false,
    selection: new vscode.Range(match.line, match.column, match.line, match.column),
  });
}

async function chooseMatchFile(tree: MatchesTreeProvider): Promise<vscode.Uri | undefined> {
  interface FileItem extends vscode.QuickPickItem {
    uri?: vscode.Uri;
    browse?: boolean;
  }

  const activeUri = vscode.window.activeTextEditor?.document.uri;
  const entries = await tree.getMatchEntries();
  const unique = new Map<string, FileItem>();
  if (activeUri?.scheme === "file" && /\.ya?ml$/i.test(activeUri.fsPath)) {
    unique.set(activeUri.fsPath.toLowerCase(), {
      label: `$(file) ${path.basename(activeUri.fsPath)}`,
      description: "Active editor",
      uri: activeUri,
    });
  }
  for (const entry of entries) {
    unique.set(entry.uri.fsPath.toLowerCase(), {
      label: `$(file) ${entry.fileLabel}`,
      description: entry.uri.fsPath,
      uri: entry.uri,
    });
  }

  const picked = await vscode.window.showQuickPick<FileItem>(
    [
      ...unique.values(),
      { label: "$(folder-opened) Browse for a match file...", browse: true },
    ],
    { placeHolder: "Select the YAML file that will receive the form match" }
  );
  if (!picked) {
    return undefined;
  }
  if (picked.uri) {
    return picked.uri;
  }

  let defaultUri: vscode.Uri | undefined;
  try {
    defaultUri = vscode.Uri.file(path.join((await getEspansoPaths()).config, "match"));
  } catch {
    // The native picker remains usable even when Espanso CLI discovery fails.
  }
  return (
    await vscode.window.showOpenDialog({
      defaultUri,
      canSelectMany: false,
      canSelectFiles: true,
      canSelectFolders: false,
      filters: { "YAML match files": ["yml", "yaml"] },
      title: "Select an Espanso match file",
    })
  )?.[0];
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
