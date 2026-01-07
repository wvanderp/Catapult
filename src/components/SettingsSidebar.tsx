import { useRef, useState } from 'react';
import { useSettingsStore, exportSettings, isValidExportedSettings } from '../store/settingsStore';
import { useImageSetStore } from '../store/imageSetStore';
import { clearDatabase } from '../utils/indexedDbStorage';
import { useWikimediaCommons } from '../hooks/useWikimediaCommons';

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

    function showStatus(type: 'success' | 'error', text: string) {
        setStatusMessage({ type, text });
        setTimeout(() => setStatusMessage(undefined), 3000);
    }

    function handleAddVariable() {
        const trimmedKey = newVariableKey.trim();
        if (!trimmedKey) return;

        setDefaultGlobalVariable(trimmedKey, newVariableValue);
        setNewVariableKey('');
        setNewVariableValue('');
    }

    async function handleClearIndexedDB() {
        if (!confirm('Are you sure you want to clear all stored data? This will remove all images and settings from IndexedDB.')) {
            return;
        }

        try {
            await clearDatabase();
            clearAllImages();
            showStatus('success', 'IndexedDB cleared successfully. Refresh the page to see changes.');
        } catch (error) {
            showStatus('error', 'Failed to clear IndexedDB');
            console.error('Failed to clear IndexedDB:', error);
        }
    }

    function handleExportSettings() {
        const settings = exportSettings(useSettingsStore.getState());
        const json = JSON.stringify(settings, undefined, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `commons-uploader-settings-${new Date().toISOString().split('T')[0]}.json`;
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);

        showStatus('success', 'Settings exported successfully');
    }

    function handleImportClick() {
        fileInputReference.current?.click();
    }

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

    function handleResetToDefaults() {
        if (!confirm('Are you sure you want to reset all settings to their default values?')) {
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
                className="fixed inset-0 z-40 bg-black/50"
                onClick={() => setSidebarOpen(false)}
            />

            {/* Sidebar */}
            <aside className="fixed right-0 top-0 z-50 flex h-full w-[560px] flex-col bg-zinc-900 shadow-xl">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-zinc-700 px-4 py-3">
                    <h2 className="text-lg font-semibold text-white">Settings</h2>
                    <button
                        onClick={() => setSidebarOpen(false)}
                        className="rounded p-1 text-gray-400 transition-colors hover:bg-zinc-700 hover:text-white"
                        aria-label="Close settings"
                    >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Status message */}
                {statusMessage && (
                    <div
                        className={`mx-4 mt-3 rounded px-3 py-2 text-sm ${statusMessage.type === 'success'
                            ? 'bg-green-900/50 text-green-300'
                            : 'bg-red-900/50 text-red-300'
                            }`}
                    >
                        {statusMessage.text}
                    </div>
                )}

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4">
                    {/* Default Templates Section */}
                    <section className="mb-6">
                        <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-400">
                            Default Templates
                        </h3>

                        <label className="mb-2 block text-sm text-gray-300">
                            Title Template
                            <textarea
                                value={defaultTitleTemplate}
                                onChange={(e) => setDefaultTitleTemplate(e.target.value)}
                                className="mt-1 block w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                                rows={2}
                                placeholder="<<<subject>>> - (<<<date>>>).<<<utility.extension>>>"
                            />
                        </label>

                        <label className="block text-sm text-gray-300">
                            Description Template
                            <textarea
                                value={defaultTemplate}
                                onChange={(e) => setDefaultTemplate(e.target.value)}
                                className="mt-1 block w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                                rows={10}
                            />
                        </label>
                    </section>

                    {/* Default Global Variables Section */}
                    <section className="mb-6">
                        <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-400">
                            Default Global Variables
                        </h3>

                        {Object.entries(defaultGlobalVariables).length > 0 ? (
                            <div className="mb-3 space-y-2">
                                {Object.entries(defaultGlobalVariables).map(([key, value]) => (
                                    <div key={key} className="flex items-center gap-2">
                                        <span className="min-w-0 flex-1 truncate text-sm text-gray-300">
                                            <code className="rounded bg-zinc-800 px-1 py-0.5">{key}</code>
                                        </span>
                                        <input
                                            type="text"
                                            value={value}
                                            onChange={(e) => setDefaultGlobalVariable(key, e.target.value)}
                                            className="w-32 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-white focus:border-blue-500 focus:outline-none"
                                        />
                                        <button
                                            onClick={() => removeDefaultGlobalVariable(key)}
                                            className="rounded p-1 text-gray-400 transition-colors hover:bg-red-900/50 hover:text-red-300"
                                            aria-label={`Remove ${key}`}
                                        >
                                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="mb-3 text-sm text-gray-500">No default global variables set.</p>
                        )}

                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newVariableKey}
                                onChange={(e) => setNewVariableKey(e.target.value)}
                                placeholder="Variable name"
                                className="w-28 rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                            />
                            <input
                                type="text"
                                value={newVariableValue}
                                onChange={(e) => setNewVariableValue(e.target.value)}
                                placeholder="Value"
                                className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                            />
                            <button
                                onClick={handleAddVariable}
                                disabled={!newVariableKey.trim()}
                                className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Add
                            </button>
                        </div>
                    </section>

                    {/* Import/Export Section */}
                    <section className="mb-6">
                        <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-400">
                            Backup & Restore
                        </h3>
                        <div className="flex gap-2">
                            <button
                                onClick={handleExportSettings}
                                className="flex-1 rounded bg-zinc-700 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-600"
                            >
                                Export Settings
                            </button>
                            <button
                                onClick={handleImportClick}
                                className="flex-1 rounded bg-zinc-700 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-600"
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
                    <section className="mb-6">
                        <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-400">
                            Data Management
                        </h3>
                        <button
                            onClick={handleClearIndexedDB}
                            className="w-full rounded bg-red-900/50 px-3 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-900/70"
                        >
                            Clear All Data (IndexedDB)
                        </button>
                        <p className="mt-1 text-xs text-gray-500">
                            This will remove all stored images and reset the current session.
                        </p>
                    </section>

                    {/* Reset Section */}
                    <section className="mb-6">
                        <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-400">
                            Reset
                        </h3>
                        <button
                            onClick={handleResetToDefaults}
                            className="w-full rounded border border-zinc-600 px-3 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-zinc-800"
                        >
                            Reset Settings to Defaults
                        </button>
                    </section>

                    {/* Account Section */}
                    {isAuthenticated && (
                        <section>
                            <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-400">
                                Account
                            </h3>
                            {userName && (
                                <p className="mb-3 text-sm text-gray-300">
                                    Signed in as <span className="font-medium text-white">{userName}</span>
                                </p>
                            )}
                            <button
                                onClick={logout}
                                className="w-full rounded bg-zinc-700 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-600"
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
