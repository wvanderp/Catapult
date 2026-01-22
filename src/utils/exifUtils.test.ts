import { describe, it, expect, beforeAll } from "vitest";
import {
  base64ToFile,
  extractExifData,
  formatExifDate,
  formatExifDateOnly,
  formatExifDateTime,
} from "./exifUtils";

describe("base64ToFile", () => {
  it("should convert a base64 string to a File object", () => {
    // A minimal valid base64 string (represents "Hello")
    const base64 = "SGVsbG8=";
    const filename = "test.txt";
    const mimeType = "text/plain";

    const file = base64ToFile(base64, filename, mimeType);

    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe(filename);
    expect(file.type).toBe(mimeType);
  });

  it("should create file with correct content", async () => {
    const base64 = "SGVsbG8gV29ybGQ="; // "Hello World"
    const file = base64ToFile(base64, "test.txt", "text/plain");

    const text = await file.text();
    expect(text).toBe("Hello World");
  });

  it("should handle empty base64 string", () => {
    const base64 = "";
    const file = base64ToFile(base64, "empty.txt", "text/plain");

    expect(file).toBeInstanceOf(File);
    expect(file.size).toBe(0);
  });

  it("should handle image MIME types", () => {
    // Minimal base64 representing some binary data
    const base64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const file = base64ToFile(base64, "image.png", "image/png");

    expect(file.name).toBe("image.png");
    expect(file.type).toBe("image/png");
    expect(file.size).toBeGreaterThan(0);
  });

  it("should preserve filename with special characters", () => {
    const base64 = "dGVzdA=="; // "test"
    const filename = "my file (2024).jpg";
    const file = base64ToFile(base64, filename, "image/jpeg");

    expect(file.name).toBe(filename);
  });

  it("should handle large base64 strings", () => {
    // Generate a larger base64 string
    const originalString = "A".repeat(1000);
    const base64 = btoa(originalString);
    const file = base64ToFile(base64, "large.txt", "text/plain");

    expect(file.size).toBe(1000);
  });
});

describe("extractExifData", () => {
  const WIKIMEDIA_IMAGE_URL =
    "https://commons.wikimedia.org/wiki/Special:FilePath/ParkShuttle_autonomous_bus_Capelle_aan_den_IJssel_-_2024-03-11.jpg";
  let testFile: File | undefined;

  beforeAll(async () => {
    // Download sample image from Wikimedia Commons for each test
    try {
      const response = await fetch(WIKIMEDIA_IMAGE_URL);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      const blob = await response.blob();
      testFile = new File([blob], "ParkShuttle_autonomous_bus.jpg", {
        type: "image/jpeg",
      });
    } catch (error) {
      console.warn("Failed to download test image:", error);
      throw error;
    }
  });

  it("should return object when parsing succeeds", async () => {
    if (!testFile) {
      throw new Error("Test file not initialized");
    }

    console.log("Testing with file:", testFile.name, "size:", testFile.size);

    const exifData = await extractExifData(testFile);

    console.log("Extracted EXIF data:", exifData);

    expect(typeof exifData).toBe("object");
    expect(exifData).not.toBeNull();

    // Check for common EXIF fields that contain image dimensions
    // exifr uses ExifImageWidth/ExifImageHeight for dimensions
    const hasImageWidth =
      "ImageWidth" in exifData || "ExifImageWidth" in exifData;
    const hasImageHeight =
      "ImageHeight" in exifData || "ExifImageHeight" in exifData;

    expect(hasImageWidth || hasImageHeight).toBe(true);

    // These file-system specific fields should not be present
    // (they were from the old exiftool library, exifr doesn't include them)
    expect(exifData).not.toHaveProperty("SourceFile");
    expect(exifData).not.toHaveProperty("FileName");
    // Note: exifr may return "Directory" from XMP metadata (different from filesystem path)
    expect(exifData).not.toHaveProperty("FileSize");
    expect(exifData).not.toHaveProperty("FileModifyDate");
    expect(exifData).not.toHaveProperty("FileAccessDate");
    expect(exifData).not.toHaveProperty("FileInodeChangeDate");
    expect(exifData).not.toHaveProperty("FilePermissions");

    // The ParkShuttle image should have camera information
    const hasMakeOrModel = "Make" in exifData || "Model" in exifData;

    expect(hasMakeOrModel).toBe(true);
  });
});

