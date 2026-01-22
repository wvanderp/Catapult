/// <reference types="vite/client" />

interface ImportMetaEnvironment {
  readonly VITE_APP_VERSION: string;
  readonly VITE_APP_COMMIT: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnvironment;
}
