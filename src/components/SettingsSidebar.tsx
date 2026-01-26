import { useRef, useState } from 'react';
import { useSettingsStore, exportSettings, isValidExportedSettings } from '../store/settingsStore';
import { useImageSetStore } from '../store/imageSetStore';
import { clearDatabase } from '../utils/indexedDbStorage';
import { useWikimediaCommons } from '../hooks/useWikimediaCommons';

/**
 * SettingsSidebar provides a slide-out panel for application settings.
 * Includes:
 * - Authentication management (login/logout)
 * - Default template configuration
 * - Global variable management
 * - Settings import/export
 * - Database clearing
 * - Reset to defaults
 * 
 * @returns The settings sidebar component
 */
function SettingsSidebar() {
    const {
        isSidebarOpen,
        setSidebarOpen,
        defaultTemplate,
        defaultTitleTemplate,
        defaultGlobalVariables,
        setDefaultTemplate,
        setDefaultTitleTemplate,
        setDefaultGlobalVariable,
        removeDefaultGlobalVariable,
        resetToDefaults,
    } = useSettingsStore();

    const clearAllImages = useImageSetStore((state) => state.clearAllImages);
    const { logout, isAuthenticated, userName } = useWikimediaCommons();

    const [newVariableKey, setNewVariableKey] = useState('');
    const [newVariableValue, setNewVariableValue] = useState('');
    const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string }>();
    const fileInputReference = useRef<HTMLInputElement>(null);

    /**
     * Displays a temporary status message (success or error) for 3 seconds.
     *
     * @param type - Type of message to display
     * @param text - Message text to show
     */
    function showStatus(type: 'success' | 'error', text: string) {
        setStatusMessage({ type, text });
        setTimeout(() => setStatusMessage(undefined), 3000);
    }

    /**
     * Adds a new default global variable if the key is not empty.
     * Clears the input fields after adding.
     */
    function handleAddVariable() {
        const trimmedKey = newVariableKey.trim();
        if (!trimmedKey) return;

        setDefaultGlobalVariable(trimmedKey, newVariableValue);
        setNewVariableKey('');
        setNewVariableValue('');
    }

    /**
     * Clears all data from IndexedDB after user confirmation.
     * Removes all stored images and settings.
     */
    async function handleClearIndexedDB() {
        if (!confirm('Clear all stored images and reset your session? Your settings will be kept.')) {
            return;
        }

        try {
            await clearDatabase();
            clearAllImages();
            showStatus('success', 'All data cleared. The page will refresh to apply changes.');
        } catch (error) {
            showStatus('error', 'Failed to clear IndexedDB');
            console.error('Failed to clear IndexedDB:', error);
        }
    }

    /**
     * Exports current settings as a JSON file.
     * Downloads a file with timestamp in the filename.
     */
    function handleExportSettings() {
        const settings = exportSettings(useSettingsStore.getState());
        const json = JSON.stringify(settings, undefined, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `catapult-settings-${new Date().toISOString().split('T')[0]}.json`;
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);

        showStatus('success', 'Settings exported successfully');
    }

    /**
     * Triggers the hidden file input to open the file picker.
     */
    function handleImportClick() {
        fileInputReference.current?.click();
    }

    /**
     * Imports settings from a selected JSON file.
     * Validates the file format and updates all settings.
     *
     * @param event - File input change event
     */
    async function handleImportSettings(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const content = await file.text();
            const data: unknown = JSON.parse(content);

            if (!isValidExportedSettings(data)) {
                showStatus('error', 'Invalid settings file format');
                return;
            }

            setDefaultTemplate(data.defaultTemplate);
            setDefaultTitleTemplate(data.defaultTitleTemplate);

            // Clear existing variables and set new ones
            for (const key of Object.keys(defaultGlobalVariables)) {
                removeDefaultGlobalVariable(key);
            }
            for (const [key, value] of Object.entries(data.defaultGlobalVariables)) {
                setDefaultGlobalVariable(key, value);
            }

            showStatus('success', 'Settings imported successfully');
        } catch {
            showStatus('error', 'Failed to parse settings file');
        }

        // Reset the input so the same file can be selected again
        event.target.value = '';
    }

    /**
     * Resets all settings to default values after user confirmation.
     */
    function handleResetToDefaults() {
        if (!confirm('Reset all settings (templates, variables) to factory defaults?')) {
            return;
        }
        resetToDefaults();
        showStatus('success', 'Settings reset to defaults');
    }

    if (!isSidebarOpen) {
        return;
    }

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-40 bg-black/70 backdrop-blur-md"
                onClick={() => setSidebarOpen(false)}
            />

            {/* Sidebar */}
            <aside className="fixed right-0 top-0 z-50 flex h-full w-[520px] flex-col border-l border-zinc-800/60 bg-zinc-950/95 shadow-2xl backdrop-blur-md">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-zinc-800/60 px-5 py-4">
                    <h2 className="text-lg font-bold tracking-tight text-white">Settings</h2>
                    <button
                        onClick={() => setSidebarOpen(false)}
                        className="rounded-xl p-2.5 text-zinc-500 transition-all duration-200 hover:bg-zinc-800/80 hover:text-white"
                        aria-label="Close settings"
                    >
                        <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Status message */}
                {statusMessage && (
                    <div
                        className={`mx-5 mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${statusMessage.type === 'success'
                            ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30'
                            : 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30'
                            }`}
                    >
                        {statusMessage.text}
                    </div>
                )}

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5">
                    {/* Default Templates Section */}
                    <section className="mb-8">
                        <h3 className="mb-4 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500">
                            Default Templates
                        </h3>

                        <label className="mb-4 block">
                            <span className="mb-2 block text-sm font-semibold text-zinc-300">Title Template</span>
                            <textarea
                                value={defaultTitleTemplate}
                                onChange={(e) => setDefaultTitleTemplate(e.target.value)}
                                className="block w-full rounded-xl border border-zinc-700/80 bg-zinc-900/80 px-4 py-3 font-mono text-[13px] text-white placeholder-zinc-600 transition-all duration-200 focus:border-teal-400/50 focus:outline-none focus:ring-2 focus:ring-teal-400/20"
                                rows={2}
                                placeholder="e.g., <<<subject>>> - <<<date>>>.<<<utility.extension>>>"
                            />
                        </label>

                        <label className="block">
                            <span className="mb-2 block text-sm font-semibold text-zinc-300">Description Template</span>
                            <textarea
                                value={defaultTemplate}
                                onChange={(e) => setDefaultTemplate(e.target.value)}
                                className="block w-full rounded-xl border border-zinc-700/80 bg-zinc-900/80 px-4 py-3 font-mono text-[13px] text-white placeholder-zinc-600 transition-all duration-200 focus:border-teal-400/50 focus:outline-none focus:ring-2 focus:ring-teal-400/20"
                                rows={10}
                            />
                        </label>
                    </section>

                    {/* Default Global Variables Section */}
                    <section className="mb-8">
                        <h3 className="mb-4 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500">
                            Default Global Variables
                        </h3>

                        {Object.entries(defaultGlobalVariables).length > 0 ? (
                            <div className="mb-4 space-y-3">
                                {Object.entries(defaultGlobalVariables).map(([key, value]) => (
                                    <div key={key} className="flex items-center gap-3">
                                        <span className="min-w-0 flex-1 truncate text-sm text-zinc-400">
                                            <code className="rounded-lg bg-zinc-800/80 px-2.5 py-1 font-mono text-[13px] text-teal-400">{key}</code>
                                        </span>
                                        <input
                                            type="text"
                                            value={value}
                                            onChange={(e) => setDefaultGlobalVariable(key, e.target.value)}
                                            className="w-36 rounded-xl border border-zinc-700/80 bg-zinc-900/80 px-3 py-2.5 text-sm text-white transition-all duration-200 focus:border-teal-400/50 focus:outline-none focus:ring-2 focus:ring-teal-400/20"
                                        />
                                        <button
                                            onClick={() => removeDefaultGlobalVariable(key)}
                                            className="rounded-xl p-2.5 text-zinc-600 transition-all duration-200 hover:bg-red-500/10 hover:text-red-400"
                                            aria-label={`Remove ${key}`}
                                        >
                                            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="mb-4 text-sm text-zinc-600">No default values set yet. Add variables you use across batches.</p>
                        )}

                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newVariableKey}
                                onChange={(e) => setNewVariableKey(e.target.value)}
                                placeholder="Variable name"
                                className="w-32 rounded-xl border border-zinc-700/80 bg-zinc-900/80 px-3 py-2.5 text-sm text-white placeholder-zinc-600 transition-all duration-200 focus:border-teal-400/50 focus:outline-none focus:ring-2 focus:ring-teal-400/20"
                            />
                            <input
                                type="text"
                                value={newVariableValue}
                                onChange={(e) => setNewVariableValue(e.target.value)}
                                placeholder="Value"
                                className="flex-1 rounded-xl border border-zinc-700/80 bg-zinc-900/80 px-3 py-2.5 text-sm text-white placeholder-zinc-600 transition-all duration-200 focus:border-teal-400/50 focus:outline-none focus:ring-2 focus:ring-teal-400/20"
                            />
                            <button
                                onClick={handleAddVariable}
                                disabled={!newVariableKey.trim()}
                                className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-teal-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600"
                            >
                                Add
                            </button>
                        </div>
                    </section>

                    {/* Import/Export Section */}
                    <section className="mb-8">
                        <h3 className="mb-4 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500">
                            Backup & Restore
                        </h3>
                        <div className="flex gap-3">
                            <button
                                onClick={handleExportSettings}
                                className="flex-1 rounded-xl border border-zinc-700/80 bg-zinc-900/80 px-4 py-3 text-sm font-semibold text-zinc-300 transition-all duration-200 hover:border-zinc-600 hover:bg-zinc-800 hover:text-white"
                            >
                                Export Settings
                            </button>
                            <button
                                onClick={handleImportClick}
                                className="flex-1 rounded-xl border border-zinc-700/80 bg-zinc-900/80 px-4 py-3 text-sm font-semibold text-zinc-300 transition-all duration-200 hover:border-zinc-600 hover:bg-zinc-800 hover:text-white"
                            >
                                Import Settings
                            </button>
                            <input
                                ref={fileInputReference}
                                type="file"
                                accept=".json"
                                onChange={handleImportSettings}
                                className="hidden"
                            />
                        </div>
                    </section>

                    {/* Data Management Section */}
                    <section className="mb-8">
                        <h3 className="mb-4 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500">
                            Data Management
                        </h3>
                        <button
                            onClick={handleClearIndexedDB}
                            className="w-full rounded-xl bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-400 ring-1 ring-red-500/20 transition-all duration-200 hover:bg-red-500/20"
                        >
                            Clear All Stored Data
                        </button>
                        <p className="mt-2 text-xs text-zinc-600">
                            Removes all images and resets your current session. Settings are preserved.
                        </p>
                    </section>

                    {/* Reset Section */}
                    <section className="mb-8">
                        <h3 className="mb-4 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500">
                            Reset
                        </h3>
                        <button
                            onClick={handleResetToDefaults}
                            className="w-full rounded-xl border border-zinc-700/80 px-4 py-3 text-sm font-semibold text-zinc-400 transition-all duration-200 hover:border-zinc-600 hover:bg-zinc-900 hover:text-zinc-300"
                        >
                            Reset Settings to Defaults
                        </button>
                    </section>

                    {/* Account Section */}
                    {isAuthenticated && (
                        <section>
                            <h3 className="mb-4 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500">
                                Account
                            </h3>
                            {userName && (
                                <p className="mb-4 text-sm text-zinc-400">
                                    Signed in as <span className="font-bold text-white">{userName}</span>
                                </p>
                            )}
                            <button
                                onClick={logout}
                                className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900/80 px-4 py-3 text-sm font-semibold text-zinc-300 transition-all duration-200 hover:border-zinc-600 hover:bg-zinc-800 hover:text-white"
                            >
                                Sign out
                            </button>
                        </section>
                    )}
                </div>
            </aside>
        </>
    );
}

export { SettingsSidebar };

