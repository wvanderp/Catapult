import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  /** Whether the settings sidebar is open */
  isSidebarOpen: boolean;

  /** Default template for new image sets */
  defaultTemplate: string;

  /** Default title template for new image sets */
  defaultTitleTemplate: string;

  /** Default global variables for new image sets */
  defaultGlobalVariables: Record<string, string>;

  /** Actions */
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setDefaultTemplate: (template: string) => void;
  setDefaultTitleTemplate: (titleTemplate: string) => void;
  setDefaultGlobalVariable: (key: string, value: string) => void;
  removeDefaultGlobalVariable: (key: string) => void;
  setDefaultGlobalVariables: (variables: Record<string, string>) => void;
  resetToDefaults: () => void;
}

/** Default template for description - exported for reuse in other stores */
export const INITIAL_TEMPLATE = `=={{int:filedesc}}==
{{Information
|description={{en|1=<<<description>>>}}
|date=<<<date>>>
|source={{own}}
|author=[[User:<<<YourUsername>>>|<<<YourUsername>>>]]
}}

=={{int:license-header}}==
{{self|cc-by-sa-4.0}}

[[Category:<<<category>>>]]`;

/** Default title template - exported for reuse in other stores */
export const INITIAL_TITLE_TEMPLATE =
  "<<<subject>>> - (<<<date>>>).<<<utility.extension>>>";

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      isSidebarOpen: false,
      defaultTemplate: INITIAL_TEMPLATE,
      defaultTitleTemplate: INITIAL_TITLE_TEMPLATE,
      defaultGlobalVariables: {},

      toggleSidebar: () =>
        set((state) => ({
          isSidebarOpen: !state.isSidebarOpen,
        })),

      setSidebarOpen: (open: boolean) =>
        set({
          isSidebarOpen: open,
        }),

      setDefaultTemplate: (template: string) =>
        set({
          defaultTemplate: template,
        }),

      setDefaultTitleTemplate: (titleTemplate: string) =>
        set({
          defaultTitleTemplate: titleTemplate,
        }),

      setDefaultGlobalVariable: (key: string, value: string) =>
        set((state) => ({
          defaultGlobalVariables: {
            ...state.defaultGlobalVariables,
            [key]: value,
          },
        })),

      removeDefaultGlobalVariable: (key: string) =>
        set((state) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [key]: _removed, ...rest } = state.defaultGlobalVariables;
          return {
            defaultGlobalVariables: rest,
          };
        }),

      setDefaultGlobalVariables: (variables: Record<string, string>) =>
        set({
          defaultGlobalVariables: variables,
        }),

      resetToDefaults: () =>
        set({
          defaultTemplate: INITIAL_TEMPLATE,
          defaultTitleTemplate: INITIAL_TITLE_TEMPLATE,
          defaultGlobalVariables: {},
        }),
    }),
    {
      name: "settings-storage",
      partialize: (state) => ({
        defaultTemplate: state.defaultTemplate,
        defaultTitleTemplate: state.defaultTitleTemplate,
        defaultGlobalVariables: state.defaultGlobalVariables,
      }),
    }
  )
);

export interface ExportedSettings {
  version: 1;
  defaultTemplate: string;
  defaultTitleTemplate: string;
  defaultGlobalVariables: Record<string, string>;
  exportedAt: string;
}

/**
 * Exports settings state to a serializable format for backup/import.
 *
 * @param state - The current settings state to export
 * @returns Exported settings object with version and timestamp
 */
export function exportSettings(state: SettingsState): ExportedSettings {
  return {
    version: 1,
    defaultTemplate: state.defaultTemplate,
    defaultTitleTemplate: state.defaultTitleTemplate,
    defaultGlobalVariables: state.defaultGlobalVariables,
    exportedAt: new Date().toISOString(),
  };
}

/**
 * Type guard to validate if data matches the ExportedSettings structure.
 *
 * @param data - Unknown data to validate
 * @returns True if data is a valid ExportedSettings object
 */
export function isValidExportedSettings(
  data: unknown
): data is ExportedSettings {
  if (typeof data !== "object" || data === null) {
    return false;
  }

  const object = data as Record<string, unknown>;

  return (
    object.version === 1 &&
    typeof object.defaultTemplate === "string" &&
    typeof object.defaultTitleTemplate === "string" &&
    typeof object.defaultGlobalVariables === "object" &&
    object.defaultGlobalVariables !== null
  );
}
