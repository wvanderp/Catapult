// @vitest-environment node
import { describe, expect, it } from "vitest";
import { extractExifData } from "./exifUtils";

/**
 *
 * @param size Total fixture size in bytes.
 * @returns TIFF bytes with an IFD at the end.
 */
function tiffWithLateIfd(size = 17 * 1024 * 1024): Uint8Array {
  const bytes = new Uint8Array(new ArrayBuffer(size));
  const view = new DataView(bytes.buffer);
  bytes.set([0x49, 0x49, 42, 0], 0);
  view.setUint32(4, size - 22, true);
  view.setUint16(size - 22, 1, true);
  view.setUint16(size - 20, 0x010F, true); // Make
  view.setUint16(size - 18, 2, true);
  view.setUint32(size - 16, 6, true);
  view.setUint32(size - 12, size - 6, true);
  bytes.set(new TextEncoder().encode("Canon\0"), size - 6);
  return bytes;
}

describe("offline EXIF parsing", () => {
  it("parses ordinary uploads in Node without FileReader", async () => {
    const file = new File([tiffWithLateIfd(64).buffer as ArrayBuffer], "camera.tif", { type: "image/tiff" });
    const result = await extractExifData(file);
    expect(result.Make).toBe("Canon");
  });


});
