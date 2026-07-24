// Copyright (c) the Espanso.VSCode.Ext project contributors.

// espanso CLI discovery and invocation.
//
// The discovery order mirrors the verified C# implementation in the sibling project
// Microsoft.CmdPal.Ext.EspansoSearchBar (EspansoSearchBar/Espanso/EspansoCliRunner.cs):
//   1. A user-configured override (file or folder) from the extension settings.
//   2. Every directory on the process PATH *and* the user PATH read from the registry
//      (HKCU\Environment). The registry read matters because `espanso env-path register`
//      only writes HKCU\Environment\Path (espanso/src/path/win.rs), and a long-lived
//      process started before that registration does not see the new PATH.
//   3. The official installer defaults: %LOCALAPPDATA%\Programs\Espanso (per-user)
//      and %ProgramFiles%\Espanso (admin install) — Inno Setup "{autopf}\Espanso".
//   4. Bare executable name as a last resort (OS PATH resolution at spawn time).
// In every directory espansod.exe (the real binary the Windows installer ships) is
// preferred over espanso.exe; espanso.cmd is just a one-line shim around espansod.exe.

import { execFile, execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DAEMON_EXECUTABLE = "espansod.exe";
const CLI_EXECUTABLE = "espanso.exe";

export interface EspansoCliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface EspansoPaths {
  config: string;
  packages: string;
  runtime: string;
}

let executableOverride: string | undefined;
let cachedPath: string | undefined;

/** Sets the user-configured executable path (file or folder) and invalidates the cache. */
export function setExecutableOverride(value: string | undefined): void {
  const normalized = value?.trim() || undefined;
  if (normalized !== executableOverride) {
    executableOverride = normalized;
    cachedPath = undefined;
  }
}

/** Resolved full path to the espanso executable (cached until the override changes). */
export function getExecutablePath(): string {
  cachedPath ??= resolveExecutablePath();
  return cachedPath;
}

/**
 * Runs `espanso <args>` and captures its output. Non-zero exit codes are returned,
 * not thrown; a missing executable rejects and should be surfaced as a friendly
 * "espanso is not installed" message by the caller.
 */
export async function runEspanso(args: string[], timeoutMs = 10_000): Promise<EspansoCliResult> {
  try {
    const { stdout, stderr } = await execFileAsync(getExecutablePath(), args, {
      timeout: timeoutMs,
      windowsHide: true,
      encoding: "utf8",
    });
    return { exitCode: 0, stdout, stderr };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { code?: unknown; stdout?: string; stderr?: string };
    if (typeof e.code === "number") {
      // The process ran but exited non-zero; report it instead of throwing.
      return { exitCode: e.code, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
    }
    throw err;
  }
}

/**
 * Locates espanso's folders via `espanso path` (espanso/src/cli/path.rs), which prints:
 *   Config: <path>
 *   Packages: <path>
 *   Runtime: <path>
 */
export async function getEspansoPaths(): Promise<EspansoPaths> {
  const result = await runEspanso(["path"]);
  if (result.exitCode !== 0) {
    throw new Error(`'espanso path' failed: ${result.stderr || result.stdout}`);
  }
  const paths = parseEspansoPathOutput(result.stdout);
  if (!paths) {
    throw new Error(`Unexpected 'espanso path' output: ${result.stdout}`);
  }
  return paths;
}

/** Exported separately so the parsing stays unit-testable without spawning espanso. */
export function parseEspansoPathOutput(output: string): EspansoPaths | undefined {
  const entries = new Map<string, string>();
  for (const line of output.split(/\r?\n/)) {
    const match = /^(\w+):\s*(.+)$/.exec(line.trim());
    if (match) {
      entries.set(match[1].toLowerCase(), match[2].trim());
    }
  }
  const config = entries.get("config");
  const packages = entries.get("packages");
  const runtime = entries.get("runtime");
  if (!config || !packages || !runtime) {
    return undefined;
  }
  return { config, packages, runtime };
}

function resolveExecutablePath(): string {
  if (executableOverride) {
    if (isFile(executableOverride)) {
      return executableOverride;
    }
    if (isDirectory(executableOverride)) {
      const found = findInDirectory(executableOverride);
      if (found) {
        return found;
      }
    }
    // Fall through to auto-discovery on a stale setting rather than hard-failing.
  }

  if (process.platform !== "win32") {
    // On macOS/Linux espanso installs a normal `espanso` binary on PATH.
    return "espanso";
  }

  for (const directory of enumerateCandidateDirectories()) {
    const found = findInDirectory(directory);
    if (found) {
      return found;
    }
  }

  return CLI_EXECUTABLE;
}

function findInDirectory(directory: string): string | undefined {
  for (const name of [DAEMON_EXECUTABLE, CLI_EXECUTABLE]) {
    const candidate = path.join(directory.trim(), name);
    if (isFile(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function* enumerateCandidateDirectories(): Generator<string> {
  const seen = new Set<string>();
  const add = (dir: string): boolean => {
    const key = dir.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  };

  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (dir && add(dir)) {
      yield dir;
    }
  }

  // User PATH straight from the registry — the authoritative location espanso writes to.
  for (const dir of readUserPathFromRegistry().split(path.delimiter)) {
    if (dir && add(dir)) {
      yield dir;
    }
  }

  const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
  yield path.join(localAppData, "Programs", "Espanso");

  const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
  yield path.join(programFiles, "Espanso");
}

function readUserPathFromRegistry(): string {
  try {
    // Node has no built-in registry API; reg.exe is always available on Windows.
    // `reg query` prints:  "    Path    REG_EXPAND_SZ    C:\foo;C:\bar"
    const output = execFileSync("reg.exe", ["query", "HKCU\\Environment", "/v", "Path"], {
      encoding: "utf8",
      windowsHide: true,
    });
    const match = /^\s*Path\s+REG(?:_EXPAND)?_SZ\s+(.+)$/im.exec(output);
    if (!match) {
      return "";
    }
    // Manually expand %VAR% since REG_EXPAND_SZ values come back unexpanded from reg.exe.
    return match[1].trim().replace(/%([^%]+)%/g, (_, name: string) => process.env[name] ?? `%${name}%`);
  } catch {
    // Registry access is best-effort; discovery continues with the other sources.
    return "";
  }
}

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}
