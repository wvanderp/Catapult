import { sha256 } from "@noble/hashes/sha2.js";

/**
Hash a Blob in bounded chunks, yielding between reads.
 
 * @param blob - Blob data to hash.
 * @param signal - Optional cancellation signal checked between chunks.
 * @returns The requested result.
 */
export async function hashBlob(blob: Blob, signal?: AbortSignal): Promise<string> {
  const hasher = sha256.create();
  for (let offset = 0; offset < blob.size; offset += 8 * 1024 * 1024) {
    if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
    hasher.update(new Uint8Array(await blob.slice(offset, offset + 8 * 1024 * 1024).arrayBuffer()));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return toHex(hasher.digest());
}

/**
Hash bytes and return a lowercase hexadecimal digest.
 
 * @param bytes - Bytes to hash.
 * @returns The lowercase SHA-256 digest.
 */
export function hashBytes(bytes: Uint8Array): string {
  return toHex(sha256(bytes));
}

/**
Convert bytes to lowercase hexadecimal.
 
 * @param bytes - Digest bytes to encode.
 * @returns A lowercase hexadecimal representation.
 */
function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
