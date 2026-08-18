// Copyright (c) the Espanso.VSCode.Ext project contributors.

import { randomBytes } from "node:crypto";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  appendFormMatchYaml,
  type FormFieldInput,
  type FormFieldType,
  type FormMatchInput,
  type FormResultInput,
} from "../espanso/formMatch";

interface SaveFormMessage {
  command: "save";
  trigger: unknown;
  label: unknown;
  layout: unknown;
  fields: unknown;
  result: unknown;
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
    .field-tools { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    .field { display: grid; grid-template-columns: minmax(130px, 1fr) 120px minmax(120px, 1fr) minmax(150px, 1.4fr) 32px; gap: 8px; margin-bottom: 8px; align-items: start; }
    .field code { min-height: 34px; box-sizing: border-box; padding: 8px 10px; overflow: hidden; color: var(--vscode-textPreformat-foreground); background: var(--vscode-textCodeBlock-background); text-overflow: ellipsis; white-space: nowrap; }
    .field textarea { min-height: 34px; height: 34px; }
    .field:not(.has-values) .field-values { visibility: hidden; }
    .empty-fields { color: var(--vscode-descriptionForeground); font-size: 12px; }
    .result-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; margin-top: 12px; }
    .result-grid .wide { grid-column: 1 / -1; }
    .result-grid textarea { min-height: 88px; }
    .is-hidden { display: none; }
    label.checkbox { display: flex; flex-direction: row; align-items: center; gap: 8px; font-weight: 400; }
    label.checkbox input { width: auto; }
    button { min-height: 32px; border: 0; padding: 6px 12px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); font: inherit; cursor: pointer; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    button.icon { width: 32px; padding: 0; font-size: 18px; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 24px; }
    .error { min-height: 20px; margin-top: 14px; color: var(--vscode-errorForeground); }
    .hint { margin: 5px 0 0; color: var(--vscode-descriptionForeground); font-size: 12px; font-weight: 400; }
    @media (max-width: 600px) { body { padding: 16px; } .grid, .field, .result-grid { grid-template-columns: 1fr; } .result-grid .wide { grid-column: auto; } .field button.icon { justify-self: end; } }
  </style>
</head>
<body>
  <main>
    <h1>Create Espanso form match</h1>
    <p class="target">Target: ${targetName}</p>
    <div class="grid">
      <label>Trigger <input id="trigger" required placeholder=":birthday"></label>
      <label>Match label (optional)
        <input id="label" placeholder="Birthday greeting">
        <span class="hint">Shown in the matches tree and search results.</span>
      </label>
    </div>
    <section>
      <label>Form layout
        <textarea id="layout" required placeholder="Hello [[name]],&#10;&#10;Happy birthday!"></textarea>
        <span class="hint">Select text and choose a field type below, or type [[field_name]] directly.</span>
      </label>
      <div class="field-tools" aria-label="Insert form field">
        <button class="secondary field-tool" data-type="text" type="button">Single-line</button>
        <button class="secondary field-tool" data-type="multiline" type="button">Multiline</button>
        <button class="secondary field-tool" data-type="choice" type="button">Choice</button>
        <button class="secondary field-tool" data-type="list" type="button">List</button>
      </div>
    </section>
    <section>
      <div class="section-title"><h2>Fields</h2></div>
      <div id="fields"><div class="empty-fields">No fields in the form layout.</div></div>
    </section>
    <section>
      <div class="section-title"><h2>Process submitted values</h2></div>
      <label>Result mode
        <select id="result-type">
          <option value="none">Insert form values directly</option>
          <option value="shell">Shell command</option>
          <option value="script">Script</option>
        </select>
      </label>
      <div id="result-settings" class="result-grid is-hidden">
        <label>Result variable <input id="result-name" value="output" placeholder="output"></label>
        <label>Final replacement <input id="replacement" value="{{output}}" placeholder="{{output}}"></label>
        <label id="shell-choice">Shell
          <select id="shell">
            <option value="">System default</option>
            <option value="powershell">Windows PowerShell</option>
            <option value="pwsh">PowerShell</option>
            <option value="cmd">Command Prompt</option>
            <option value="bash">Bash</option>
            <option value="sh">sh</option>
            <option value="wsl">WSL</option>
            <option value="nu">Nushell</option>
          </select>
        </label>
        <label id="shell-command" class="wide">Command
          <textarea id="command" placeholder="Write-Output $env:ESPANSO_FORM1_NAME"></textarea>
          <span class="hint">Use {{form1.field_name}} in parameters or ESPANSO_FORM1_FIELD_NAME in the process environment.</span>
        </label>
        <label id="script-args" class="wide is-hidden">Command and arguments, one per line
          <textarea id="args" placeholder="python&#10;%CONFIG%/scripts/process.py"></textarea>
          <span class="hint">The first line is the executable. Form values are available through ESPANSO_FORM1_FIELD_NAME environment variables.</span>
        </label>
        <label class="checkbox wide"><input id="trim" type="checkbox" checked> Trim surrounding whitespace from the result</label>
      </div>
    </section>
    <div id="error" class="error" role="alert"></div>
    <div class="actions"><button id="cancel" class="secondary" type="button">Cancel</button><button id="save" type="button">Add form</button></div>
  </main>
  <template id="field-template">
    <div class="field">
      <code class="field-name"></code>
      <select class="field-type" aria-label="Field type"><option value="text">Text</option><option value="multiline">Multiline</option><option value="choice">Choice</option><option value="list">List</option></select>
      <input class="field-default" aria-label="Default value" placeholder="Default value">
      <textarea class="field-values" aria-label="Field values" placeholder="Values, one per line"></textarea>
      <button class="remove icon secondary" type="button" title="Convert field back to text" aria-label="Convert field back to text">&times;</button>
    </div>
  </template>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const fields = document.getElementById('fields');
    const template = document.getElementById('field-template');
    const error = document.getElementById('error');
    const layout = document.getElementById('layout');
    const resultType = document.getElementById('result-type');
    const fieldConfigs = new Map();

