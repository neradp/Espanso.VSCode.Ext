// Copyright (c) the Espanso.VSCode.Ext project contributors.

import { randomBytes } from "node:crypto";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  appendFormMatchYaml,
  type FormFieldInput,
  type FormFieldType,
  type FormMatchInput,
} from "../espanso/formMatch";

interface SaveFormMessage {
  command: "save";
  trigger: unknown;
  label: unknown;
  layout: unknown;
  fields: unknown;
}

/** A focused visual editor that appends one form match to an existing YAML file. */
export class FormEditorPanel {
  static open(target: vscode.Uri, onSaved: () => void): FormEditorPanel {
    return new FormEditorPanel(target, onSaved);
  }

  private readonly panel: vscode.WebviewPanel;

  private constructor(
    private readonly target: vscode.Uri,
    private readonly onSaved: () => void
  ) {
    this.panel = vscode.window.createWebviewPanel(
      "espansoFormEditor",
      `Espanso Form: ${path.basename(target.fsPath)}`,
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );
    this.panel.webview.html = this.getHtml();
    this.panel.webview.onDidReceiveMessage((message: unknown) => void this.handleMessage(message));
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (isCommand(message, "cancel")) {
      this.panel.dispose();
      return;
    }
    if (!isSaveMessage(message)) {
      return;
    }

    try {
      const input = parseFormInput(message);
      const document = await vscode.workspace.openTextDocument(this.target);
      const updated = appendFormMatchYaml(document.getText(), input);
      const edit = new vscode.WorkspaceEdit();
      edit.replace(
        this.target,
        new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)),
        updated
      );
      if (!(await vscode.workspace.applyEdit(edit))) {
        throw new Error("VS Code rejected the workspace edit.");
      }

