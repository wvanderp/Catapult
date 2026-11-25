import { createHash } from "node:crypto";
import { PassThrough, Writable } from "node:stream";
import { Text } from "ink";
import { render } from "ink-testing-library";
import { ZipWriter, Uint8ArrayReader } from "@zip.js/zip.js";
import { describe, expect, it } from "vitest";

describe("CLI dependency contracts", () => {
  it("Ink 8 testing-library-compatible renderer handles a trivial component", async () => {
    const app = render(<Text>Ink works</Text>);
    expect(app.lastFrame()).toContain("Ink works");
    app.unmount();
  });

  it("zip.js streams STORE ZIP64 output to a Node writable with verifiable bytes", async () => {
    const chunks: Buffer[] = [];
    const destination = new PassThrough();
    destination.on("data", (chunk: Buffer) => { chunks.push(Buffer.from(chunk)); });
    const writer = new ZipWriter(Writable.toWeb(destination) as WritableStream<Uint8Array>, { zip64: true });
    await writer.add("payload.bin", new Uint8ArrayReader(new TextEncoder().encode("stream proof")), { compressionMethod: 0, zip64: true });
    await writer.close();
    const bytes = Buffer.concat(chunks);
    expect(bytes.length).toBeGreaterThan(22);
    expect(createHash("sha256").update(bytes).digest("hex")).toMatch(/^[a-f0-9]{64}$/);
    expect(bytes.includes(Buffer.from("payload.bin"))).toBe(true);
  });
});