    function rememberFields() {
      for (const row of fields.querySelectorAll('.field')) {
        fieldConfigs.set(row.dataset.name, {
          type: row.querySelector('.field-type').value,
          defaultValue: row.querySelector('.field-default').value,
          values: row.querySelector('.field-values').value,
        });
      }
    }

    function fieldNames() {
      const names = [];
      const seen = new Set();
      let cursor = 0;
      while (cursor < layout.value.length) {
        const start = layout.value.indexOf('[[', cursor);
        if (start < 0) break;
        const end = layout.value.indexOf(']]', start + 2);
        if (end < 0) break;
        const name = layout.value.slice(start + 2, end).trim();
        if (name && !seen.has(name)) {
          seen.add(name);
          names.push(name);
        }
        cursor = end + 2;
      }
      return names;
    }

    function addField(name) {
      const row = template.content.firstElementChild.cloneNode(true);
      const config = fieldConfigs.get(name) || { type: 'text', defaultValue: '', values: '' };
      row.dataset.name = name;
      row.querySelector('.field-name').textContent = '[[' + name + ']]';
      const type = row.querySelector('.field-type');
      type.value = config.type;
      row.querySelector('.field-default').value = config.defaultValue;
      row.querySelector('.field-values').value = config.values;
      row.classList.toggle('has-values', type.value === 'choice' || type.value === 'list');
      type.addEventListener('change', () => {
        const hasValues = type.value === 'choice' || type.value === 'list';
        row.classList.toggle('has-values', hasValues);
      });
      row.querySelector('.remove').addEventListener('click', () => {
        rememberFields();
        layout.value = layout.value.split('[[' + name + ']]').join(name);
        fieldConfigs.delete(name);
        syncFields();
        layout.focus();
      });
      fields.appendChild(row);
    }

    function syncFields() {
      rememberFields();
      const names = fieldNames();
      fields.replaceChildren();
      for (const name of names) addField(name);
      if (names.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-fields';
        empty.textContent = 'No fields in the form layout.';
        fields.appendChild(empty);
      }
      for (const name of [...fieldConfigs.keys()]) {
        if (!names.includes(name)) fieldConfigs.delete(name);
      }
    }

