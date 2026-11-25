import { restoreAll } from "./companion";
import { extractCompanionExif } from "./exifUtils";
import { useImageSetStore, backfillLargeOriginalFlags } from "../store/imageSetStore";

/**
 * Wait until persisted image metadata is available to startup work.
 */
async function waitForImageSetHydration(): Promise<void> {
  if (useImageSetStore.persist.hasHydrated()) return;
  await new Promise<void>((resolve) => {
    useImageSetStore.persist.onFinishHydration(() => resolve());
  });
}

/**
 * Run one startup task without allowing its failure to reject startup.
 
 * @param task Asynchronous operation to execute with failure isolation.
 */
async function runSafely(task: () => Promise<unknown>): Promise<void> {
  try {
    await task();
  } catch (error) {
    console.error("Startup task failed", error);
  }
}

/**
 * Restore companion state, wait for hydration, and run independent metadata repairs.
 */
export async function initializeStartup(): Promise<void> {
  await Promise.all([runSafely(restoreAll), runSafely(waitForImageSetHydration)]);
  await runSafely(backfillLargeOriginalFlags);
  await runSafely(async () => {
    const imageIds = Object.values(useImageSetStore.getState().imageSet.images)
      .filter((image) => image.companion)
      .map((image) => image.id);
    await extractCompanionExif(imageIds);
  });
}
