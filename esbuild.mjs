// Copyright (c) the Espanso.VSCode.Ext project contributors.

// esbuild driver script, based on the official VS Code bundling guide:
// https://code.visualstudio.com/api/working-with-extensions/bundling-extension
//
// Modes:
//   node esbuild.mjs                 one production-shape dev build of the extension
//   node esbuild.mjs --production    minified build (used by vscode:prepublish)
//   node esbuild.mjs --watch         rebuild on change
//   node esbuild.mjs --tests         bundle unit tests (src/**/*.test.ts) into dist-test/
//                                    for the node:test runner (no vscode module there)

import * as esbuild from "esbuild";
import { globSync } from "node:fs";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");
const tests = process.argv.includes("--tests");

/** Logs esbuild problems in a format the VS Code task problem matcher understands. */
const esbuildProblemMatcherPlugin = {
  name: "esbuild-problem-matcher",
  setup(build) {
    build.onStart(() => console.log("[watch] build started"));
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        if (location) {
          console.error(`    ${location.file}:${location.line}:${location.column}:`);
        }
      });
      console.log("[watch] build finished");
    });
  },
};

async function main() {
  if (tests) {
    // Unit tests are pure Node (no dependency on the vscode module by design, so
    // the YAML/tree logic stays unit-testable). Bundle each test entry separately.
    const entryPoints = globSync("src/**/*.test.ts");
    if (entryPoints.length === 0) {
      console.error("No test files found (src/**/*.test.ts).");
      process.exit(1);
    }
    await esbuild.build({
      entryPoints,
      bundle: true,
      format: "cjs",
      platform: "node",
      outdir: "dist-test",
      sourcemap: true,
      logLevel: "warning",
    });
    return;
  }

  const ctx = await esbuild.context({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    outfile: "dist/extension.js",
    // "vscode" is provided by the extension host at runtime and must not be bundled.
    external: ["vscode"],
    logLevel: "warning",
    plugins: [esbuildProblemMatcherPlugin],
  });

  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
