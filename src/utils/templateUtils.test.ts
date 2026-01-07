import { describe, it, expect } from "vitest";
import { extractTemplateKeys, applyTemplate } from "./templateUtils";

describe("extractTemplateKeys", () => {
  it("should extract a single key from a template", () => {
    const template = "Hello, <<<name>>>!";
    const keys = extractTemplateKeys(template);
    expect(keys).toEqual(["name"]);
  });

  it("should extract multiple unique keys from a template", () => {
    const template = "<<<greeting>>>, <<<name>>>! Welcome to <<<place>>>.";
    const keys = extractTemplateKeys(template);
    expect(keys).toEqual(["greeting", "name", "place"]);
  });

  it("should return unique keys when duplicates exist", () => {
    const template = "<<<name>>> is <<<name>>> and <<<other>>>";
    const keys = extractTemplateKeys(template);
    expect(keys).toEqual(["name", "other"]);
  });

  it("should handle keys with whitespace and trim them", () => {
    const template = "<<<  name  >>> and <<< other >>>";
    const keys = extractTemplateKeys(template);
    expect(keys).toEqual(["name", "other"]);
  });

  it("should return empty array for template with no keys", () => {
    const template = "Hello, world!";
    const keys = extractTemplateKeys(template);
    expect(keys).toEqual([]);
  });

  it("should handle nested path keys like exif.field", () => {
    const template = "Date: <<<exif.DateTimeOriginal>>>";
    const keys = extractTemplateKeys(template);
    expect(keys).toEqual(["exif.DateTimeOriginal"]);
  });

  it("should handle empty template", () => {
    const template = "";
    const keys = extractTemplateKeys(template);
    expect(keys).toEqual([]);
  });

  it("should not extract from malformed patterns", () => {
    const template = "{{name}} and {name} and <<<name>>>";
    const keys = extractTemplateKeys(template);
    expect(keys).toEqual(["name"]);
  });
});

