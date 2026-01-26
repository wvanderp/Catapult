import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useWikimediaCommons } from '../hooks/useWikimediaCommons';
import { useSettingsStore } from '../store/settingsStore';
import { TemplateInfoPanel } from './TemplateInfoPanel';

/**
 * Header component displays the application navigation bar.
 * Shows the Catapult logo/title, template info button, settings button, and authentication status.
 * Provides login functionality when not authenticated and displays username when authenticated.
 *
 * @returns The header component
 */
export function Header() {
  const { login, isAuthenticated, userName } = useWikimediaCommons();
  const toggleSidebar = useSettingsStore((state) => state.toggleSidebar);
  const [isInfoOpen, setIsInfoOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-zinc-800/50 bg-zinc-950/90 backdrop-blur-xl">
        <div className="flex h-14 items-center px-6">
          <Link to="/upload" className="group flex items-center gap-3 transition-all duration-200">
            <div className="flex size-9 items-center justify-center rounded-xl bg-teal-600 transition-all duration-200 group-hover:bg-teal-500">
              <svg className="size-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <span className="text-lg font-bold tracking-tight text-white transition-colors duration-200 group-hover:text-teal-400">
              Catapult
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => setIsInfoOpen(true)}
              className="flex size-9 items-center justify-center rounded-xl text-zinc-400 transition-all duration-200 hover:bg-zinc-800/80 hover:text-white"
              aria-label="Template information"
              title="Learn about template syntax"
            >
              <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <circle cx="12" cy="12" r="10" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8h.01" />
              </svg>
            </button>
            <button
              onClick={toggleSidebar}
              className="flex size-9 items-center justify-center rounded-xl text-zinc-400 transition-all duration-200 hover:bg-zinc-800/80 hover:text-white"
              aria-label="Open settings"
            >
              <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <div className="mx-3 h-5 w-px bg-zinc-800" />
            {isAuthenticated ? (
              userName && (
                <span className="flex items-center gap-2.5 rounded-xl bg-zinc-800/60 px-3.5 py-2 text-sm font-medium text-zinc-200 ring-1 ring-zinc-700/50">
                  <span className="size-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
                  {userName}
                </span>
              )
            ) : (
              <button
                onClick={login}
                className="rounded-xl bg-teal-600 px-5 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-teal-500"
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      <TemplateInfoPanel isOpen={isInfoOpen} onClose={() => setIsInfoOpen(false)} />
    </>
  );
}

