/**
 * Footer component that displays links to GitHub, license, issues, and version information.
 * 
 * Features:
 * - Links to GitHub repository, issues page, and license
 * - Displays version number and commit hash from build-time environment variables
 * - Shows "dev" during development, actual version and commit in production builds
 * - Non-sticky footer that appears at the bottom of the page
 *
 * @returns The footer component with navigation links and version information
 */
export function Footer() {
    const version = import.meta.env.VITE_APP_VERSION || 'dev';
    const commit = import.meta.env.VITE_APP_COMMIT || '';

    return (
        <footer className="relative z-10 mt-auto border-t border-zinc-800/50 bg-zinc-950/90 backdrop-blur-md">
            <div className="mx-auto max-w-6xl px-6 py-4">
                <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
                    <div className="flex flex-wrap items-center justify-center gap-0.5 md:justify-start">
                        <a
                            href="https://github.com/wvanderp/commons-uploader"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-500 transition-all duration-200 hover:bg-zinc-800/50 hover:text-zinc-300"
                        >
                            GitHub
                        </a>
                        <span className="text-zinc-700">·</span>
                        <a
                            href="https://github.com/wvanderp/commons-uploader/issues"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-500 transition-all duration-200 hover:bg-zinc-800/50 hover:text-zinc-300"
                        >
                            Issues
                        </a>
                        <span className="text-zinc-700">·</span>
                        <a
                            href="https://github.com/wvanderp/commons-uploader/blob/main/LICENCE"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-500 transition-all duration-200 hover:bg-zinc-800/50 hover:text-zinc-300"
                        >
                            MIT License
                        </a>
                        <span className="text-zinc-700">·</span>
                        <a
                            href="https://wvanderp.github.io/Catapult"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-500 transition-all duration-200 hover:bg-zinc-800/50 hover:text-zinc-300"
                        >
                            Homepage
                        </a>
                    </div>
                    <div className="flex items-center gap-2.5 text-sm text-zinc-600">
                        {version === 'dev' ? (
                            <span className="rounded-full bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-400 ring-1 ring-amber-400/25">
                                Development
                            </span>
                        ) : (
                            <>
                                <span className="font-medium text-zinc-500">v{version}</span>
                                {commit && (
                                    <span className="rounded-lg bg-zinc-800/60 px-2 py-1 font-mono text-xs text-zinc-500 ring-1 ring-zinc-700/50">
                                        {commit}
                                    </span>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </footer>
    );
}

