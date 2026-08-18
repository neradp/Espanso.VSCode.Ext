// Copyright (c) the Espanso.VSCode.Ext project contributors.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parse } from "yaml";
import { appendFormMatchYaml, createFormMatchYaml } from "./formMatch";

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
    () => createFormMatchYaml({ ...form, fields: [{ name: "x", type: "text" }, { name: "x", type: "text" }] }),
    /more than once/
  );
  assert.throws(
    () => createFormMatchYaml({ ...form, fields: [{ name: "x", type: "choice", values: [] }] }),
    /at least one value/
  );
});