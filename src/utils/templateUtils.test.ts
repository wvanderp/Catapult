import { describe, it, expect } from "vitest";
import {
  extractTemplateKeys,
  applyTemplate,
  processConditionals,
} from "./templateUtils";

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

  it("should ignore empty <<<>>> brackets (match[1] falsy branch)", () => {
    const keys = extractTemplateKeys("before <<<>>> after");
    expect(keys).toEqual([]);
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
        2, // Only 2 iterations allowed
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
      const result = applyTemplate("Value: <<<exif.nullField>>>", {
        exif: { nullField: null },
      });
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

    it("should trim whitespace from variable values", () => {
      const result = applyTemplate("Value: <<<name>>>", {
        name: "  John Doe  ",
      });
      expect(result).toBe("Value: John Doe");
    });

    it("should trim whitespace from nested exif values", () => {
      const result = applyTemplate("Camera: <<<exif.Make>>>", {
        exif: { Make: "  Canon  " },
      });
      expect(result).toBe("Camera: Canon");
    });

    it("should trim whitespace from global values", () => {
      const result = applyTemplate("Author: <<<global.author>>>", {
        global: { author: "\n\tJane Doe\t\n" },
      });
      expect(result).toBe("Author: Jane Doe");
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
        },
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
        },
      );
      expect(result).toBe("File_5_of_type.jpg");
    });

    it("should combine utility with other context types", () => {
      const result = applyTemplate(
        "<<<global.author>>>_photo_<<<utility.index>>>.<<<utility.extension>>>",
        {
          global: { author: "JohnDoe" },
          utility: { extension: "png", index: 0 },
        },
      );
      expect(result).toBe("JohnDoe_photo_0.png");
    });

    it("should resolve utility.date value", () => {
      const result = applyTemplate("Date taken: <<<utility.date>>>", {
        utility: { extension: "jpg", index: 0, date: "2025-06-15" },
      });
      expect(result).toBe("Date taken: 2025-06-15");
    });

    it("should resolve utility.dateTime value", () => {
      const result = applyTemplate("DateTime taken: <<<utility.dateTime>>>", {
        utility: { extension: "jpg", index: 0, dateTime: "2025-06-15 11:02" },
      });
      expect(result).toBe("DateTime taken: 2025-06-15 11:02");
    });

    it("should handle missing utility.date", () => {
      const result = applyTemplate("Date: <<<utility.date>>>", {
        utility: { extension: "jpg", index: 0 },
      });
      expect(result).toBe("Date: <<<missing>>>");
    });

    it("should handle missing utility.dateTime", () => {
      const result = applyTemplate("DateTime: <<<utility.dateTime>>>", {
        utility: { extension: "jpg", index: 0 },
      });
      expect(result).toBe("DateTime: <<<missing>>>");
    });
  });
});

