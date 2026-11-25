import { createScanner, createMatcher } from "./scan/index.js";
import { createPreviewGenerator } from "./preview/index.js";
import { createZipWriter } from "./zip/index.js";
import type { PipelineServices } from "./types.js";

/**
 * Compose the production filesystem, image, and archive pipeline services.
 *
 * @returns The real service adapters consumed by the CLI.
 */
export function createServices(): PipelineServices {
  return {
    scanner: createScanner(),
    matcher: createMatcher(),
    preview: createPreviewGenerator(),
    zip: createZipWriter(),
  };
}
