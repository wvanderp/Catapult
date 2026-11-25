import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tsx = path.resolve(packageDirectory, "node_modules/.bin/tsx");
const cli = path.join(packageDirectory, "src/main.tsx");
const runCli = (script: string, argument: string) => spawnSync(tsx, [script, argument], { cwd: packageDirectory, encoding: "utf8" });

describe("companion CLI process behavior", () => {
  it("supports help and version, rejects unknown flags and non-TTY use", () => {
    const run = (argument: string) => spawnSync(tsx, [cli, argument], { cwd: packageDirectory, encoding: "utf8" });
    expect(run("--help").status).toBe(0);
    expect(run("--version").status).toBe(0);
    expect(run("--bogus").status).not.toBe(0);
    const nonTty = spawnSync(tsx, [cli], { cwd: packageDirectory, encoding: "utf8" });
    expect(nonTty.status).not.toBe(0);
    expect(nonTty.stderr).toContain("needs a TTY");
  }, 60_000);

  it("supports help through the direct entry, a POSIX symlink, and a spaced Unicode path", () => {
    const direct = runCli(cli, "--help");
    expect(direct.status, direct.stderr).toBe(0);
    expect(direct.stdout).toContain("Usage: package-photos");

    if (process.platform !== "win32") {
      const directory = mkdtempSync(path.join(os.tmpdir(), "catapult- cli-猫-"));
      try {
        const scriptLink = path.join(directory, "package-photos.tsx");
        symlinkSync(cli, scriptLink);
        const throughSymlink = runCli(scriptLink, "--help");
        expect(throughSymlink.status, throughSymlink.stderr).toBe(0);
        expect(throughSymlink.stdout).toContain("Usage: package-photos");

        const linkedDirectory = path.join(directory, "linked cli-猫");
        symlinkSync(packageDirectory, linkedDirectory, "dir");
        const spacedScript = path.join(linkedDirectory, "src/main.tsx");
        const throughSpacedPath = runCli(spacedScript, "--help");
        expect(throughSpacedPath.status, throughSpacedPath.stderr).toBe(0);
        expect(throughSpacedPath.stdout).toContain("Usage: package-photos");
      } finally { rmSync(directory, { recursive: true, force: true }); }
    }
  }, 60_000);

  const pythonAvailable = process.platform !== "win32" && spawnSync("python3", ["--version"]).status === 0;
  it.skipIf(!pythonAvailable)("disposes the preview once on SIGTERM and SIGINT", () => {
    for (const signal of ["SIGTERM", "SIGINT"] as const) {
      const directory = mkdtempSync(path.join(os.tmpdir(), "catapult-signal-"));
      const marker = path.join(directory, "dispose-count");
      const python = String.raw`
import os, pty, select, signal, subprocess, sys, time
master, slave = pty.openpty()
env = os.environ.copy(); env["CATAPULT_DISPOSE_MARKER"] = sys.argv[2]
proc = subprocess.Popen([sys.argv[1], "test/tui/fixtures/signalApp.tsx"], cwd=sys.argv[3], stdin=slave, stdout=slave, stderr=slave, env=env, close_fds=True)
os.close(slave)
data = b""
def wait_for(marker):
  global data
  deadline = time.time() + 50
  while marker not in data and time.time() < deadline:
    ready, _, _ = select.select([master], [], [], 0.2)
    if ready:
      try: data = data + os.read(master, 8192)
      except OSError: break
  if marker not in data:
    proc.kill(); raise SystemExit("app did not reach " + repr(marker) + ": " + repr(data[-1000:]))
def press(value): os.write(master, value)
wait_for("•  FOLDER\r\n".encode()); time.sleep(1); press(b"\r")
wait_for("•  OPTIONS\r\n".encode()); press(b"\r")
wait_for("•  PHOTOS\r\n".encode()); press(b"\r")
wait_for("•  RAW\r\n".encode()); press(b"a"); wait_for(b"RAW choices: 1/1 resolved"); press(b"\r")
wait_for("•  PREVIEW\r\n".encode()); wait_for(b"fixture failure")
proc.send_signal(getattr(signal, sys.argv[4]))
try: code = proc.wait(timeout=10)
except subprocess.TimeoutExpired:
  proc.kill(); raise SystemExit("signal did not exit the app")
`;
      try {
        const result = spawnSync("python3", ["-c", python, tsx, marker, packageDirectory, signal], { encoding: "utf8", timeout: 55000 });
        expect(result.status, result.stderr || result.stdout).toBe(0);
        expect(readFileSync(marker, "utf8")).toBe("1");
      } finally { rmSync(directory, { recursive: true, force: true }); }
    }
  }, 60_000);

  it.skipIf(!pythonAvailable)("disposes a preview session created after SIGTERM and SIGINT exactly once", () => {
    for (const [signal, expectedCode] of [["SIGTERM", 143], ["SIGINT", 130]] as const) {
      const directory = mkdtempSync(path.join(os.tmpdir(), "catapult-late-signal-"));
      const marker = path.join(directory, "events");
      const python = String.raw`
import os, pty, select, signal, subprocess, sys, time
master, slave = pty.openpty()
env = os.environ.copy(); env["CATAPULT_DISPOSE_MARKER"] = sys.argv[2]; env["CATAPULT_DELAY_SESSION"] = "1"
proc = subprocess.Popen([sys.argv[1], "test/tui/fixtures/signalApp.tsx"], cwd=sys.argv[3], stdin=slave, stdout=slave, stderr=slave, env=env, close_fds=True)
os.close(slave)
data = b""
def wait_for(marker):
  global data
  deadline = time.time() + 50
  while marker not in data and time.time() < deadline:
    ready, _, _ = select.select([master], [], [], 0.2)
    if ready:
      try: data = data + os.read(master, 8192)
      except OSError: break
  if marker not in data:
    proc.kill(); raise SystemExit("app did not reach " + repr(marker) + ": " + repr(data[-1000:]))
def press(value): os.write(master, value)
wait_for("•  FOLDER\r\n".encode()); time.sleep(1); press(b"\r")
wait_for("•  OPTIONS\r\n".encode()); press(b"\r")
wait_for("•  PHOTOS\r\n".encode()); press(b"\r")
wait_for("•  RAW\r\n".encode()); press(b"a"); wait_for(b"RAW choices: 1/1 resolved"); press(b"\r")
wait_for("•  PREVIEW\r\n".encode())
proc.send_signal(getattr(signal, sys.argv[4]))
try: code = proc.wait(timeout=10)
except subprocess.TimeoutExpired:
  proc.kill(); raise SystemExit("signal did not exit the app")
if code != int(sys.argv[5]): raise SystemExit("expected exit " + sys.argv[5] + ", got " + str(code))
`;
      try {
        const result = spawnSync("python3", ["-c", python, tsx, marker, packageDirectory, signal, String(expectedCode)], { encoding: "utf8", timeout: 55_000 });
        expect(result.status, result.stderr || result.stdout).toBe(0);
        const events = readFileSync(marker, "utf8").trim().split("\n");
        expect(events).toEqual(["session-created", "disposed"]);
        expect(events.filter((event) => event === "disposed")).toHaveLength(1);
      } finally { rmSync(directory, { recursive: true, force: true }); }
    }
  }, 60_000);
});
