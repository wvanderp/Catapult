// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import exifr from "exifr";
import { parseCompanionExif } from "./companionExif";

/**
 * @returns TIFF metadata bytes.
 */
function metadataTiff(): Uint8Array {
  const bytes = new Uint8Array(60);
  const view = new DataView(bytes.buffer);
  bytes.set([0x49, 0x49, 42, 0]);
  view.setUint32(4, 8, true);
  view.setUint16(8, 2, true);
  view.setUint16(10, 0x010F, true); view.setUint16(12, 2, true); view.setUint32(14, 6, true); view.setUint32(18, 50, true);
  view.setUint16(22, 0x8825, true); view.setUint16(24, 4, true); view.setUint32(26, 1, true); view.setUint32(30, 38, true);
  view.setUint32(34, 0, true);
  view.setUint16(38, 1, true);
  view.setUint16(40, 1, true); view.setUint16(42, 2, true); view.setUint32(44, 2, true); bytes.set([78, 0], 48);
  view.setUint32(54, 0, true);
  bytes.set(new TextEncoder().encode("Canon\0"), 50);
  return bytes;
}

/**
 * @returns JPEG metadata bytes.
 */
function jpegWithMetadata(): Uint8Array {
  const enc = new TextEncoder();
  const segment = (marker: number, payload: Uint8Array): number[] => [0xFF, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xFF, ...payload];
  const exif = new Uint8Array([...enc.encode("Exif\0\0"), ...metadataTiff()]);
  // eslint-disable-next-line unicorn/prefer-https -- XMP identifiers require this exact namespace URI.
  const xmp = enc.encode("http://ns.adobe.com/xap/1.0/\0<x:xmpmeta xmlns:x='adobe:ns:meta/'><rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'><rdf:Description xmlns:dc='http://purl.org/dc/elements/1.1/'><dc:title>Offline fixture</dc:title></rdf:Description></rdf:RDF></x:xmpmeta>");
  const iim = enc.encode("\u{1C}\u{2}\u{5}\u{0}\u{5}Paris");
  const resource = new Uint8Array([...enc.encode("Photoshop 3.0\0"), 0x38, 0x42, 0x49, 0x4D, 0x04, 0x04, 0, 0, 0, 0, 0, iim.length, ...iim]);
  const parts = [0xFF, 0xD8, ...segment(0xE1, exif), ...segment(0xE1, xmp), ...segment(0xED, resource), 0xFF, 0xDA, 0, 2, 0, 0xFF, 0xD9];
  return new Uint8Array(parts);
}

