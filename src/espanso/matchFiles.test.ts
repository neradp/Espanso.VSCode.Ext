// Copyright (c) the Espanso.VSCode.Ext project contributors.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseMatchFile } from "./matchFiles";

test("parses a basic match with trigger and replace", () => {
  const result = parseMatchFile(
    ["matches:", '  - trigger: ":hello"', '    replace: "Hello World"'].join("\n")
  );
  assert.equal(result.errors.length, 0);
  assert.equal(result.matches.length, 1);
  assert.deepEqual(result.matches[0].triggers, [":hello"]);
  assert.equal(result.matches[0].replacePreview, "Hello World");
  assert.equal(result.matches[0].line, 1);
});

test("parses multi-trigger, regex and label", () => {
  const result = parseMatchFile(
    [
      "matches:",
      "  - triggers: [':a', ':b']",
      "    label: Multi",
      "    replace: x",
      "  - regex: 'greet\\((?P<name>.*)\\)'",
      "    replace: y",
    ].join("\n")
  );
  assert.equal(result.matches.length, 2);
  assert.deepEqual(result.matches[0].triggers, [":a", ":b"]);
  assert.equal(result.matches[0].label, "Multi");
  assert.deepEqual(result.matches[1].triggers, ["/greet\\((?P<name>.*)\\)/"]);
});

test("collects imports", () => {
  const result = parseMatchFile(
    ["imports:", '  - "../other/file.yml"', "matches: []"].join("\n")
  );
  assert.deepEqual(result.imports, ["../other/file.yml"]);
  assert.equal(result.matches.length, 0);
});

test("reports YAML syntax errors without throwing", () => {
  const result = parseMatchFile("matches:\n  - trigger: :x\n   bad indent");
  assert.ok(result.errors.length > 0);
});

test("skips entries without any trigger", () => {
  const result = parseMatchFile(
    ["matches:", "  - replace: no trigger here", '  - trigger: ":ok"', "    replace: fine"].join("\n")
  );
  assert.equal(result.matches.length, 1);
  assert.deepEqual(result.matches[0].triggers, [":ok"]);
});

test("multiline replace preview shows only the first line", () => {
  const result = parseMatchFile(
    ["matches:", '  - trigger: ":ml"', "    replace: |", "      first line", "      second line"].join("\n")
  );
  assert.equal(result.matches[0].replacePreview, "first line");
});
