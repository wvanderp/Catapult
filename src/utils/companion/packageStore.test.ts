/* eslint-disable unicorn/prefer-add-event-listener -- IndexedDB request lifecycle is expressed through request handlers. */
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { clearPackageStore, getPackage, listPackages, removePackageRecord, savePackage } from "./packageStore";
import { archive } from "./testFixtures";
import { inspectZip } from "./zipReader";

afterEach(async () => { await clearPackageStore().catch(() => {}); });

describe("companion package store", () => {
  it("round trips a package record", async () => {
    const { record } = await inspectZip(await archive(), undefined, "round-trip");
    await savePackage(record);
    expect(await getPackage(record.id)).toEqual(record);
    expect(await listPackages()).toEqual([record]);
    await removePackageRecord(record.id);
    expect(await getPackage(record.id)).toBeUndefined();
  });

  it("supplies defaults for fields absent from older records", async () => {
    const { record } = await inspectZip(await archive(), undefined, "legacy");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("CatapultPackages", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("packages", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const legacy = { ...record } as Record<string, unknown>; delete legacy.identity; delete legacy.size; delete legacy.lastModified;
    await new Promise<void>((resolve, reject) => { const transaction = database.transaction("packages", "readwrite"); transaction.objectStore("packages").put(legacy); transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); }); database.close();
    await expect(getPackage("legacy")).resolves.toMatchObject({ identity: "legacy", size: -1, lastModified: -1 });
    await expect(listPackages()).resolves.toMatchObject([{ identity: "legacy", size: -1, lastModified: -1 }]);
  });

  it("closes on versionchange and reports a blocked delete", async () => {
    const opened = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("CatapultPackages", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("packages", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const deleting = clearPackageStore();
    await expect(deleting).rejects.toThrow(/blocked/);
    opened.close();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await expect(getPackage("none")).resolves.toBeUndefined();
  });
});
