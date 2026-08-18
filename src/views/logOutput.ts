// Copyright (c) the Espanso.VSCode.Ext project contributors.

import * as vscode from "vscode";
import { runEspanso } from "../espanso/cli";

/** Displays `espanso log` in VS Code's native Output panel. */
export class EspansoLogOutput implements vscode.Disposable {
  private readonly output = vscode.window.createOutputChannel("Espanso", "log");

  async show(): Promise<void> {
    this.output.show(true);
    await this.refresh();
  }

  async refresh(): Promise<void> {
    this.output.clear();
    this.output.appendLine(`Espanso log refreshed at ${new Date().toLocaleString()}`);
    this.output.appendLine("");

    try {
      const result = await runEspanso(["log"], 15_000);
      if (result.stdout) {
        this.output.append(result.stdout);
        if (!result.stdout.endsWith("\n")) {
          this.output.appendLine("");
        }
      }
      if (result.stderr) {
        this.output.appendLine("");
        this.output.appendLine(result.stderr);
      }
      if (result.exitCode !== 0) {
        this.output.appendLine("");
        this.output.appendLine(`espanso log exited with code ${result.exitCode}.`);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.output.appendLine(`Unable to read the Espanso log: ${detail}`);
    }
  }

  dispose(): void {
    this.output.dispose();
  }
}