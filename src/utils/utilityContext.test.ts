import { describe, it, expect } from "vitest";
import { createUtilityContext } from "./utilityContext";
import type { Image } from "../store/imageSetStore";

describe("createUtilityContext", () => {
  it("should extract extension from image name", () => {
    const image: Image = {
      name: "photo.jpg",
      base64: "",
      file: new File([], "photo.jpg"),
      exifData: {},
    };

    const result = createUtilityContext(image, 0);

    expect(result.extension).toBe("jpg");
  });

  it("should lowercase the extension", () => {
    const image: Image = {
      name: "photo.JPG",
      base64: "",
      file: new File([], "photo.JPG"),
      exifData: {},
    };

    const result = createUtilityContext(image, 0);

    expect(result.extension).toBe("jpg");
  });

  it("should handle image without extension", () => {
    const image: Image = {
      name: "photo",
      base64: "",
      file: new File([], "photo"),
      exifData: {},
    };

    const result = createUtilityContext(image, 0);

    expect(result.extension).toBe("");
  });

  it("should handle filename with multiple dots", () => {
    const image: Image = {
      name: "my.photo.file.png",
      base64: "",
      file: new File([], "my.photo.file.png"),
      exifData: {},
    };

    const result = createUtilityContext(image, 0);

    expect(result.extension).toBe("png");
  });

  it("should return the correct index", () => {
    const image: Image = {
      name: "photo.jpg",
      base64: "",
      file: new File([], "photo.jpg"),
      exifData: {},
    };

    const result = createUtilityContext(image, 5);

    expect(result.index).toBe(5);
  });

  it("should format DateTimeOriginal when available", () => {
    const image: Image = {
      name: "photo.jpg",
      base64: "",
      file: new File([], "photo.jpg"),
      exifData: {
        DateTimeOriginal: new Date("2025-06-15T11:02:00"),
      },
    };

    const result = createUtilityContext(image, 0);

    expect(result.date).toBe("2025-06-15 11:02");
  });

  it("should fallback to CreateDate when DateTimeOriginal is missing", () => {
    const image: Image = {
      name: "photo.jpg",
      base64: "",
      file: new File([], "photo.jpg"),
      exifData: {
        CreateDate: new Date("2024-03-11T12:55:48"),
      },
    };

    const result = createUtilityContext(image, 0);

    expect(result.date).toBe("2024-03-11 12:55");
  });

  it("should prefer DateTimeOriginal over CreateDate when both exist", () => {
    const image: Image = {
      name: "photo.jpg",
      base64: "",
      file: new File([], "photo.jpg"),
      exifData: {
        DateTimeOriginal: new Date("2025-06-15T11:02:00"),
        CreateDate: new Date("2024-03-11T12:55:48"),
      },
    };

    const result = createUtilityContext(image, 0);

    expect(result.date).toBe("2025-06-15 11:02");
  });

  it("should return undefined date when no date is available", () => {
    const image: Image = {
      name: "photo.jpg",
      base64: "",
      file: new File([], "photo.jpg"),
      exifData: {},
    };

    const result = createUtilityContext(image, 0);

    expect(result.date).toBeUndefined();
  });

  it("should handle EXIF string dates", () => {
    const image: Image = {
      name: "photo.jpg",
      base64: "",
      file: new File([], "photo.jpg"),
      exifData: {
        DateTimeOriginal: "2024:01:15 10:30:00",
      },
    };

    const result = createUtilityContext(image, 0);

    expect(result.date).toBe("2024-01-15 10:30");
  });

  it("should handle missing exifData", () => {
    const image: Image = {
      name: "photo.jpg",
      base64: "",
      file: new File([], "photo.jpg"),
    };

    const result = createUtilityContext(image, 0);

    expect(result.extension).toBe("jpg");
    expect(result.index).toBe(0);
    expect(result.date).toBeUndefined();
  });

  it("should return all three properties in the result", () => {
    const image: Image = {
      name: "image.gif",
      base64: "",
      file: new File([], "image.gif"),
      exifData: {
        DateTimeOriginal: new Date("2025-12-25T09:30:15"),
      },
    };

    const result = createUtilityContext(image, 3);

    expect(result).toEqual({
      extension: "gif",
      index: 3,
      date: "2025-12-25 09:30",
    });
  });
});
