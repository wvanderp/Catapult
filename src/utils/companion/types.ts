import type { PackageManifest } from "@catapult/package-format";

/**
Persisted browser file handle with permission methods.
 */
export type BrowserFileHandle = FileSystemFileHandle & {
  queryPermission(options?: { mode: "read" }): Promise<PermissionState>;
  requestPermission(options?: { mode: "read" }): Promise<PermissionState>;
};

/**
Package identity persisted by the importer.
 */
export interface PackageRecord {
  /**
  Stable UUID generated for this import.
   */
  id: string;
  /**
  Hash of sorted original hashes and photo ids.
   */
  identity: string;
  /**
  User-visible ZIP filename.
   */
  name: string;
  /**
  ZIP size at last verification.
   */
  size: number;
  /**
  ZIP modified timestamp at last verification.
   */
  lastModified: number;
  /**
  Parsed and validated package manifest.
   */
  manifest: PackageManifest;
  /**
  Optional browser file handle.
   */
  handle?: BrowserFileHandle;
}

/**
Photo record exposed to existing importer callers.
 */
export interface ImportedPhoto {
  /**
  Owning package UUID.
   */
  packageId: string;
  /**
  Photo identifier within the package.
   */
  photoId: string;
  /**
  Source filename.
   */
  name: string;
  /**
  MIME type of the original.
   */
  mimeType: string;
  /**
  Expected original SHA-256.
   */
  sha256: string;
  /**
  Original byte size.
   */
  size: number;
}

/**
Availability state for one saved package.
 */
export type PackageAvailability = "available" | "needs-permission" | "missing" | "mismatch" | "unselected";

/**
Stable immutable package session snapshot.
 */
export interface PackageSessionSnapshot {
  /**
  Package records, keyed by UUID.
   */
  packages: Readonly<Record<string, PackageRecord>>;
  /**
  Availability status, keyed by UUID.
   */
  states: Readonly<Record<string, PackageAvailability>>;
}