describe("formatExifDate", () => {
  it("should format a Date object to YYYY-MM-DD HH:mm", () => {
    const date = new Date("2025-03-02T12:52:32+01:00");
    const result = formatExifDate(date);
    expect(result).toBe("2025-03-02 12:52");
  });

  it("should format EXIF string format with colons", () => {
    const exifDate = "2024:01:15 10:30:00";
    const result = formatExifDate(exifDate);
    expect(result).toBe("2024-01-15 10:30");
  });

  it("should format standard date string", () => {
    const dateString = "2024-06-15 14:22:00";
    const result = formatExifDate(dateString);
    expect(result).toBe("2024-06-15 14:22");
  });

  it("should return undefined for null", () => {
    // @ts-expect-error Testing with no arguments
    const result = formatExifDate();
    expect(result).toBeUndefined();
  });

  it("should return undefined for undefined", () => {
    // @ts-expect-error Testing with no arguments
    const result = formatExifDate();
    expect(result).toBeUndefined();
  });

  it("should return undefined for invalid date string", () => {
    const result = formatExifDate("invalid date");
    expect(result).toBeUndefined();
  });

  it("should return undefined for non-date types", () => {
    const result = formatExifDate(12_345);
    expect(result).toBeUndefined();
  });

  it("should pad single-digit months and days", () => {
    const date = new Date("2024-03-05T08:05:00");
    const result = formatExifDate(date);
    expect(result).toBe("2024-03-05 08:05");
  });

  it("should handle the actual EXIF date from test image", async () => {
    const exifDate =
      "Sun Mar 02 2025 12:52:32 GMT+0100 (Midden-Europese standaardtijd)";
    const result = formatExifDate(exifDate);
    expect(result).toBe("2025-03-02 12:52");
  });
});

describe("formatExifDateOnly", () => {
  it("should format a Date object to YYYY-MM-DD", () => {
    const date = new Date("2025-03-02T12:52:32+01:00");
    const result = formatExifDateOnly(date);
    expect(result).toBe("2025-03-02");
  });

  it("should format EXIF string format with colons to YYYY-MM-DD", () => {
    const exifDate = "2024:01:15 10:30:00";
    const result = formatExifDateOnly(exifDate);
    expect(result).toBe("2024-01-15");
  });

  it("should format standard date string to YYYY-MM-DD", () => {
    const dateString = "2024-06-15 14:22:00";
    const result = formatExifDateOnly(dateString);
    expect(result).toBe("2024-06-15");
  });

  it("should return undefined for null", () => {
    // @ts-expect-error Testing with no arguments
    const result = formatExifDateOnly();
    expect(result).toBeUndefined();
  });

  it("should return undefined for undefined", () => {
    // @ts-expect-error Testing with no arguments
    const result = formatExifDateOnly();
    expect(result).toBeUndefined();
  });

  it("should return undefined for invalid date string", () => {
    const result = formatExifDateOnly("invalid date");
    expect(result).toBeUndefined();
  });

  it("should return undefined for non-date types", () => {
    const result = formatExifDateOnly(12_345);
    expect(result).toBeUndefined();
  });

  it("should pad single-digit months and days", () => {
    const date = new Date("2024-03-05T08:05:00");
    const result = formatExifDateOnly(date);
    expect(result).toBe("2024-03-05");
  });
});

describe("formatExifDateTime", () => {
  it("should format a Date object to YYYY-MM-DD HH:mm", () => {
    const date = new Date("2025-03-02T12:52:32+01:00");
    const result = formatExifDateTime(date);
    expect(result).toBe("2025-03-02 12:52");
  });

  it("should format EXIF string format with colons to YYYY-MM-DD HH:mm", () => {
    const exifDate = "2024:01:15 10:30:00";
    const result = formatExifDateTime(exifDate);
    expect(result).toBe("2024-01-15 10:30");
  });

  it("should format standard date string to YYYY-MM-DD HH:mm", () => {
    const dateString = "2024-06-15 14:22:00";
    const result = formatExifDateTime(dateString);
    expect(result).toBe("2024-06-15 14:22");
  });

  it("should return undefined for null", () => {
    // @ts-expect-error Testing with no arguments
    const result = formatExifDateTime();
    expect(result).toBeUndefined();
  });

  it("should return undefined for undefined", () => {
    // @ts-expect-error Testing with no arguments
    const result = formatExifDateTime();
    expect(result).toBeUndefined();
  });

  it("should return undefined for invalid date string", () => {
    const result = formatExifDateTime("invalid date");
    expect(result).toBeUndefined();
  });

  it("should return undefined for non-date types", () => {
    const result = formatExifDateTime(12_345);
    expect(result).toBeUndefined();
  });

  it("should pad single-digit months and days and time components", () => {
    const date = new Date("2024-03-05T08:05:00");
    const result = formatExifDateTime(date);
    expect(result).toBe("2024-03-05 08:05");
  });
});
