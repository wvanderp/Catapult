import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { BlobReader, ZipReader } from "@zip.js/zip.js";
import { afterEach, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { createServices } from "../../src/services.js";
import { TuiApp } from "../../src/tui/app.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

it("drives TuiApp with production services from folder selection through a valid ZIP", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "catapult-tui-integration-"));
  roots.push(root);
  const source = path.join(root, "photos");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(source));
  const baseJpeg = await sharp({ create: { width: 24, height: 16, channels: 3, background: "green" } }).jpeg().toBuffer();
  const extraBytes = 4_300_000 - baseJpeg.byteLength;
  const appSegments: Buffer[] = [];
  for (let remaining = extraBytes; remaining > 0;) {
    const payloadSize = Math.min(65_533, remaining - 4);
    if (payloadSize <= 0) break;
    const length = payloadSize + 2;
    appSegments.push(Buffer.from([0xFF, 0xEF, length >> 8, length & 0xFF]), Buffer.alloc(payloadSize, 0x41));
    remaining -= payloadSize + 4;
  }
  await import("node:fs/promises").then(({ writeFile }) => writeFile(path.join(source, "one.jpg"), Buffer.concat([baseJpeg.subarray(0, 2), ...appSegments, baseJpeg.subarray(2)])));
  const services = createServices();
  const { stdin, lastFrame, unmount } = render(<TuiApp services={services} initialFolder={source} onExit={() => {}} />);
  const press = async (key: string): Promise<void> => { stdin.write(key); await new Promise((resolve) => setTimeout(resolve, 60)); };
  const waitFor = async (needle: string, timeout = 60_000): Promise<void> => {
    const deadline = Date.now() + timeout;
    while (!(lastFrame() ?? "").includes(needle) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
    expect(lastFrame() ?? "").toContain(needle);
  };
  try {
    await press("\r");
    await waitFor("OPTIONS");
    await press("\r");
    await waitFor("PHOTOS");
    await press("1");
    await press("\r");
    await waitFor("RAW");
    await press("x");
    await press("\r");
    await waitFor("SUMMARY");
    let estimateMatch: RegExpMatchArray | null = (lastFrame() ?? "").match(/Estimated output: ([\d.]+) MB/u);
    const estimateDeadline = Date.now() + 60_000;
    while (estimateMatch === null && Date.now() < estimateDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      estimateMatch = (lastFrame() ?? "").match(/Estimated output: ([\d.]+) MB/u);
    }
    expect(estimateMatch).not.toBeNull();
    const estimatedBytes = Number(estimateMatch![1]) * 1024 * 1024;
    await press("\r");
    await waitFor("OUTPUT");
    await press("\r");
    await waitFor("Created ");
    const output = path.join(root, "photos.catapult.zip");
    const outputStats = await stat(output);
    expect(outputStats.size).toBeGreaterThan(4_000_000);
    expect(Math.abs(estimatedBytes - outputStats.size) / outputStats.size).toBeLessThanOrEqual(0.1);
    const outputBytes = await readFile(output);
    const reader = new ZipReader(new BlobReader(new Blob([outputBytes])));
    try { const entries = await reader.getEntries(); expect(entries.some((entry) => entry.filename === "manifest.json")).toBe(true); }
    finally { await reader.close(); }
    expect(services.preview.workingDirectory).not.toBe("");
    await expect(stat(services.preview.workingDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  } finally { unmount(); }
});