describe("processConditionals", () => {
  describe("basic conditional behavior", () => {
    it("should include content when variable is defined", () => {
      const template = "<<<if {name}>>>Hello <<<name>>><<<endif>>>";
      const result = processConditionals(template, { name: "World" });
      expect(result).toBe("Hello <<<name>>>");
    });

    it("should exclude content when variable is undefined", () => {
      const template = "<<<if {name}>>>Hello <<<name>>><<<endif>>>";
      const result = processConditionals(template, {});
      expect(result).toBe("");
    });

    it("should exclude content when variable is empty string", () => {
      const template = "<<<if {name}>>>Hello <<<name>>><<<endif>>>";
      const result = processConditionals(template, { name: "" });
      expect(result).toBe("");
    });

    it("should exclude content when variable is whitespace-only string", () => {
      const template = "<<<if {name}>>>Hello <<<name>>><<<endif>>>";
      const result = processConditionals(template, { name: "   " });
      expect(result).toBe("");
    });

    it("should exclude content when variable is null", () => {
      const template = "<<<if {name}>>>Hello <<<name>>><<<endif>>>";
      const result = processConditionals(template, { name: null });
      expect(result).toBe("");
    });

    it("should include content when variable is 0 (number)", () => {
      const template = "<<<if {count}>>>Count: <<<count>>><<<endif>>>";
      const result = processConditionals(template, { count: 0 });
      expect(result).toBe("Count: <<<count>>>");
    });

    it("should include content when variable is false (boolean)", () => {
      const template = "<<<if {flag}>>>Flag: <<<flag>>><<<endif>>>";
      const result = processConditionals(template, { flag: false });
      expect(result).toBe("Flag: <<<flag>>>");
    });

    it("should preserve text before and after conditional", () => {
      const template = "Before <<<if {name}>>>middle<<<endif>>> After";
      const result = processConditionals(template, { name: "test" });
      expect(result).toBe("Before middle After");
    });

    it("should preserve text when conditional is excluded", () => {
      const template = "Before <<<if {name}>>>middle<<<endif>>> After";
      const result = processConditionals(template, {});
      expect(result).toBe("Before  After");
    });
  });

  describe("nested path variables", () => {
    it("should check exif variables with dot notation", () => {
      const template = "<<<if {exif.Make}>>>Camera: <<<exif.Make>>><<<endif>>>";
      const result = processConditionals(template, { exif: { Make: "Canon" } });
      expect(result).toBe("Camera: <<<exif.Make>>>");
    });

    it("should exclude when exif variable is missing", () => {
      const template = "<<<if {exif.Make}>>>Camera: <<<exif.Make>>><<<endif>>>";
      const result = processConditionals(template, { exif: {} });
      expect(result).toBe("");
    });

    it("should check global variables with dot notation", () => {
      const template =
        "<<<if {global.author}>>>By <<<global.author>>><<<endif>>>";
      const result = processConditionals(template, {
        global: { author: "John" },
      });
      expect(result).toBe("By <<<global.author>>>");
    });

    it("should check utility variables with dot notation", () => {
      const template =
        "<<<if {utility.date}>>>Date: <<<utility.date>>><<<endif>>>";
      const result = processConditionals(template, {
        utility: { extension: "jpg", index: 0, date: "2025-01-15" },
      });
      expect(result).toBe("Date: <<<utility.date>>>");
    });

    it("should exclude when utility variable is missing", () => {
      const template =
        "<<<if {utility.date}>>>Date: <<<utility.date>>><<<endif>>>";
      const result = processConditionals(template, {
        utility: { extension: "jpg", index: 0 },
      });
      expect(result).toBe("");
    });

    it("should handle deeply nested paths", () => {
      const template = "<<<if {exif.GPS.Latitude}>>>Location<<<endif>>>";
      const result = processConditionals(template, {
        exif: { GPS: { Latitude: 52.3676 } },
      });
      expect(result).toBe("Location");
    });

    it("should exclude when deeply nested path is missing", () => {
      const template = "<<<if {exif.GPS.Latitude}>>>Location<<<endif>>>";
      const result = processConditionals(template, { exif: { GPS: {} } });
      expect(result).toBe("");
    });
  });

  describe("nested conditionals", () => {
    it("should handle simple nested conditionals - both true", () => {
      const template =
        "<<<if {outer}>>>Outer[<<<if {inner}>>>Inner<<<endif>>>]<<<endif>>>";
      const result = processConditionals(template, {
        outer: "yes",
        inner: "yes",
      });
      expect(result).toBe("Outer[Inner]");
    });

    it("should handle simple nested conditionals - outer true, inner false", () => {
      const template =
        "<<<if {outer}>>>Outer[<<<if {inner}>>>Inner<<<endif>>>]<<<endif>>>";
      const result = processConditionals(template, { outer: "yes", inner: "" });
      expect(result).toBe("Outer[]");
    });

    it("should handle simple nested conditionals - outer false", () => {
      const template =
        "<<<if {outer}>>>Outer[<<<if {inner}>>>Inner<<<endif>>>]<<<endif>>>";
      const result = processConditionals(template, {
        outer: "",
        inner: "yes",
      });
      expect(result).toBe("");
    });

    it("should handle three levels of nesting - all true", () => {
      const template =
        "<<<if {a}>>>A[<<<if {b}>>>B[<<<if {c}>>>C<<<endif>>>]<<<endif>>>]<<<endif>>>";
      const result = processConditionals(template, {
        a: "1",
        b: "2",
        c: "3",
      });
      expect(result).toBe("A[B[C]]");
    });

    it("should handle three levels of nesting - middle false", () => {
      const template =
        "<<<if {a}>>>A[<<<if {b}>>>B[<<<if {c}>>>C<<<endif>>>]<<<endif>>>]<<<endif>>>";
      const result = processConditionals(template, { a: "1", b: "", c: "3" });
      expect(result).toBe("A[]");
    });

    it("should handle multiple nested conditionals in sequence", () => {
      const template =
        "<<<if {a}>>>[<<<if {b}>>>B<<<endif>>>][<<<if {c}>>>C<<<endif>>>]<<<endif>>>";
      const result = processConditionals(template, { a: "1", b: "2", c: "3" });
      expect(result).toBe("[B][C]");
    });

    it("should handle multiple nested conditionals - some false", () => {
      const template =
        "<<<if {a}>>>[<<<if {b}>>>B<<<endif>>>][<<<if {c}>>>C<<<endif>>>]<<<endif>>>";
      const result = processConditionals(template, { a: "1", b: "", c: "3" });
      expect(result).toBe("[][C]");
    });
  });

  describe("multiple conditionals", () => {
    it("should handle multiple independent conditionals", () => {
      const template =
        "<<<if {a}>>>A<<<endif>>> <<<if {b}>>>B<<<endif>>> <<<if {c}>>>C<<<endif>>>";
      const result = processConditionals(template, {
        a: "1",
        b: "2",
        c: "3",
      });
      expect(result).toBe("A B C");
    });

    it("should handle multiple conditionals - some false", () => {
      const template =
        "<<<if {a}>>>A<<<endif>>> <<<if {b}>>>B<<<endif>>> <<<if {c}>>>C<<<endif>>>";
      const result = processConditionals(template, { a: "1", b: "", c: "3" });
      expect(result).toBe("A  C");
    });

    it("should handle multiple conditionals - all false", () => {
      const template =
        "<<<if {a}>>>A<<<endif>>> <<<if {b}>>>B<<<endif>>> <<<if {c}>>>C<<<endif>>>";
      const result = processConditionals(template, { a: "", b: "", c: "" });
      expect(result).toBe("  ");
    });
  });

  describe("whitespace handling", () => {
    it("should handle whitespace in variable name", () => {
      const template = "<<<if { name }>>>Hello<<<endif>>>";
      const result = processConditionals(template, { name: "World" });
      expect(result).toBe("Hello");
    });

    it("should preserve whitespace in content", () => {
      const template = "<<<if {name}>>>  Hello  World  <<<endif>>>";
      const result = processConditionals(template, { name: "test" });
      expect(result).toBe("  Hello  World  ");
    });

    it("should handle multiline content", () => {
      const template = `<<<if {author}>>>
Author: <<<author>>>
License: CC-BY-SA
<<<endif>>>`;
      const result = processConditionals(template, { author: "John" });
      expect(result).toBe(`
Author: <<<author>>>
License: CC-BY-SA
`);
    });

    it("should handle newlines between conditionals", () => {
      const template = `<<<if {a}>>>A<<<endif>>>
<<<if {b}>>>B<<<endif>>>`;
      const result = processConditionals(template, { a: "1", b: "2" });
      expect(result).toBe(`A
B`);
    });
  });

  describe("edge cases", () => {
    it("should return template unchanged when no conditionals", () => {
      const template = "Hello <<<name>>>!";
      const result = processConditionals(template, { name: "World" });
      expect(result).toBe("Hello <<<name>>>!");
    });

    it("should handle empty template", () => {
      const result = processConditionals("", {});
      expect(result).toBe("");
    });

    it("should handle conditional with empty content", () => {
      const template = "<<<if {name}>>><<<endif>>>";
      const result = processConditionals(template, { name: "test" });
      expect(result).toBe("");
    });

    it("should handle conditional at start of template", () => {
      const template = "<<<if {name}>>>Hello<<<endif>>> World";
      const result = processConditionals(template, { name: "test" });
      expect(result).toBe("Hello World");
    });

    it("should handle conditional at end of template", () => {
      const template = "Hello <<<if {name}>>>World<<<endif>>>";
      const result = processConditionals(template, { name: "test" });
      expect(result).toBe("Hello World");
    });

    it("should handle special characters in content", () => {
      const template = "<<<if {name}>>>Special: <>&\"'{{}}[[]]<<<endif>>>";
      const result = processConditionals(template, { name: "test" });
      expect(result).toBe("Special: <>&\"'{{}}[[]]");
    });

    it("should handle variables with special characters in names", () => {
      const template = "<<<if {my_var}>>>Found<<<endif>>>";
      const result = processConditionals(template, { my_var: "test" });
      expect(result).toBe("Found");
    });
  });
});

