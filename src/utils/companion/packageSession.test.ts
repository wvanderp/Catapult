/* eslint-disable @typescript-eslint/no-explicit-any, unicorn/prefer-iterator-to-array, unicorn/consistent-class-member-order, unicorn/no-await-expression-member, unicorn/prefer-promise-with-resolvers -- Tests use concise in-memory mocks and explicit deferred read gates. */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const storeMock = vi.hoisted(() => ({ rows: new Map<string, any>() }));
vi.mock("./packageStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./packageStore")>();
  return { ...actual,
    savePackage: vi.fn(async (record: any) => { storeMock.rows.set(record.id, record); }),
    getPackage: vi.fn(async (id: string) => storeMock.rows.get(id)),
    listPackages: vi.fn(async () => [...storeMock.rows.values()]),
    removePackageRecord: vi.fn(async (id: string) => { storeMock.rows.delete(id); }),
    clearPackageStore: vi.fn(async () => { storeMock.rows.clear(); }),
  };
});
import { archive } from "./testFixtures";
import { clearPackageStore, savePackage } from "./packageStore";
import * as session from "./packageSession";
import { forgetZip, inspectZip } from "./zipReader";
import type { BrowserFileHandle } from "./types";

const permissions = new WeakMap<Handle, PermissionState>();
class Handle {
  public file: File;
  public error?: Error;
  constructor(file: File, permission: PermissionState = "granted", error?: Error) { this.file = file; this.error = error; permissions.set(this, permission); }
  setPermission(permission: PermissionState): void { permissions.set(this, permission); }
  queryPermission = vi.fn(async () => permissions.get(this)!);
  requestPermission = vi.fn(async () => permissions.get(this)!);
  getFile = vi.fn(async () => { if (this.error) throw this.error; return this.file; });
}
const handleAsType = (value: Handle): BrowserFileHandle => value as unknown as BrowserFileHandle;

beforeEach(async () => {
  storeMock.rows.clear();
  await session.clear().catch(() => {});
  await clearPackageStore().catch(() => {});
  for (const id of ["fixture", "a", "b", "c", "d", "e"]) forgetZip(id);
});

