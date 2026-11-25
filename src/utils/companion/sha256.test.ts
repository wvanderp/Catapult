import { describe, expect, it } from "vitest";
import { hashBlob, hashBytes } from "./sha256";

describe("SHA-256 helpers", () => {
  it.each([
    ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
    ["abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq", "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"],
  ])("matches NIST vector %j", (value, digest) => {
    expect(hashBytes(new TextEncoder().encode(value))).toBe(digest);
  });

  it("hashes 1 MiB and chunk boundaries", async () => {
    const bytes = new Uint8Array(8 * 1024 * 1024 + 17);
    for (let index = 0; index < bytes.length; index++) bytes[index] = index % 251;
    const expected = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    expect(await hashBlob(new Blob([bytes]))).toBe(expected);
    const firstMegabyte = bytes.subarray(0, 1024 * 1024);
    const firstMegabyteDigest = await crypto.subtle.digest("SHA-256", firstMegabyte);
    const expectedFirstMegabyte = [...new Uint8Array(firstMegabyteDigest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    expect(hashBytes(firstMegabyte)).toBe(expectedFirstMegabyte);
  });

  it("honors an aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(hashBlob(new Blob(["content"]), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});