describe("applyTemplate with conditionals", () => {
  describe("basic conditional integration", () => {
    it("should process conditional and substitute variables", () => {
      const template = "<<<if {author}>>>By <<<author>>><<<endif>>>";
      const result = applyTemplate(template, { author: "John" });
      expect(result).toBe("By John");
    });

    it("should remove conditional block and content when false", () => {
      const template = "<<<if {author}>>>By <<<author>>><<<endif>>>";
      const result = applyTemplate(template, { author: "" });
      expect(result).toBe("");
    });

    it("should handle conditional with nested path variables", () => {
      const template = "<<<if {exif.Make}>>>Camera: <<<exif.Make>>><<<endif>>>";
      const result = applyTemplate(template, { exif: { Make: "Canon" } });
      expect(result).toBe("Camera: Canon");
    });

    it("should handle missing nested path in conditional", () => {
      const template = "<<<if {exif.Make}>>>Camera: <<<exif.Make>>><<<endif>>>";
      const result = applyTemplate(template, { exif: {} });
      expect(result).toBe("");
    });
  });

  describe("complex real-world scenarios", () => {
    it("should handle Wikimedia Commons template with optional fields", () => {
      const template = `=={{int:filedesc}}==
{{Information
|description={{en|1=<<<description>>>}}
|date=<<<exif.DateTimeOriginal>>>
|source={{own}}
|author=[[User:<<<global.username>>>|<<<global.username>>>]]
}}
<<<if {global.category}>>>
[[Category:<<<global.category>>>]]
<<<endif>>>`;

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

    it("should exclude optional category when not provided", () => {
      const template = `{{Information
|description=<<<description>>>
}}
<<<if {global.category}>>>[[Category:<<<global.category>>>]]<<<endif>>>`;

      const result = applyTemplate(template, {
        description: "Test",
        global: { username: "User" },
      });

      expect(result).toContain("Test");
      expect(result).not.toContain("[[Category:");
    });

    it("should handle multiple optional fields", () => {
      const template = `Title: <<<title>>>
<<<if {subtitle}>>>Subtitle: <<<subtitle>>>
<<<endif>>><<<if {author}>>>Author: <<<author>>>
<<<endif>>><<<if {date}>>>Date: <<<date>>>
<<<endif>>>`;

      const result = applyTemplate(template, {
        title: "My Photo",
        author: "John",
      });

      expect(result).toContain("Title: My Photo");
      expect(result).not.toContain("Subtitle:");
      expect(result).toContain("Author: John");
      expect(result).not.toContain("Date:");
    });

    it("should handle nested conditionals with variable substitution", () => {
      const template = `<<<if {location}>>>Location: <<<location>>>
<<<if {location.gps}>>>GPS: <<<location.gps>>><<<endif>>><<<endif>>>`;

      const result = applyTemplate(template, {
        location: "Amsterdam",
        "location.gps": "52.3676, 4.9041",
      });

      // Note: location.gps is treated as a key path, not a nested object
      expect(result).toContain("Location: Amsterdam");
    });

    it("should handle conditional with recursive variable resolution", () => {
      const template = "<<<if {useAuthor}>>>By <<<authorTemplate>>><<<endif>>>";

      const result = applyTemplate(template, {
        useAuthor: "yes",
        authorTemplate: "[[User:<<<global.username>>>]]",
        global: { username: "JohnDoe" },
      });

      expect(result).toBe("By [[User:JohnDoe]]");
    });
  });

  describe("conditional with missing placeholders", () => {
    it("should show missing placeholder for undefined vars inside truthy conditional", () => {
      const template = "<<<if {show}>>>Value: <<<missing>>><<<endif>>>";
      const result = applyTemplate(template, { show: "yes" });
      expect(result).toBe("Value: <<<missing>>>");
    });

    it("should not show missing placeholder when conditional is false", () => {
      const template = "<<<if {show}>>>Value: <<<missing>>><<<endif>>>";
      const result = applyTemplate(template, { show: "" });
      expect(result).toBe("");
    });
  });

  describe("integration with utility context", () => {
    it("should handle conditional with utility variables", () => {
      const template = `File <<<utility.index>>>.<<<utility.extension>>>
<<<if {utility.date}>>>Date: <<<utility.date>>><<<endif>>>`;

      const result = applyTemplate(template, {
        utility: { extension: "jpg", index: 1, date: "2025-01-15" },
      });

      expect(result).toContain("File 1.jpg");
      expect(result).toContain("Date: 2025-01-15");
    });

    it("should exclude utility conditional when missing", () => {
      const template = `File <<<utility.index>>>.<<<utility.extension>>>
<<<if {utility.date}>>>Date: <<<utility.date>>><<<endif>>>`;

      const result = applyTemplate(template, {
        utility: { extension: "jpg", index: 1 },
      });

      expect(result).toContain("File 1.jpg");
      expect(result).not.toContain("Date:");
    });
  });
});

describe("extractTemplateKeys with conditionals", () => {
  it("should extract variable from if statement", () => {
    const template = "<<<if {author}>>>By <<<author>>><<<endif>>>";
    const keys = extractTemplateKeys(template);
    expect(keys).toContain("author");
  });

  it("should not include 'if {variable}' as a key", () => {
    const template = "<<<if {author}>>>By <<<author>>><<<endif>>>";
    const keys = extractTemplateKeys(template);
    expect(keys).not.toContain("if {author}");
  });

  it("should not include 'endif' as a key", () => {
    const template = "<<<if {author}>>>By <<<author>>><<<endif>>>";
    const keys = extractTemplateKeys(template);
    expect(keys).not.toContain("endif");
  });

  it("should extract nested path variable from if statement", () => {
    const template = "<<<if {exif.Make}>>>Camera<<<endif>>>";
    const keys = extractTemplateKeys(template);
    expect(keys).toContain("exif.Make");
  });

  it("should extract both condition variable and content variables", () => {
    const template =
      "<<<if {hasAuthor}>>>By <<<author>>> on <<<date>>><<<endif>>>";
    const keys = extractTemplateKeys(template);
    expect(keys).toContain("hasAuthor");
    expect(keys).toContain("author");
    expect(keys).toContain("date");
  });

  it("should extract variables from nested conditionals", () => {
    const template = "<<<if {a}>>>A<<<if {b}>>>B<<<endif>>><<<endif>>>";
    const keys = extractTemplateKeys(template);
    expect(keys).toContain("a");
    expect(keys).toContain("b");
  });

  it("should handle mixed regular variables and conditionals", () => {
    const template = "<<<title>>> <<<if {author}>>>by <<<author>>><<<endif>>>";
    const keys = extractTemplateKeys(template);
    expect(keys).toContain("title");
    expect(keys).toContain("author");
    expect(keys.length).toBe(2); // author should not be duplicated
  });

  it("should extract variable with whitespace in if statement", () => {
    const template = "<<<if { spaced }>>>Content<<<endif>>>";
    const keys = extractTemplateKeys(template);
    expect(keys).toContain("spaced");
  });
});

describe("processConditionals malformed template handling", () => {
  it("should treat malformed if tag with no closing }>>> as literal text (lines 134-135)", () => {
    // No }>>> means variableEnd === -1 → append from ifStart and break
    const result = processConditionals("prefix <<<if {no-closing-brace", {});
    expect(result).toBe("prefix <<<if {no-closing-brace");
  });

  it("should treat if with no matching endif as literal (lines 152, 172-174)", () => {
    // No <<<endif>>> → while loop breaks when nextEndif === -1, endifPos stays -1
    const result = processConditionals(
      "<<<if {name}>>>content without endif",
      { name: "value" },
    );
    // The opening <<<if {name}>>> is emitted literally, then the remaining content
    expect(result).toBe("<<<if {name}>>>content without endif");
  });

  it("should treat unmatched nested if as literal when only one endif present", () => {
    // 2 ifs, 1 endif → outer if has no matching endif → outer if tag emitted literally
    const result = processConditionals(
      "<<<if {outer}>>><<<if {inner}>>>text<<<endif>>>",
      { outer: "yes", inner: "yes" },
    );
    // Outer if has no matching endif, so outer <<<if {outer}>>> is literal;
    // the inner block is still processed normally
    expect(result).toBe("<<<if {outer}>>>text");
  });
});

describe("applyTemplate safety checks and maxIterations", () => {
  it("should preserve literal <<<if {var}>>> from malformed conditional (lines 281, 309)", () => {
    // processConditionals emits <<<if {name}>>> literally (no matching endif).
    // The while-loop safety check (line 281) and final-pass safety check (line 309)
    // both return the token unchanged rather than replacing with <<<missing>>>.
    const result = applyTemplate("<<<if {name}>>>content", { name: "value" });
    expect(result).toBe("<<<if {name}>>>content");
  });

  it("should replace unresolvable variable with missing placeholder on last iteration (line 296)", () => {
    // maxIterations=1: on iteration 1 (=== maxIterations), <<<unknown>>> is unresolvable
    // so the replacement returns MISSING_PLACEHOLDER immediately
    const result = applyTemplate("<<<a>>> <<<unknown>>>", { a: "hello" }, 1);
    expect(result).toBe("hello <<<missing>>>");
  });
});
