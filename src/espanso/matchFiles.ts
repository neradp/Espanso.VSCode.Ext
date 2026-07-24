// Copyright (c) the Espanso.VSCode.Ext project contributors.

// Parsing of espanso match files with source positions.
//
// Field names verified against espanso's own YAML parser
// (espanso-config/src/matches/group/loader/yaml/parse.rs):
//   top level: imports, global_vars, matches
//   match:     label, trigger, triggers, regex, replace, image_path, form, form_fields,
//              vars, word, left_word, right_word, propagate_case, uppercase_style,
//              force_clipboard, force_mode, markdown, paragraph, html, search_terms
//
// This module is deliberately independent of the vscode API so it can be unit-tested
// with the plain node:test runner.

import { LineCounter, parseDocument, isMap, isSeq, isScalar } from "yaml";

/** A single match extracted from a match file, with its 0-based source position. */
export interface ParsedMatch {
  /** All trigger strings (from `trigger`, `triggers`, or `regex`). */
  triggers: string[];
  /** Optional human-readable label. */
  label?: string;
  /** First line of the replacement, for tooltips (may be undefined for forms/images). */
  replacePreview?: string;
  /** 0-based line of the match entry in the file. */
  line: number;
  /** 0-based column of the match entry in the file. */
  column: number;
}

export interface ParsedMatchFile {
  matches: ParsedMatch[];
  /** Relative paths listed under `imports:`. */
  imports: string[];
  /** YAML parse errors, formatted as human-readable strings. */
  errors: string[];
}

/**
 * Parses the text of one espanso match file. Never throws: syntax errors are
 * collected into `errors` and whatever was parseable is still returned.
 */
export function parseMatchFile(text: string): ParsedMatchFile {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter });

  const result: ParsedMatchFile = {
    matches: [],
    imports: [],
    errors: doc.errors.map((e) => e.message),
  };

  const root = doc.contents;
  if (!isMap(root)) {
    return result;
  }

  const importsNode = root.get("imports", true);
  if (isSeq(importsNode)) {
    for (const item of importsNode.items) {
      if (isScalar(item) && typeof item.value === "string") {
        result.imports.push(item.value);
      }
    }
  }

  const matchesNode = root.get("matches", true);
  if (!isSeq(matchesNode)) {
    return result;
  }

  for (const entry of matchesNode.items) {
    if (!isMap(entry)) {
      continue;
    }

    const triggers: string[] = [];
    const singleTrigger = scalarString(entry.get("trigger", true));
    if (singleTrigger !== undefined) {
      triggers.push(singleTrigger);
    }
    const multiTriggers = entry.get("triggers", true);
    if (isSeq(multiTriggers)) {
      for (const t of multiTriggers.items) {
        const value = scalarString(t);
        if (value !== undefined) {
          triggers.push(value);
        }
      }
    }
    const regex = scalarString(entry.get("regex", true));
    if (regex !== undefined) {
      triggers.push(`/${regex}/`);
    }

    if (triggers.length === 0) {
      // Not a usable match entry (or an unsupported shape); skip silently — the JSON
      // schema is responsible for flagging invalid entries in the editor.
      continue;
    }

    const label = scalarString(entry.get("label", true));
    const replace = scalarString(entry.get("replace", true));

    // Position of the start of the match's mapping (falls back to offset 0).
    const offset = entry.range?.[0] ?? 0;
    const pos = lineCounter.linePos(offset);

    result.matches.push({
      triggers,
      label,
      replacePreview: replace?.split(/\r?\n/, 1)[0],
      line: pos.line - 1,
      column: pos.col - 1,
    });
  }

  return result;
}

function scalarString(node: unknown): string | undefined {
  if (isScalar(node) && (typeof node.value === "string" || typeof node.value === "number")) {
    return String(node.value);
  }
  return undefined;
}