describe("applyTemplate", () => {
  describe("basic substitution", () => {
    it("should substitute a single variable from local keys", () => {
      const result = applyTemplate("Hello, <<<name>>>!", { name: "World" });
      expect(result).toBe("Hello, World!");
    });

    it("should substitute multiple variables from local keys", () => {
      const result = applyTemplate("<<<greeting>>>, <<<name>>>!", {
        greeting: "Hello",
        name: "World",
      });
      expect(result).toBe("Hello, World!");
    });

    it("should substitute from globalVariables", () => {
      const result = applyTemplate("Author: <<<global.author>>>", {
        global: { author: "John Doe" },
      });
      expect(result).toBe("Author: John Doe");
    });

    it("should prefer local keys over globalVariables", () => {
      const result = applyTemplate("Name: <<<name>>>", {
        name: "Image Name",
        global: { name: "Global Name" },
      });
      expect(result).toBe("Name: Image Name");
    });

    it("should use global variables when using global. prefix", () => {
      const result = applyTemplate("Name: <<<global.name>>>", {
        name: "",
        global: { name: "Global Name" },
      });
      expect(result).toBe("Name: Global Name");
    });
  });

  describe("EXIF data substitution", () => {
    it("should substitute from exif data using exif. prefix", () => {
      const result = applyTemplate("Date: <<<exif.DateTimeOriginal>>>", {
        exif: { DateTimeOriginal: "2024:01:15 10:30:00" },
      });
      expect(result).toBe("Date: 2024:01:15 10:30:00");
    });

    it("should handle nested exif data paths", () => {
      const result = applyTemplate("Value: <<<exif.GPS.Latitude>>>", {
        exif: { GPS: { Latitude: 52.3676 } },
      });
      expect(result).toBe("Value: 52.3676");
    });

    it("should convert numeric exif values to strings", () => {
      const result = applyTemplate("ISO: <<<exif.ISO>>>", {
        exif: { ISO: 400 },
      });
      expect(result).toBe("ISO: 400");
    });

    it("should handle missing exif fields with placeholder", () => {
      const result = applyTemplate("Missing: <<<exif.NonExistent>>>", {
        exif: {},
      });
      expect(result).toBe("Missing: <<<missing>>>");
    });
  });

  describe("missing value handling", () => {
    it("should show missing placeholder for undefined variables", () => {
      const result = applyTemplate("Value: <<<unknown>>>", {});
      expect(result).toBe("Value: <<<missing>>>");
    });

    it("should show missing placeholder for empty string values", () => {
      const result = applyTemplate("Value: <<<empty>>>", {
        empty: "",
        global: { empty: "" },
      });
      expect(result).toBe("Value: <<<missing>>>");
    });

    it("should handle mix of found and missing variables", () => {
      const result = applyTemplate("<<<found>>> and <<<missing>>>", {
        found: "Here",
      });
      expect(result).toBe("Here and <<<missing>>>");
    });
  });

  describe("recursive resolution", () => {
    it("should resolve variables that reference other variables", () => {
      const result = applyTemplate("<<<global.outer>>>", {
        global: { outer: "Hello, <<<global.inner>>>!", inner: "World" },
      });
      expect(result).toBe("Hello, World!");
    });

    it("should resolve deeply nested variable references", () => {
      const result = applyTemplate("<<<global.level1>>>", {
        global: {
          level1: "A-<<<global.level2>>>",
          level2: "B-<<<global.level3>>>",
          level3: "C",
        },
      });
      expect(result).toBe("A-B-C");
    });

    it("should handle circular references by stopping at max iterations", () => {
      const result = applyTemplate("<<<a>>>", {
        global: { a: "<<<b>>>", b: "<<<a>>>" },
      });
      // After max iterations, unresolved variables become missing
      expect(result).toBe("<<<missing>>>");
    });

    it("should respect maxIterations parameter", () => {
      const result = applyTemplate(
        "<<<level1>>>",
        {
          global: {
            level1: "<<<level2>>>",
            level2: "<<<level3>>>",
            level3: "Done",
          },
        },
        2 // Only 2 iterations allowed
      );
      // With 2 iterations: level1 -> level2 -> level3, but level3 doesn't resolve
      expect(result).toBe("<<<missing>>>");
    });
  });

  describe("edge cases", () => {
    it("should handle empty template", () => {
      const result = applyTemplate("", {});
      expect(result).toBe("");
    });

    it("should handle template with no variables", () => {
      const result = applyTemplate("Plain text", {});
      expect(result).toBe("Plain text");
    });

    it("should handle keys with whitespace", () => {
      const result = applyTemplate("Value: <<<  spacedKey  >>>", {
        spacedKey: "Found",
      });
      expect(result).toBe("Value: Found");
    });

    it("should handle special characters in values", () => {
      const result = applyTemplate("<<<value>>>", {
        value: "Special <>&\"' chars",
      });
      expect(result).toBe("Special <>&\"' chars");
    });

    it("should handle multiline templates", () => {
      const result = applyTemplate("Line 1: <<<a>>>\nLine 2: <<<b>>>", {
        a: "A",
        b: "B",
      });
      expect(result).toBe("Line 1: A\nLine 2: B");
    });

    it("should handle null exif values", () => {
      // Using null explicitly here to test how external EXIF data is handled
      const result = applyTemplate(
        "Value: <<<exif.nullField>>>",
        // eslint-disable-next-line unicorn/no-null
        { exif: { nullField: null } }
      );
      expect(result).toBe("Value: <<<missing>>>");
    });

    it("should handle 0 as a valid value", () => {
      const result = applyTemplate("Value: <<<exif.zero>>>", {
        exif: { zero: 0 },
      });
      expect(result).toBe("Value: 0");
    });

    it("should handle boolean exif values", () => {
      const result = applyTemplate("Flash: <<<exif.Flash>>>", {
        exif: { Flash: true },
      });
      expect(result).toBe("Flash: true");
    });
  });

  describe("complex real-world scenarios", () => {
    it("should handle Wikimedia Commons template", () => {
      const template = `=={{int:filedesc}}==
{{Information
|description={{en|1=<<<description>>>}}
|date=<<<exif.DateTimeOriginal>>>
|source={{own}}
|author=[[User:<<<global.author>>>|<<<global.author>>>]]
}}`;

      const result = applyTemplate(template, {
        description: "A beautiful sunset",
        global: { author: "JohnDoe" },
        exif: { DateTimeOriginal: "2024-01-15" },
      });

      expect(result).toContain("A beautiful sunset");
      expect(result).toContain("2024-01-15");
      expect(result).toContain("JohnDoe");
    });

    it("should handle mixed sources in one template", () => {
      const result = applyTemplate(
        "<<<title>>> by <<<global.author>>> (<<<exif.Year>>>)",
        {
          title: "My Photo",
          global: { author: "Jane" },
          exif: { Year: 2024 },
        }
      );
      expect(result).toBe("My Photo by Jane (2024)");
    });
  });

  describe("explicit global. prefix substitution", () => {
    it("should substitute from globalVariables using global. prefix", () => {
      const result = applyTemplate("Author: <<<global.author>>>", {
        global: { author: "John Doe" },
      });
      expect(result).toBe("Author: John Doe");
    });

    it("should use global. prefix to explicitly reference global over local key", () => {
      const result = applyTemplate("<<<name>>> vs <<<global.name>>>", {
        name: "Image Name",
        global: { name: "Global Name" },
      });
      expect(result).toBe("Image Name vs Global Name");
    });

    it("should allow mixing global. and implicit global fallback", () => {
      const result = applyTemplate("<<<description>>> by <<<global.author>>>", {
        description: "My Description",
        global: { author: "Global Author" },
      });
      expect(result).toBe("My Description by Global Author");
    });

    it("should handle missing global. prefixed variables", () => {
      const result = applyTemplate("Value: <<<global.nonexistent>>>", {});
      expect(result).toBe("Value: <<<missing>>>");
    });

    it("should resolve local key containing global. reference recursively", () => {
      const result = applyTemplate("<<<description>>>", {
        description: "Photo taken in <<<global.location>>>",
        global: { location: "Amsterdam" },
      });
      expect(result).toBe("Photo taken in Amsterdam");
    });

    it("should handle global. prefix in complex real-world template", () => {
      const template = `=={{int:filedesc}}==
{{Information
|description={{en|1=<<<description>>>}}
|date=<<<exif.DateTimeOriginal>>>
|source={{own}}
|author=[[User:<<<global.username>>>|<<<global.username>>>]]
}}

[[Category:<<<global.category>>>]]`;

      const result = applyTemplate(template, {
        description: "A beautiful sunset",
        global: { username: "JohnDoe", category: "Sunsets" },
        exif: { DateTimeOriginal: "2024-01-15" },
      });

      expect(result).toContain("A beautiful sunset");
      expect(result).toContain("2024-01-15");
      expect(result).toContain("JohnDoe");
      expect(result).toContain("[[Category:Sunsets]]");
    });

    it("should resolve utility context values", () => {
      const result = applyTemplate(
        "File_<<<utility.index>>>_of_type.<<<utility.extension>>>",
        {
          utility: { extension: "jpg", index: 5 },
        }
      );
      expect(result).toBe("File_5_of_type.jpg");
    });

    it("should combine utility with other context types", () => {
      const result = applyTemplate(
        "<<<global.author>>>_photo_<<<utility.index>>>.<<<utility.extension>>>",
        {
          global: { author: "JohnDoe" },
          utility: { extension: "png", index: 0 },
        }
      );
      expect(result).toBe("JohnDoe_photo_0.png");
    });

    it("should resolve utility.date value", () => {
      const result = applyTemplate("Date taken: <<<utility.date>>>", {
        utility: { extension: "jpg", index: 0, date: "2025-06-15 11:02" },
      });
      expect(result).toBe("Date taken: 2025-06-15 11:02");
    });

    it("should handle missing utility.date", () => {
      const result = applyTemplate("Date: <<<utility.date>>>", {
        utility: { extension: "jpg", index: 0 },
      });
      expect(result).toBe("Date: <<<missing>>>");
    });
  });
});