/**
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

describe("offline companion EXIF parsing", () => {
  it("matches full parsing for JPEG EXIF, GPS, XMP, and IPTC", async () => {
    const bytes = jpegWithMetadata();
    const options = { tiff: true, exif: true, gps: true, iptc: true, xmp: true, translateValues: true, translateKeys: true, reviveValues: true };
    const full = await exifr.parse(bytes, options);
    const companion = await parseCompanionExif(new Blob([bytes.buffer as ArrayBuffer]));
    expect(companion).toEqual(full);
    expect(full).toHaveProperty("Make", "Canon");
    expect(full).toHaveProperty("GPSLatitudeRef", "N");
    expect(full).toHaveProperty("title", "Offline fixture");
    expect(full).toHaveProperty("ObjectName", "Paris");
  });

  it("matches full parsing when JPEG metadata follows more than one chunk of APP segments", async () => {
    const bytes = jpegWithLateMetadata();
    const options = { tiff: true, exif: true, gps: true, icc: true, iptc: true, xmp: true, translateValues: true, translateKeys: true, reviveValues: true };
    const full = await exifr.parse(bytes, options);
    const companion = await parseCompanionExif(new Blob([bytes.buffer as ArrayBuffer]));
    expect(companion).toEqual(full);
    expect(companion).toHaveProperty("Make", "Canon");
    expect(companion).toHaveProperty("title", "Offline fixture");
    expect(companion).toHaveProperty("ObjectName", "Paris");
  });

  it("finds TIFF metadata whose IFD is at the end of the original", async () => {
    const bytes = tiffWithLateIfd();
    const options = { tiff: true, exif: true, gps: true, iptc: true, xmp: true, translateValues: true, translateKeys: true, reviveValues: true };
    const full = await exifr.parse(bytes, options);
    const companion = await parseCompanionExif(new Blob([bytes.buffer as ArrayBuffer]));
    expect(companion).toEqual(full);
    expect(companion).toHaveProperty("Make", "Canon");
  });

  it("reads only a bounded portion of a large TIFF while finding its late IFD", async () => {
    const bytes = tiffWithLateIfd(32 * 1024 * 1024);
    const blob = new Blob([bytes.buffer as ArrayBuffer]);
    let bytesRead = 0;
    const instrument = (target: Blob): void => {
      const originalSlice = target.slice.bind(target);
      Object.defineProperty(target, "slice", { configurable: true, value: (start?: number, end?: number, contentType?: string) => {
        const result = originalSlice(start, end, contentType);
        instrument(result);
        // Slicing itself does not read bytes; its returned Blob is instrumented.
        return result;
      } });
      const originalArrayBuffer = target.arrayBuffer.bind(target);
      Object.defineProperty(target, "arrayBuffer", { configurable: true, value: async () => {
        const result = await originalArrayBuffer();
        bytesRead += result.byteLength;
        return result;
      } });
      const originalText = target.text.bind(target);
      Object.defineProperty(target, "text", { configurable: true, value: async () => {
        const result = await originalText();
        bytesRead += target.size;
        return result;
      } });
      if (typeof target.stream === "function") {
        const originalStream = target.stream.bind(target);
        Object.defineProperty(target, "stream", { configurable: true, value: () => {
          const reader = originalStream().getReader();
          return new ReadableStream<Uint8Array>({
            async pull(controller) {
              const { done, value } = await reader.read();
              if (done) controller.close();
              else { bytesRead += value.byteLength; controller.enqueue(value); }
            },
            cancel(reason) { return reader.cancel(reason); },
          });
        } });
      }
      const bytesMethod = (target as Blob & { bytes?: () => Promise<Uint8Array> }).bytes;
      if (bytesMethod) Object.defineProperty(target, "bytes", { configurable: true, value: async () => {
        const result = await bytesMethod.call(target);
        bytesRead += result.byteLength;
        return result;
      } });
    };
    instrument(blob);
    const fileReaderMethods = ["readAsArrayBuffer", "readAsText", "readAsDataURL", "readAsBinaryString"] as const;
    const fileReaderSpies = fileReaderMethods.filter((method) => typeof FileReader.prototype[method] === "function").map((method) => {
      const original = FileReader.prototype[method];
      return vi.spyOn(FileReader.prototype, method).mockImplementation(function (this: FileReader, value: Blob, ...arguments_: never[]) {
        bytesRead += value.size;
        return Reflect.apply(original, this, [value, ...arguments_]);
      });
    });
    const companion = await parseCompanionExif(blob);
    for (const spy of fileReaderSpies) spy.mockRestore();
    expect(companion).toHaveProperty("Make", "Canon");
    expect(bytesRead).toBeLessThan(blob.size / 2);
  });
});

/**
 * @returns JPEG bytes with multiple large APP segments before its metadata.
 */
function jpegWithLateMetadata(): Uint8Array {
  const enc = new TextEncoder();
  const segment = (marker: number, payload: Uint8Array): number[] => [0xFF, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xFF, ...payload];
  const padding = new Uint8Array(64 * 1024 - 2).fill(0x41);
  const exif = new Uint8Array([...enc.encode("Exif\0\0"), ...metadataTiff()]);
  // eslint-disable-next-line unicorn/prefer-https -- XMP identifiers require this exact namespace URI.
  const xmp = enc.encode("http://ns.adobe.com/xap/1.0/\0<x:xmpmeta xmlns:x='adobe:ns:meta/'><rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'><rdf:Description xmlns:dc='http://purl.org/dc/elements/1.1/'><dc:title>Offline fixture</dc:title></rdf:Description></rdf:RDF></x:xmpmeta>");
  const iim = enc.encode("\u{1C}\u{2}\u{5}\u{0}\u{5}Paris");
  const resource = new Uint8Array([...enc.encode("Photoshop 3.0\0"), 0x38, 0x42, 0x49, 0x4D, 0x04, 0x04, 0, 0, 0, 0, 0, iim.length, ...iim]);
  const parts: number[] = [0xFF, 0xD8];
  for (let index = 0; index < 6; index++) parts.push(...segment(0xE2, padding));
  parts.push(...segment(0xE1, exif), ...segment(0xE1, xmp), ...segment(0xED, resource), 0xFF, 0xDA, 0, 2, 0, 0xFF, 0xD9);
  return new Uint8Array(parts);
}
