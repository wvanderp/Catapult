#!/usr/bin/env node
import { render } from "ink";
import { createRequire } from "node:module";
import { createServices } from "./services.js";
import { TuiApp } from "./tui/app.js";
import { TuiController } from "./tui/controller.js";

const require = createRequire(import.meta.url);
const cliVersion = require("../package.json").version as string;

/**
 * Start the interactive companion CLI or report when a terminal is unavailable.
 *
 * @param argv Parsed command-line arguments.
 * @returns The process exit code for the requested command.
 */
async function main(argv = process.argv.slice(2)): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write("Catapult companion CLI\n\nUsage: package-photos [source-folder]\n\nPrepare a Catapult photo package from JPEG and TIFF originals.\n");
    return 0;
  }
  if (argv.includes("--version") || argv.includes("-v")) {
    process.stdout.write(`${cliVersion}\n`);
    return 0;
  }
  const unexpected = argv.find((argument) => argument.startsWith("-") && argument !== "-");
  if (unexpected) {
    process.stderr.write(`Unknown option: ${unexpected}\nUse --help for usage.\n`);
    return 2;
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write("Catapult's interactive companion CLI needs a TTY. Run it from a terminal, or use --help for usage.\n");
    return 1;
  }
  const folder = stripQuotes(argv[0] ?? "");
  const lifecycle = new TuiController();
  const app = render(<TuiApp services={createServices()} initialFolder={folder} lifecycle={lifecycle} onExit={() => app.unmount()} />, { exitOnCtrlC: false });
  let signalExit: Promise<void> | null = null;
  const handleSignal = (): void => {
    if (signalExit) return;
    signalExit = lifecycle.dispose().then(() => { app.unmount(); process.exitCode = 130; });
  };
  process.on("SIGINT", handleSignal);
  process.on("SIGTERM", handleSignal);
  process.on("SIGHUP", handleSignal);
  await app.waitUntilExit();
  if (signalExit) await signalExit;
  process.off("SIGINT", handleSignal);
  process.off("SIGTERM", handleSignal);
  process.off("SIGHUP", handleSignal);
  return process.exitCode === 130 ? 130 : 0;
}

/**
 * Remove a single matching quote pair from a positional path.
 *
 * @param value Positional path value from the command line.
 * @returns The path with a single matching quote pair removed.
 */
function stripQuotes(value: string): string {
  const trimmed = value.trim();
  return trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) ? trimmed.slice(1, -1) : trimmed;
}

void main().then((code) => { process.exitCode = code; });