      await vscode.window.showTextDocument(document, { preview: false });
      this.onSaved();
      this.panel.dispose();
      void vscode.window.showInformationMessage(`Form added to ${path.basename(this.target.fsPath)}.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await this.panel.webview.postMessage({ command: "error", message: detail });
    }
  }

  private getHtml(): string {
    const nonce = randomBytes(16).toString("base64");
    const targetName = escapeHtml(path.basename(this.target.fsPath));
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <title>Espanso Form Editor</title>
  <style nonce="${nonce}">
    :root { color-scheme: light dark; }
    body { margin: 0; padding: 24px; color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); }
    main { width: min(760px, 100%); margin: 0 auto; }
    h1 { margin: 0; font-size: 22px; font-weight: 600; }
    .target { margin: 6px 0 24px; color: var(--vscode-descriptionForeground); }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    label { display: grid; gap: 6px; font-size: 13px; font-weight: 600; }
    input, select, textarea { box-sizing: border-box; width: 100%; border: 1px solid var(--vscode-input-border, transparent); padding: 8px 10px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); font: inherit; }
    input:focus, select:focus, textarea:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
    textarea { min-height: 150px; resize: vertical; font-family: var(--vscode-editor-font-family); }
    section { margin-top: 24px; border-top: 1px solid var(--vscode-panel-border); padding-top: 18px; }
    .section-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    h2 { margin: 0; font-size: 16px; font-weight: 600; }
    .field { display: grid; grid-template-columns: minmax(110px, 1fr) 120px minmax(120px, 1fr) minmax(150px, 1.4fr) 32px; gap: 8px; margin-bottom: 8px; align-items: start; }
    .field textarea { min-height: 34px; height: 34px; }
    .field:not(.has-values) .field-values { visibility: hidden; }
    button { min-height: 32px; border: 0; padding: 6px 12px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); font: inherit; cursor: pointer; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    button.icon { width: 32px; padding: 0; font-size: 18px; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 24px; }
    .error { min-height: 20px; margin-top: 14px; color: var(--vscode-errorForeground); }
    .hint { margin: 5px 0 0; color: var(--vscode-descriptionForeground); font-size: 12px; font-weight: 400; }
    @media (max-width: 600px) { body { padding: 16px; } .grid, .field { grid-template-columns: 1fr; } .field button.icon { justify-self: end; } }
  </style>
</head>
<body>
  <main>
    <h1>Create Espanso form</h1>
    <p class="target">Target: ${targetName}</p>
    <div class="grid">
      <label>Trigger <input id="trigger" required value=":" placeholder=":contact"></label>
      <label>Label <input id="label" placeholder="Contact message"></label>
    </div>
    <section>
      <label>Form layout
        <textarea id="layout" required placeholder="Dear [[name]],&#10;&#10;[[message]]"></textarea>
        <span class="hint">Reference fields with [[field_name]]. Plain text fields need no extra configuration.</span>
      </label>
    </section>
    <section>
      <div class="section-title"><h2>Field configuration</h2><button id="add" class="secondary" type="button">Add field</button></div>
      <div id="fields"></div>
    </section>
    <div id="error" class="error" role="alert"></div>
    <div class="actions"><button id="cancel" class="secondary" type="button">Cancel</button><button id="save" type="button">Add form</button></div>
  </main>
  <template id="field-template">
    <div class="field">
      <input class="field-name" aria-label="Field name" placeholder="field_name">
      <select class="field-type" aria-label="Field type"><option value="text">Text</option><option value="multiline">Multiline</option><option value="choice">Choice</option><option value="list">List</option></select>
      <input class="field-default" aria-label="Default value" placeholder="Default value">
      <textarea class="field-values" aria-label="Field values" placeholder="Values, one per line"></textarea>
      <button class="remove icon secondary" type="button" title="Remove field" aria-label="Remove field">&times;</button>
    </div>
  </template>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const fields = document.getElementById('fields');
    const template = document.getElementById('field-template');
    const error = document.getElementById('error');

    function addField() {
      const row = template.content.firstElementChild.cloneNode(true);
      const type = row.querySelector('.field-type');
      type.addEventListener('change', () => {
        const hasValues = type.value === 'choice' || type.value === 'list';
        row.classList.toggle('has-values', hasValues);
      });
      row.querySelector('.remove').addEventListener('click', () => row.remove());
      fields.appendChild(row);
    }

    document.getElementById('add').addEventListener('click', addField);
    document.getElementById('cancel').addEventListener('click', () => vscode.postMessage({ command: 'cancel' }));
    document.getElementById('save').addEventListener('click', () => {
      error.textContent = '';
      const configuredFields = [...fields.querySelectorAll('.field')].map((row) => {
        const type = row.querySelector('.field-type').value;
        return {
          name: row.querySelector('.field-name').value,
          type,
          defaultValue: row.querySelector('.field-default').value,
          values: row.querySelector('.field-values').value.split(/\\r?\\n/),
        };
      });
      vscode.postMessage({
        command: 'save',
        trigger: document.getElementById('trigger').value,
        label: document.getElementById('label').value,
        layout: document.getElementById('layout').value,
        fields: configuredFields,
      });
    });
    window.addEventListener('message', (event) => {
      if (event.data?.command === 'error') error.textContent = event.data.message;
    });
    addField();
  </script>
</body>
</html>`;
  }
}

function isCommand(value: unknown, command: string): value is { command: string } {
  return typeof value === "object" && value !== null && "command" in value && value.command === command;
}

function isSaveMessage(value: unknown): value is SaveFormMessage {
  return isCommand(value, "save") && "trigger" in value && "layout" in value && "fields" in value;
}

function parseFormInput(message: SaveFormMessage): FormMatchInput {
  if (typeof message.trigger !== "string" || typeof message.layout !== "string") {
    throw new TypeError("Trigger and form layout must be text.");
  }
  if (!Array.isArray(message.fields)) {
    throw new TypeError("Invalid form field configuration.");
  }

  const fields: FormFieldInput[] = message.fields.map((value) => {
    if (typeof value !== "object" || value === null) {
      throw new Error("Invalid form field configuration.");
    }
    const record = value as Record<string, unknown>;
    if (typeof record.name !== "string" || !isFieldType(record.type)) {
      throw new Error("Every form field needs a valid name and type.");
    }
    return {
      name: record.name,
      type: record.type,
      defaultValue: typeof record.defaultValue === "string" ? record.defaultValue : undefined,
      values: Array.isArray(record.values)
        ? record.values.filter((item): item is string => typeof item === "string")
        : undefined,
    };
  });

  return {
    trigger: message.trigger,
    label: typeof message.label === "string" ? message.label : undefined,
    layout: message.layout,
    fields,
  };
}

function isFieldType(value: unknown): value is FormFieldType {
  return value === "text" || value === "multiline" || value === "choice" || value === "list";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}