    function configureField(type) {
      rememberFields();
      const start = layout.selectionStart;
      const end = layout.selectionEnd;
      const selected = layout.value.slice(start, end);
      const trimmed = selected.trim();
      const isExisting = trimmed.startsWith('[[') && trimmed.endsWith(']]') && !trimmed.includes('\n');
      let name = isExisting ? trimmed.slice(2, -2).trim() : trimmed
        .replace(/[ \t]+/g, '_')
        .replace(/[^A-Za-z0-9_]/g, '');
      if (!name) name = 'field';
      if (!isExisting) {
        const used = new Set(fieldNames());
        const base = name;
        let suffix = 2;
        while (used.has(name)) name = base + '_' + suffix++;
        const placeholder = '[[' + name + ']]';
        layout.value = layout.value.slice(0, start) + placeholder + layout.value.slice(end);
        layout.setSelectionRange(start + placeholder.length, start + placeholder.length);
      }
      const current = fieldConfigs.get(name) || { type: 'text', defaultValue: '', values: '' };
      fieldConfigs.set(name, { ...current, type });
      syncFields();
      layout.focus();
    }

    function updateResultControls() {
      const mode = resultType.value;
      document.getElementById('result-settings').classList.toggle('is-hidden', mode === 'none');
      document.getElementById('shell-choice').classList.toggle('is-hidden', mode !== 'shell');
      document.getElementById('shell-command').classList.toggle('is-hidden', mode !== 'shell');
      document.getElementById('script-args').classList.toggle('is-hidden', mode !== 'script');
    }

    layout.addEventListener('input', syncFields);
    for (const button of document.querySelectorAll('.field-tool')) {
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', () => configureField(button.dataset.type));
    }
    resultType.addEventListener('change', updateResultControls);
    document.getElementById('cancel').addEventListener('click', () => vscode.postMessage({ command: 'cancel' }));
    document.getElementById('save').addEventListener('click', () => {
      error.textContent = '';
      const configuredFields = [...fields.querySelectorAll('.field')].map((row) => {
        const type = row.querySelector('.field-type').value;
        return {
          name: row.dataset.name,
          type,
          defaultValue: row.querySelector('.field-default').value,
          values: row.querySelector('.field-values').value.split(/\\r?\\n/),
        };
      });
      const mode = resultType.value;
      let result = null;
      if (mode === 'shell') {
        result = {
          type: mode,
          name: document.getElementById('result-name').value,
          replacement: document.getElementById('replacement').value,
          command: document.getElementById('command').value,
          shell: document.getElementById('shell').value,
          trim: document.getElementById('trim').checked,
        };
      } else if (mode === 'script') {
        result = {
          type: mode,
          name: document.getElementById('result-name').value,
          replacement: document.getElementById('replacement').value,
          args: document.getElementById('args').value.split(/\\r?\\n/),
          trim: document.getElementById('trim').checked,
        };
      }
      vscode.postMessage({
        command: 'save',
        trigger: document.getElementById('trigger').value,
        label: document.getElementById('label').value,
        layout: document.getElementById('layout').value,
        fields: configuredFields,
        result,
      });
    });
    window.addEventListener('message', (event) => {
      if (event.data?.command === 'error') error.textContent = event.data.message;
    });
    updateResultControls();
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
    result: parseResultInput(message.result),
  };
}

function parseResultInput(value: unknown): FormResultInput | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value !== "object") {
    throw new TypeError("Invalid form result configuration.");
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.name !== "string" ||
    typeof record.replacement !== "string" ||
    typeof record.trim !== "boolean"
  ) {
    throw new TypeError("Invalid form result configuration.");
  }
  if (record.type === "shell" && typeof record.command === "string") {
    return {
      type: "shell",
      name: record.name,
      replacement: record.replacement,
      command: record.command,
      shell: typeof record.shell === "string" ? record.shell : undefined,
      trim: record.trim,
    };
  }
  if (record.type === "script" && Array.isArray(record.args)) {
    return {
      type: "script",
      name: record.name,
      replacement: record.replacement,
      args: record.args.filter((argument): argument is string => typeof argument === "string"),
      trim: record.trim,
    };
  }
  throw new TypeError("Invalid form result configuration.");
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