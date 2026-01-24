# Template Syntax Guide

Catapult uses a powerful template system that allows you to create dynamic titles and descriptions for your images. This guide covers all the features of the template syntax.

## Basic Variable Substitution

Variables are enclosed in triple angle brackets: `<<<variableName>>>`

```
Hello, <<<name>>>!
```

If `name` is set to "World", this produces: `Hello, World!`

### Variable Sources

Variables can come from different sources, accessed using dot notation:

| Prefix     | Description                               | Example                       |
| ---------- | ----------------------------------------- | ----------------------------- |
| (none)     | Local/per-image variables                 | `<<<description>>>`           |
| `global.`  | Global variables shared across all images | `<<<global.author>>>`         |
| `exif.`    | EXIF metadata extracted from the image    | `<<<exif.DateTimeOriginal>>>` |
| `utility.` | Utility values computed by the system     | `<<<utility.index>>>`         |

### Available Utility Variables

| Variable            | Description                                             |
| ------------------- | ------------------------------------------------------- |
| `utility.index`     | The 1-based index of the image in the upload queue      |
| `utility.extension` | The file extension without the dot (e.g., `jpg`, `png`) |
| `utility.date`      | Formatted date from EXIF data (YYYY-MM-DD)              |
| `utility.dateTime`  | Formatted datetime from EXIF data (YYYY-MM-DD HH:mm)    |

### Missing Values

If a variable is not defined or is empty, it will be replaced with `<<<missing>>>` in the output. This makes it easy to identify missing data before uploading.

## Conditional Blocks

You can include content conditionally based on whether a variable is defined and not empty.

### Syntax

```
<<<if {variableName}>>>
content to include if variableName is defined and not empty
<<<endif>>>
```

### Basic Example

```
<<<if {author}>>>Photo by <<<author>>><<<endif>>>
```

- If `author` is `"John Doe"`, outputs: `Photo by John Doe`
- If `author` is empty or undefined, outputs nothing

### Using Nested Paths in Conditionals

You can use the same dot notation in conditionals:

```
<<<if {exif.Make}>>>Camera: <<<exif.Make>>><<<endif>>>
<<<if {global.category}>>>[[Category:<<<global.category>>>]]<<<endif>>>
```

### Nested Conditionals

Conditionals can be nested inside each other:

```
<<<if {location}>>>
Location: <<<location>>>
<<<if {location.gps}>>>
GPS: <<<location.gps>>>
<<<endif>>>
<<<endif>>>
```

### Truthiness Rules

A value is considered **truthy** (condition passes) if:

- It is defined (not `undefined`)
- It is not `null`
- It is not an empty string or whitespace-only string
- Numbers (including `0`) and booleans (including `false`) are truthy

A value is considered **falsy** (condition fails) if:

- It is `undefined`
- It is `null`
- It is an empty string `""`
- It is a whitespace-only string `"   "`

## Complete Example

Here's a complete Wikimedia Commons template using all features:

```
=={{int:filedesc}}==
{{Information
|description={{en|1=<<<description>>>}}
|date=<<<exif.DateTimeOriginal>>>
|source={{own}}
|author=[[User:<<<global.username>>>|<<<global.username>>>]]
}}

=={{int:license-header}}==
{{self|cc-by-sa-4.0}}

<<<if {global.category}>>>
[[Category:<<<global.category>>>]]
<<<endif>>>
<<<if {exif.Make}>>>
[[Category:Photographs taken with <<<exif.Make>>> cameras]]
<<<endif>>>
```

This template:

1. Always includes the description, date, source, and author
2. Only includes the category if `global.category` is defined
3. Only includes the camera category if EXIF data contains the camera make

## Recursive Variable Resolution

Variables can reference other variables, and they will be resolved recursively:

```
// If global.signature is set to "[[User:<<<global.username>>>|<<<global.username>>>]]"
// And global.username is set to "JohnDoe"

Author: <<<global.signature>>>
// Outputs: Author: [[User:JohnDoe|JohnDoe]]
```

This is useful for creating reusable template fragments.

## Tips and Best Practices

1. **Use conditionals for optional fields** - Wrap optional metadata in conditionals to keep your output clean when data is missing.

2. **Test your templates** - Use the Review tab to see exactly what your templates will produce before uploading.

3. **Use global variables for consistency** - Put values that should be the same across all images (like author name, event name, license) in global variables.

4. **Leverage EXIF data** - Camera make/model, date taken, and GPS coordinates are often available in EXIF data and can be used to enrich your descriptions.

5. **Keep templates readable** - Use line breaks and whitespace in your templates - they will be preserved in the output.
