import { describe, it, expect } from "vitest";
import { createUtilityContext } from "./utilityContext";
import type { Image } from "../store/imageSetStore";

/**
 * Helper function to create a minimal Image object for testing
 *
 * @param name - The name/filename of the test image
 * @param exifData - Optional EXIF metadata for the test image
 * @returns Mock Image object for use in tests
 */
function createTestImage(
  name: string,
  exifData?: Record<string, unknown>,
): Image {
  return {
    id: crypto.randomUUID(),
    name,
    mimeType: "image/jpeg",
    keys: {},
    reviewed: false,
    exifData,
  };
}

describe("createUtilityContext", () => {
  it("should extract extension from image name", () => {
    const image = createTestImage("photo.jpg", {});

    const result = createUtilityContext(image, 0);

    expect(result.extension).toBe("jpg");
  });

  it("should lowercase the extension", () => {
    const image = createTestImage("photo.JPG", {});

    const result = createUtilityContext(image, 0);

    expect(result.extension).toBe("jpg");
  });

  it("should handle image without extension", () => {
    const image = createTestImage("photo", {});

    const result = createUtilityContext(image, 0);

    expect(result.extension).toBe("");
  });

  it("should handle filename with multiple dots", () => {
    const image = createTestImage("my.photo.file.png", {});

    const result = createUtilityContext(image, 0);

    expect(result.extension).toBe("png");
  });

  it("should return the correct 1-based index", () => {
    const image = createTestImage("photo.jpg", {});

    const result = createUtilityContext(image, 5);

    // Index is 1-based, so passing 5 (0-based) returns 6
    expect(result.index).toBe(6);
  });

  it("should format DateTimeOriginal when available", () => {
    const image = createTestImage("photo.jpg", {
      DateTimeOriginal: new Date("2025-06-15T11:02:00"),
    });

    const result = createUtilityContext(image, 0);

    expect(result.date).toBe("2025-06-15");
    expect(result.dateTime).toBe("2025-06-15 11:02");
  });

  it("should fallback to CreateDate when DateTimeOriginal is missing", () => {
    const image = createTestImage("photo.jpg", {
      CreateDate: new Date("2024-03-11T12:55:48"),
    });

    const result = createUtilityContext(image, 0);

    expect(result.date).toBe("2024-03-11");
    expect(result.dateTime).toBe("2024-03-11 12:55");
  });

  it("should prefer DateTimeOriginal over CreateDate when both exist", () => {
    const image = createTestImage("photo.jpg", {
      DateTimeOriginal: new Date("2025-06-15T11:02:00"),
      CreateDate: new Date("2024-03-11T12:55:48"),
    });

    const result = createUtilityContext(image, 0);

    expect(result.date).toBe("2025-06-15");
    expect(result.dateTime).toBe("2025-06-15 11:02");
  });

  it("should return undefined date when no date is available", () => {
    const image = createTestImage("photo.jpg", {});

    const result = createUtilityContext(image, 0);

    expect(result.date).toBeUndefined();
    expect(result.dateTime).toBeUndefined();
  });

  it("should handle EXIF string dates", () => {
    const image = createTestImage("photo.jpg", {
      DateTimeOriginal: "2024:01:15 10:30:00",
    });

    const result = createUtilityContext(image, 0);

    expect(result.date).toBe("2024-01-15");
    expect(result.dateTime).toBe("2024-01-15 10:30");
  });

  it("should handle missing exifData", () => {
    const image = createTestImage("photo.jpg");

    const result = createUtilityContext(image, 0);

    expect(result.extension).toBe("jpg");
    expect(result.index).toBe(1); // 1-based index
    expect(result.date).toBeUndefined();
    expect(result.dateTime).toBeUndefined();
  });

  it("should return all four properties in the result", () => {
    const image = createTestImage("image.gif", {
      DateTimeOriginal: new Date("2025-12-25T09:30:15"),
    });

    const result = createUtilityContext(image, 3);

    expect(result).toEqual({
      extension: "gif",
      index: 4, // 1-based index (3 + 1)
      date: "2025-12-25",
      dateTime: "2025-12-25 09:30",
    });
  });
});
