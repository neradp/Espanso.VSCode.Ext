// Copyright (c) the Espanso.VSCode.Ext project contributors.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseEspansoPathOutput } from "./cli";

test("parses espanso path output", () => {
  const output = [
    "Config: C:\\Users\\me\\AppData\\Roaming\\espanso",
    "Packages: C:\\Users\\me\\AppData\\Roaming\\espanso\\match\\packages",
    "Runtime: C:\\Users\\me\\AppData\\Local\\espanso",
  ].join("\r\n");
  const paths = parseEspansoPathOutput(output);
  assert.ok(paths);
  assert.equal(paths.config, "C:\\Users\\me\\AppData\\Roaming\\espanso");
  assert.equal(paths.packages, "C:\\Users\\me\\AppData\\Roaming\\espanso\\match\\packages");
  assert.equal(paths.runtime, "C:\\Users\\me\\AppData\\Local\\espanso");
});

test("returns undefined for unexpected output", () => {
  assert.equal(parseEspansoPathOutput("garbage"), undefined);
  assert.equal(parseEspansoPathOutput(""), undefined);
});
