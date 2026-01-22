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
        <footer className="bg-zinc-800 border-t border-zinc-700 py-4 mt-8">
            <div className="container mx-auto px-4">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-gray-400">
                    <div className="flex flex-wrap items-center gap-4 justify-center md:justify-start">
                        <a
                            href="https://github.com/wvanderp/commons-uploader"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-gray-200 transition-colors"
                        >
                            GitHub
                        </a>
                        <a
                            href="https://github.com/wvanderp/commons-uploader/issues"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-gray-200 transition-colors"
                        >
                            Issues
                        </a>
                        <a
                            href="https://github.com/wvanderp/commons-uploader/blob/main/LICENCE"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-gray-200 transition-colors"
                        >
                            License (MIT)
                        </a>
                        <a
                            href="https://wvanderp.github.io/Catapult"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-gray-200 transition-colors"
                        >
                            Homepage
                        </a>
                    </div>
                    <div className="text-gray-500">
                        {version === 'dev' ? (
                            <span>Development Build</span>
                        ) : (
                            <span>
                                v{version}
                                {commit && (
                                    <>
                                        {' '}
                                        <span className="text-gray-600">({commit})</span>
                                    </>
                                )}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </footer>
    );
}
