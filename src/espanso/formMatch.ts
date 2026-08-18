// Copyright (c) the Espanso.VSCode.Ext project contributors.

// Generates form matches independently of the VS Code UI. The supported field
// shapes mirror espanso's official match schema:
// https://github.com/espanso/espanso/blob/dev/schemas/match.schema.json

import { isMap, isSeq, parseDocument, stringify } from "yaml";

export type FormFieldType = "text" | "multiline" | "choice" | "list";

export interface FormFieldInput {
  name: string;
  type: FormFieldType;
  defaultValue?: string;
  values?: string[];
}

export interface FormMatchInput {
  trigger: string;
  label?: string;
  layout: string;
  fields: FormFieldInput[];
}

/** Builds one sequence item, indented for insertion under a top-level `matches:` key. */
export function createFormMatchYaml(input: FormMatchInput): string {
  const trigger = input.trigger.trim();
  if (!trigger) {
    throw new Error("Trigger is required.");
  }
  if (!input.layout.trim()) {
    throw new Error("Form layout is required.");
  }

  const match: Record<string, unknown> = { trigger };
  const label = input.label?.trim();
  if (label) {
    match.label = label;
  }
  match.form = input.layout;

  const formFields: Record<string, Record<string, unknown>> = {};
  const seenNames = new Set<string>();
  for (const field of input.fields) {
    const name = field.name.trim();
    if (!name) {
      throw new Error("Every configured field needs a name.");
    }
    if (seenNames.has(name)) {
      throw new Error(`Field '${name}' is configured more than once.`);
    }
    seenNames.add(name);

    const definition: Record<string, unknown> = {};
    if (field.type === "multiline") {
      definition.multiline = true;
    } else if (field.type === "choice" || field.type === "list") {
      const values = field.values?.map((value) => value.trim()).filter(Boolean) ?? [];
      if (values.length === 0) {
        throw new Error(`Field '${name}' needs at least one value.`);
      }
      definition.type = field.type;
      definition.values = values;
    }
    if (field.defaultValue) {
      definition.default = field.defaultValue;
    }

    // Plain text placeholders need no form_fields entry unless they define a default.
    if (Object.keys(definition).length > 0) {
      formFields[name] = definition;
    }
  }
  if (Object.keys(formFields).length > 0) {
    match.form_fields = formFields;
  }

  const mapping = stringify(match, { lineWidth: 0 }).trimEnd().split("\n");
  return mapping
    .map((line, index) => (index === 0 ? `  - ${line}` : `    ${line}`))
    .join("\n");
}

/** Appends a form match to the top-level matches sequence while preserving existing source text. */
export function appendFormMatchYaml(source: string, input: FormMatchInput): string {
  const document = parseDocument(source);
  if (document.errors.length > 0) {
    throw new Error(`Cannot add a form to invalid YAML: ${document.errors[0].message}`);
  }
  if (document.contents !== null && !isMap(document.contents)) {
    throw new Error("The YAML root must be a mapping.");
  }

  const item = createFormMatchYaml(input);
  const matches = document.get("matches", true);
  if (matches === undefined) {
    const separator = source.length === 0 || source.endsWith("\n") ? "" : "\n";
    const blankLine = source.trim().length > 0 ? "\n" : "";
    return `${source}${separator}${blankLine}matches:\n${item}\n`;
  }
  if (!isSeq(matches)) {
    throw new Error("The top-level 'matches' value must be a sequence.");
  }
  if (!matches.range) {
    throw new Error("Unable to locate the matches sequence in the YAML source.");
  }

  if (matches.flow) {
    if (matches.items.length > 0) {
      throw new Error("Convert the flow-style matches sequence to block style before adding a form.");
    }
    return `${source.slice(0, matches.range[0])}\n${item}${source.slice(matches.range[1])}`;
  }

  const offset = matches.range[1];
  const needsNewline = offset > 0 && source[offset - 1] !== "\n";
  return `${source.slice(0, offset)}${needsNewline ? "\n" : ""}${item}\n${source.slice(offset)}`;
}