describe("package session", () => {
  it("aborts a queued preview and lets original verification bypass preview slots", async () => {
    const photos = ["one", "two", "three", "four", "five"].map((id) => ({ id, filename: `${id}.jpg` }));
    const { record } = await session.importFile(await archive(photos));
    const zip = await import("./zipReader"); const originalSlice = zip.sliceEntry;
    let releaseReads!: () => void; const readGate = new Promise<void>((resolve) => { releaseReads = resolve; });
    let fourStarted!: () => void; const fourReady = new Promise<void>((resolve) => { fourStarted = resolve; }); let previewStarts = 0;
    const spy = vi.spyOn(zip, "sliceEntry").mockImplementation(async (...arguments_) => {
      if (arguments_[2]?.includes("/previews/")) { previewStarts++; if (previewStarts === 4) fourStarted(); await readGate; }
      return originalSlice(...arguments_);
    });
    const previews = photos.slice(0, 4).map(({ id }) => session.getPreviewBlob(record.id, id, "working"));
    await fourReady;
    const controller = new AbortController();
    const queued = session.getPreviewBlob(record.id, "five", "working", controller.signal);
    controller.abort();
    await expect(queued).rejects.toMatchObject({ name: "AbortError" });
    await expect(session.getVerifiedOriginalFile(record.id, "five")).resolves.toMatchObject({ name: "five.jpg" });
    releaseReads(); await Promise.all(previews); spy.mockRestore();
  });


  it("restoreAll queries permissions without prompting for granted, prompt, denied, missing, unreadable, or absent handles", async () => {
    const cases = [
      ["granted", "available", "granted"], ["prompt", "needs-permission", "prompt"], ["denied", "needs-permission", "denied"],
    ] as const;
    for (const [permission, expected] of cases) {
      const file = await archive(); const handle = new Handle(file, permission);
      const { record } = await inspectZip(file, handleAsType(handle), permission);
      forgetZip(permission);
      await savePackage(record);
      await session.restoreAll();
      expect(session.getSnapshot().states[permission]).toBe(expected);
      expect(handle.requestPermission).not.toHaveBeenCalled();
    }
    for (const [name, state] of [["NotFoundError", "missing"], ["NotReadableError", "missing"]] as const) {
      const file = await archive(); const handle = new Handle(file, "granted", new DOMException(name, name));
      const { record } = await inspectZip(file, handleAsType(handle), name); forgetZip(name); await savePackage(record);
      await session.restoreAll(); expect(session.getSnapshot().states[name]).toBe(state);
    }
    const { record } = await inspectZip(await archive(), undefined, "no-handle"); forgetZip("no-handle"); await savePackage(record);
    await session.restoreAll(); expect(session.getSnapshot().states["no-handle"]).toBe("unselected");
  });

  it("requests access and reselects only after permission is granted", async () => {
    const file = await archive(); const denied = new Handle(file, "denied");
    const { record } = await inspectZip(file, handleAsType(denied), "access"); await savePackage(record); await session.restoreAll();
    expect((await session.requestAccess("access")).ok).toBe(false);
    denied.setPermission("granted");
    expect((await session.requestAccess("access")).ok).toBe(true);
    expect(denied.requestPermission).toHaveBeenCalledTimes(2);
  });

  it("preserves readable working data when reselect fails and accepts matching originals", async () => {
    const original = await archive(); const imported = await session.importFile(original); const id = imported.record.id;
    expect((await session.reselect(id, await archive([{ id: "photo-1", filename: "photo.jpg" }], "same.zip"))).ok).toBe(true);
    const sameBytes = new File([await original.arrayBuffer()], "renamed.zip", { lastModified: 2 });
    expect((await session.reselect(id, sameBytes)).ok).toBe(true);
    const different = await archive([{ id: "photo-1", filename: "photo.jpg", bytes: "changed" }]);
    expect((await session.reselect(id, different)).ok).toBe(false);
    const invalid = new File(["bad"], "bad.zip"); expect((await session.reselect(id, invalid)).ok).toBe(false);
    await expect((await session.getPreviewBlob(id, "photo-1", "thumbnail")).text()).resolves.toBe("thumb:photo-1");
    await expect((await session.getPreviewBlob(id, "photo-1", "working")).text()).resolves.toBe("working:photo-1");
  });

  it("keeps equal originals in distinct packages and opens five packages", async () => {
    const ids: string[] = [];
    for (let n = 0; n < 5; n++) ids.push((await session.importFile(await archive([{ id: "photo-1", filename: "same.jpg" }]))).record.id);
    expect(new Set(ids).size).toBe(5);
    for (const id of ids) await expect((await session.getPreviewBlob(id, "photo-1", "working")).text()).resolves.toBe("working:photo-1");
  });

  it("restores reads after a transient slice error", async () => {
    const { record } = await session.importFile(await archive());
    const zip = await import("./zipReader"); const spy = vi.spyOn(zip, "sliceEntry").mockRejectedValueOnce(new DOMException("read failed", "NotReadableError"));
    await expect(session.getPreviewBlob(record.id, "photo-1", "thumbnail")).rejects.toThrow();
    spy.mockRestore();
    expect(session.getSnapshot().states[record.id]).toBe("missing");
    expect((await session.reselect(record.id, await archive())).ok).toBe(true);
    await expect((await session.getPreviewBlob(record.id, "photo-1", "thumbnail")).text()).resolves.toBe("thumb:photo-1");
  });

  it("cleans the inspected cache and leaves no record when persistence fails", async () => {
    const store = await import("./packageStore");
    vi.mocked(store.savePackage).mockRejectedValueOnce(new Error("disk unavailable"));
    await expect(session.importFile(await archive())).rejects.toThrow("disk unavailable");
    expect(storeMock.rows.size).toBe(0);
  });

  it("limits preview slicing to four concurrent reads", async () => {
    const { record } = await session.importFile(await archive([{ id: "one", filename: "1.jpg" }, { id: "two", filename: "2.jpg" }, { id: "three", filename: "3.jpg" }, { id: "four", filename: "4.jpg" }, { id: "five", filename: "5.jpg" }]));
    const zip = await import("./zipReader");
    const originalSlice = zip.sliceEntry;
    let concurrent = 0; let peak = 0;
    const spy = vi.spyOn(zip, "sliceEntry").mockImplementation(async (...arguments_) => {
      concurrent++; peak = Math.max(peak, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 5));
      try { return await originalSlice(...arguments_); } finally { concurrent--; }
    });
    await Promise.all(["one", "two", "three", "four", "five"].map((id) => session.getPreviewBlob(record.id, id, "working")));
    spy.mockRestore();
    expect(peak).toBe(4);
  });

  it("reuses all four queue slots after twenty reads drain", async () => {
    const photos = Array.from({ length: 20 }, (_, index) => ({ id: `p${index}`, filename: `${index}.jpg` }));
    const { record } = await session.importFile(await archive(photos));
    await Promise.all(photos.map(({ id }) => session.getPreviewBlob(record.id, id, "working")));
    const four = photos.slice(0, 4).map(({ id }) => session.getPreviewBlob(record.id, id, "working"));
    await expect(Promise.all(four)).resolves.toHaveLength(4);
  });

  it("keeps original verification strictly serial for three callers", async () => {
    const photos = ["one", "two", "three"].map((id) => ({ id, filename: `${id}.jpg` }));
    const { record } = await session.importFile(await archive(photos));
    const zip = await import("./zipReader"); const originalSlice = zip.sliceEntry;
    let active = 0; let peak = 0;
    const spy = vi.spyOn(zip, "sliceEntry").mockImplementation(async (...arguments_) => {
      active++; peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      try { return await originalSlice(...arguments_); } finally { active--; }
    });
    await Promise.all(photos.map(({ id }) => session.getVerifiedOriginalFile(record.id, id)));
    spy.mockRestore();
    expect(peak).toBe(1);
  });

  it("rejects an aborted in-flight read and releases its slot when the slice settles", async () => {
    const { record } = await session.importFile(await archive());
    const zip = await import("./zipReader"); const originalSlice = zip.sliceEntry;
    let finish!: () => void; const held = new Promise<void>((resolve) => { finish = resolve; });
    let started!: () => void; const startedPromise = new Promise<void>((resolve) => { started = resolve; });
    const spy = vi.spyOn(zip, "sliceEntry").mockImplementation(async (...arguments_) => { started(); await held; return originalSlice(...arguments_); });
    const controller = new AbortController();
    const reading = session.getPreviewBlob(record.id, "photo-1", "working", controller.signal);
    await startedPromise; controller.abort(); finish();
    await expect(reading).rejects.toMatchObject({ name: "AbortError" });
    spy.mockRestore();
    await expect(session.getPreviewBlob(record.id, "photo-1", "working")).resolves.toBeInstanceOf(Blob);
  });


  it("does not verify on ordinary original reads and verifies named TIFF files explicitly", async () => {
    const { record } = await session.importFile(await archive([{ id: "raw", filename: "scan.tif", mimeType: "image/tiff" }]));
    await expect(session.getOriginalBlob(record.id, "raw")).resolves.toBeInstanceOf(Blob);
    const verified = await session.getVerifiedOriginalFile(record.id, "raw");
    expect(verified.name).toBe("scan.tif"); expect(verified.type).toBe("image/tiff");
  });

  it("hashes only explicitly verified originals and reports tampering", async () => {
    const { record } = await session.importFile(await archive());
    const hashing = await import("./sha256");
    const hashSpy = vi.spyOn(hashing, "hashBlob");
    await session.getOriginalBlob(record.id, "photo-1");
    expect(hashSpy).not.toHaveBeenCalled();
    hashSpy.mockRestore();
    const zip = await import("./zipReader");
    const slicing = vi.spyOn(zip, "sliceEntry").mockResolvedValueOnce(new Blob(["tampered"]));
    await expect(session.getVerifiedOriginalFile(record.id, "photo-1")).rejects.toThrow(/SHA-256 verification/);
    slicing.mockRestore();
  });

  it("returns stable immutable snapshots", async () => {
    const initial = session.getSnapshot(); await session.importFile(await archive());
    const current = session.getSnapshot(); expect(session.getSnapshot()).toBe(current); expect(initial).not.toBe(current);
    expect(Object.isFrozen(current)).toBe(true); expect(Object.isFrozen(current.packages)).toBe(true);
    expect(() => { (current.states as Record<string, string>).x = "available"; }).toThrow();
  });

  it("removes and clears with open package reads, then permits a fresh import", async () => {
    const { record } = await session.importFile(await archive());
    await session.getPreviewBlob(record.id, "photo-1", "thumbnail");
    await session.remove(record.id); expect(await session.getPackage(record.id)).toBeUndefined();
    await session.importFile(await archive()); await session.clear();
    expect(Object.keys(session.getSnapshot().packages)).toHaveLength(0);
    await expect(session.importFile(await archive())).resolves.toBeDefined();
  });
});
