import { createWriteStream, writeFileSync } from "node:fs";
import { lstat, mkdtemp, open, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { publishNoReplace, type PublishFileOperations } from "../../src/zip/publish.js";

const fallbackCodes = ["EPERM", "ENOTSUP", "EXDEV"] as const;

for (const code of fallbackCodes) {
  it(`publishes by exclusive copy when hard links fail with ${code}`, async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "catapult-publish-test-"));
    try {
      const temporary = path.join(root, "archive.tmp");
      const output = path.join(root, "archive.zip");
      await writeFile(temporary, "archive bytes");
      const operations: PublishFileOperations = {
        link: async () => { throw Object.assign(new Error(code), { code }); },
        open, lstat,
        unlink,
        createWriteStream,
      };
      await publishNoReplace(temporary, output, operations);
      expect(await readFile(output, "utf8")).toBe("archive bytes");
      await expect(stat(temporary)).rejects.toMatchObject({ code: "ENOENT" });
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}

it("never replaces an output that appears while fallback publishing starts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "catapult-publish-test-"));
  try {
    const temporary = path.join(root, "archive.tmp");
    const output = path.join(root, "archive.zip");
    await writeFile(temporary, "archive bytes");
    const operations: PublishFileOperations = {
      link: async () => { throw Object.assign(new Error("cross-device"), { code: "EXDEV" }); },
      open, lstat,
      unlink,
      createWriteStream: (file, options) => {
        writeFileSync(output, "external bytes");
        return createWriteStream(file, options);
      },
    };
    await expect(publishNoReplace(temporary, output, operations)).rejects.toMatchObject({ code: "EEXIST" });
    expect(await readFile(output, "utf8")).toBe("external bytes");
    expect(await readFile(temporary, "utf8")).toBe("archive bytes");
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("removes partial fallback output and leaves the completed temporary archive", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "catapult-publish-test-"));
  try {
    const temporary = path.join(root, "archive.tmp");
    const output = path.join(root, "archive.zip");
    await writeFile(temporary, "archive bytes");
    const operations: PublishFileOperations = {
      link: async () => { throw Object.assign(new Error("cross-device"), { code: "EXDEV" }); },
      open, lstat,
      unlink,
      createWriteStream: (file, options) => {
        const stream = createWriteStream(file, options);
        stream.once("open", () => stream.destroy(Object.assign(new Error("disk full"), { code: "ENOSPC" })));
        return stream;
      },
    };
    await expect(publishNoReplace(temporary, output, operations)).rejects.toMatchObject({ code: "ENOSPC" });
    await expect(stat(output)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(temporary, "utf8")).toBe("archive bytes");
  } finally { await rm(root, { recursive: true, force: true }); }
});
