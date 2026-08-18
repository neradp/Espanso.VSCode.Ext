// Copyright (c) the Espanso.VSCode.Ext project contributors.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parse } from "yaml";
import {
  appendFormMatchYaml,
  createFormMatchYaml,
  parseFormMatchYaml,
  replaceFormMatchYaml,
} from "./formMatch";

const form = {
  trigger: ":contact",
  label: "Contact card",
  layout: "Dear [[name]],\n[[message]]\nPriority: [[priority]]",
  fields: [
    { name: "name", type: "text" as const },
    { name: "message", type: "multiline" as const, defaultValue: "Hello" },
    { name: "priority", type: "choice" as const, values: ["Low", "High"] },
  ],
};

test("generates an espanso form match with configured fields", () => {
  const parsed = parse(`matches:\n${createFormMatchYaml(form)}\n`);
  assert.equal(parsed.matches[0].trigger, ":contact");
  assert.equal(parsed.matches[0].label, "Contact card");
  assert.equal(parsed.matches[0].form, form.layout);
  assert.deepEqual(parsed.matches[0].form_fields, {
    message: { multiline: true, default: "Hello" },
    priority: { type: "choice", values: ["Low", "High"] },
  });
});

test("appends to a populated matches block without reformatting existing YAML", () => {
  const source = "# keep this comment\nmatches:\n  - trigger: ':old'\n    replace: Old\nother: value\n";
  const result = appendFormMatchYaml(source, form);
  assert.ok(result.startsWith(source.slice(0, source.indexOf("other:"))));
  assert.equal(parse(result).matches.length, 2);
  assert.ok(result.indexOf(":contact") < result.indexOf("other: value"));
});

test("replaces an empty flow sequence and can create a missing matches key", () => {
  const emptyResult = appendFormMatchYaml("imports: []\nmatches: []\n", form);
  assert.equal(parse(emptyResult).matches.length, 1);

  const missingResult = appendFormMatchYaml("imports: []\n", form);
  assert.equal(parse(missingResult).matches.length, 1);
});

test("rejects duplicate fields and choices without values", () => {
  assert.throws(
    () => createFormMatchYaml({ ...form, fields: [{ name: "name", type: "text" }, { name: "name", type: "text" }] }),
    /more than once/
  );
  assert.throws(
    () => createFormMatchYaml({ ...form, fields: [{ name: "priority", type: "choice", values: [] }] }),
    /at least one value/
  );
  assert.throws(
    () => createFormMatchYaml({ ...form, fields: [...form.fields, { name: "missing", type: "text" }] }),
    /not referenced/
  );
});

test("generates verbose form syntax for shell result processing", () => {
  const parsed = parse(`matches:\n${createFormMatchYaml({
    ...form,
    result: {
      type: "shell",
      name: "output",
      replacement: "Processed: {{output}}",
      shell: "powershell",
      command: "Write-Output $env:ESPANSO_FORM1_MESSAGE",
    },
  })}\n`);

  assert.equal(parsed.matches[0].form, undefined);
  assert.equal(parsed.matches[0].replace, "Processed: {{output}}");
  assert.deepEqual(parsed.matches[0].vars, [
    {
      name: "form1",
      type: "form",
      params: {
        layout: form.layout,
        fields: {
          message: { multiline: true, default: "Hello" },
          priority: { type: "choice", values: ["Low", "High"] },
        },
      },
    },
    {
      name: "output",
      type: "shell",
      params: {
        cmd: "Write-Output $env:ESPANSO_FORM1_MESSAGE",
        shell: "powershell",
      },
    },
  ]);
});

test("generates and validates script result processing", () => {
  const parsed = parse(`matches:\n${createFormMatchYaml({
    ...form,
    result: {
      type: "script",
      name: "rendered",
      replacement: "",
      args: ["python", "%CONFIG%/scripts/render.py"],
      trim: false,
    },
  })}\n`);

  assert.equal(parsed.matches[0].replace, "{{rendered}}");
  assert.deepEqual(parsed.matches[0].vars[1], {
    name: "rendered",
    type: "script",
    params: { args: ["python", "%CONFIG%/scripts/render.py"], trim: false },
  });
  assert.throws(
    () => createFormMatchYaml({
      ...form,
      result: { type: "script", name: "output", replacement: "", args: [] },
    }),
    /executable/
  );
});

test("parses and replaces an existing form without changing adjacent matches", () => {
  const source = [
    "matches:",
    "  - trigger: :before",
    "    replace: Before",
    "  - trigger: :contact",
    "    label: Existing form",
    "    form: 'Hello [[name]]: [[message]]'",
    "    form_fields:",
    "      message:",
    "        multiline: true",
    "    word: true",
    "  - trigger: :after",
    "    replace: After",
    "",
  ].join("\n");

  const existing = parseFormMatchYaml(source, 1);
  assert.deepEqual(existing, {
    trigger: ":contact",
    label: "Existing form",
    layout: "Hello [[name]]: [[message]]",
    fields: [
      { name: "name", type: "text" },
      { name: "message", type: "multiline" },
    ],
    result: undefined,
  });

  const updated = replaceFormMatchYaml(source, 1, { ...existing, trigger: ":edited" });
  const parsed = parse(updated);
  assert.equal(parsed.matches.length, 3);
  assert.equal(parsed.matches[0].trigger, ":before");
  assert.equal(parsed.matches[1].trigger, ":edited");
  assert.equal(parsed.matches[1].word, true);
  assert.equal(parsed.matches[2].trigger, ":after");
});

test("parses an existing processed form", () => {
  const source = `matches:\n${createFormMatchYaml({
    ...form,
    result: {
      type: "shell",
      name: "output",
      replacement: "Result: {{output}}",
      command: "echo test",
      shell: "cmd",
      trim: false,
    },
  })}\n`;

  assert.deepEqual(parseFormMatchYaml(source, 0), {
    ...form,
    result: {
      type: "shell",
      name: "output",
      replacement: "Result: {{output}}",
      command: "echo test",
      shell: "cmd",
      trim: false,
    },
  });
});