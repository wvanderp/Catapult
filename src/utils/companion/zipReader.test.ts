import { describe, expect, it } from "vitest";
import { BlobReader, BlobWriter, ZipWriter } from "@zip.js/zip.js";
import { inspectZip, verifiedPreview } from "./zipReader";
import { archive } from "./testFixtures";

/**
 *
 * @param options
 * @param options.dataDescriptor
 * @param options.zip64
 * @param options.directory
 * @param options.extra
 */
describe("ZIP reader structural validation", () => {
  it("checks local headers and metadata with bounded concurrent ZIP reads", async () => {
    const file = await archive(Array.from({ length: 8 }, (_, index) => ({ id: `photo-${index}`, filename: `photo-${index}.jpg` })));
    let active = 0;
    let maximum = 0;
    const slice = file.slice.bind(file);
    Object.defineProperty(file, "slice", { value: (...arguments_: [number?, number?, string?]) => {
      const blob = slice(...arguments_);
      const arrayBuffer = blob.arrayBuffer.bind(blob);
      Object.defineProperty(blob, "arrayBuffer", { value: async () => {
        active++;
        maximum = Math.max(maximum, active);
        try { await new Promise((resolve) => setTimeout(resolve, 1)); return await arrayBuffer(); }
        finally { active--; }
      } });
      return blob;
    } });
    await expect(inspectZip(file)).resolves.toBeDefined();
    expect(maximum).toBeGreaterThan(1);
    expect(maximum).toBeLessThanOrEqual(16);
  }, 5000);

  it("accepts ordinary, data descriptor, and forced ZIP64 archives", async () => {
    for (const options of [{}, { dataDescriptor: true }, { dataDescriptor: true, zip64: true }]) {
      await expect(inspectZip(await archive(options))).resolves.toBeDefined();
    }
  });

  it("rejects directory and extra entries", async () => {
    await expect(inspectZip(await archive({ directory: true }))).rejects.toThrow(/directory entries/);
    await expect(inspectZip(await archive({ extra: true }))).rejects.toThrow(/exactly match/);
  });

  it("rejects a truncated archive and malformed manifest JSON", async () => {
    const valid = await archive();
    const truncated = new File([valid.slice(0, valid.size - 8)], "truncated.zip");
    await expect(inspectZip(truncated)).rejects.toThrow();
    const output = new BlobWriter("application/zip");
    const writer = new ZipWriter(output);
    await writer.add("manifest.json", new BlobReader(new Blob(["{" ])), { compressionMethod: 0 });
    const badZip = new File([await writer.close()], "bad.zip");
    await expect(inspectZip(badZip)).rejects.toThrow();
  });

  it("rejects an oversized central directory declaration before parsing entries", async () => {
    const valid = await archive();
    const bytes = new Uint8Array(await valid.arrayBuffer());
    const view = new DataView(bytes.buffer);
    for (let offset = bytes.length - 22; offset >= 0; offset--) {
      if (view.getUint32(offset, true) === 0x06054B50) {
        view.setUint32(offset + 12, 64 * 1024 * 1024 + 1, true);
        break;
      }
    }
    await expect(inspectZip(new File([bytes], "large-directory.zip"))).rejects.toThrow(/64 MiB/);
  });

  it("reports preview hash mismatch", async () => {
    await expect(verifiedPreview(new Blob(["abc"]), "0".repeat(64), "thumbnail")).rejects.toThrow(/SHA-256 verification/);
  });
});
