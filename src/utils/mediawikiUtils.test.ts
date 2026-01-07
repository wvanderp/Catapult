import { describe, it, expect } from "vitest";
import { normalizeMediaWikiFilename } from "./mediawikiUtils";

describe("normalizeMediaWikiFilename", () => {
  describe("basic normalization", () => {
    it("should replace spaces with underscores", () => {
      expect(normalizeMediaWikiFilename("my image.jpg")).toBe("My_image.jpg");
    });

    it("should capitalize the first character", () => {
      expect(normalizeMediaWikiFilename("lowercase.png")).toBe("Lowercase.png");
    });

    it("should handle already capitalized filenames", () => {
      expect(normalizeMediaWikiFilename("Already_Capitalized.jpg")).toBe(
        "Already_Capitalized.jpg"
      );
    });

    it("should handle multiple spaces", () => {
      expect(normalizeMediaWikiFilename("file with multiple spaces.jpg")).toBe(
        "File_with_multiple_spaces.jpg"
      );
    });

    it("should handle empty string", () => {
      expect(normalizeMediaWikiFilename("")).toBe("");
    });

    it("should handle filename starting with a number", () => {
      expect(normalizeMediaWikiFilename("123 photo.jpg")).toBe("123_photo.jpg");
    });

    it("should handle filename with parentheses", () => {
      expect(normalizeMediaWikiFilename("photo (2024).jpg")).toBe(
        "Photo_(2024).jpg"
      );
    });

    it("should handle filename with unicode characters", () => {
      expect(normalizeMediaWikiFilename("über image.jpg")).toBe(
        "Über_image.jpg"
      );
    });

    it("should handle single character filename", () => {
      expect(normalizeMediaWikiFilename("a")).toBe("A");
    });

    it("should handle filename with only underscores (no spaces)", () => {
      expect(normalizeMediaWikiFilename("already_has_underscores.jpg")).toBe(
        "Already_has_underscores.jpg"
      );
    });

    it("should handle mixed spaces and underscores", () => {
      expect(normalizeMediaWikiFilename("some_file name.jpg")).toBe(
        "Some_file_name.jpg"
      );
    });
  });

  describe("forbidden character replacement", () => {
    it("should replace colons with dashes", () => {
      expect(normalizeMediaWikiFilename("photo 12:30:45.jpg")).toBe(
        "Photo_12-30-45.jpg"
      );
    });

    it("should replace hash with dash", () => {
      expect(normalizeMediaWikiFilename("file#1.jpg")).toBe("File-1.jpg");
    });

    it("should replace angle brackets with dashes", () => {
      expect(normalizeMediaWikiFilename("file<test>.jpg")).toBe(
        "File-test-.jpg"
      );
    });

    it("should replace square brackets with parentheses", () => {
      expect(normalizeMediaWikiFilename("file[1].jpg")).toBe("File(1).jpg");
    });

    it("should replace curly braces with parentheses", () => {
      expect(normalizeMediaWikiFilename("file{1}.jpg")).toBe("File(1).jpg");
    });

    it("should replace pipe with dash", () => {
      expect(normalizeMediaWikiFilename("file|name.jpg")).toBe("File-name.jpg");
    });

    it("should handle multiple forbidden characters", () => {
      expect(normalizeMediaWikiFilename("file:name#1<2>[3].jpg")).toBe(
        "File-name-1-2-(3).jpg"
      );
    });
  });

  describe("underscore normalization", () => {
    it("should collapse multiple consecutive underscores", () => {
      expect(normalizeMediaWikiFilename("file__name.jpg")).toBe(
        "File_name.jpg"
      );
    });

    it("should collapse many consecutive underscores", () => {
      expect(normalizeMediaWikiFilename("file_____name.jpg")).toBe(
        "File_name.jpg"
      );
    });

    it("should trim leading underscores", () => {
      expect(normalizeMediaWikiFilename("___file.jpg")).toBe("File.jpg");
    });

    it("should trim trailing underscores before extension", () => {
      expect(normalizeMediaWikiFilename("file___.jpg")).toBe("File.jpg");
    });

    it("should handle underscores from space replacement that need collapsing", () => {
      expect(normalizeMediaWikiFilename("file   name.jpg")).toBe(
        "File_name.jpg"
      );
    });

    it("should handle leading spaces", () => {
      expect(normalizeMediaWikiFilename("   file.jpg")).toBe("File.jpg");
    });

    it("should handle trailing spaces before extension", () => {
      expect(normalizeMediaWikiFilename("file   .jpg")).toBe("File.jpg");
    });
  });

  describe("real-world scenarios", () => {
    it("should handle timestamp with colons (common camera format)", () => {
      expect(normalizeMediaWikiFilename("Photo 2025-03-02 12:52:30.jpg")).toBe(
        "Photo_2025-03-02_12-52-30.jpg"
      );
    });

    it("should handle the exact case from the bug report", () => {
      // Original likely had colons in time: "Zuidspuistraat 4, Brielle - (2025-03-02 12:52).jpg"
      const input = "Zuidspuistraat 4, Brielle - (2025-03-02 12:52).jpg";
      const expected = "Zuidspuistraat_4,_Brielle_-_(2025-03-02_12-52).jpg";
      expect(normalizeMediaWikiFilename(input)).toBe(expected);
    });

    it("should match MediaWiki's expected output for typical upload filenames", () => {
      const testCases = [
        { input: "DSC 1234.jpg", expected: "DSC_1234.jpg" },
        { input: "my vacation photo.png", expected: "My_vacation_photo.png" },
        {
          input: "Screenshot 2024-01-15.png",
          expected: "Screenshot_2024-01-15.png",
        },
        {
          input: "IMG_20240115_123456.jpg",
          expected: "IMG_20240115_123456.jpg",
        },
      ];

      for (const { input, expected } of testCases) {
        expect(normalizeMediaWikiFilename(input)).toBe(expected);
      }
    });

    it("should handle Dutch street address format", () => {
      expect(normalizeMediaWikiFilename("Hoofdstraat 123, Amsterdam.jpg")).toBe(
        "Hoofdstraat_123,_Amsterdam.jpg"
      );
    });

    it("should handle filename without extension", () => {
      expect(normalizeMediaWikiFilename("my file name")).toBe("My_file_name");
    });

    it("should handle filename with multiple dots", () => {
      expect(normalizeMediaWikiFilename("file.name.with.dots.jpg")).toBe(
        "File.name.with.dots.jpg"
      );
    });
  });
});
