import { Link } from '@tanstack/react-router';
import { useWikimediaCommons } from '../hooks/useWikimediaCommons';
import { useSettingsStore } from '../store/settingsStore';

export function Header() {
  const { login, isAuthenticated, userName } = useWikimediaCommons();
  const toggleSidebar = useSettingsStore((state) => state.toggleSidebar);

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center border-b border-zinc-800 bg-black px-6">
      <Link to="/upload" className="text-xl font-bold tracking-tight text-white hover:text-gray-200 transition-colors">
        Catapult
      </Link>
      <div className="ml-auto flex items-center gap-4">
        <button
          onClick={toggleSidebar}
          className="rounded-md p-2 text-gray-300 transition-colors hover:bg-zinc-800 hover:text-white"
          aria-label="Open settings"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
        {isAuthenticated ? (
          userName && <span className="text-sm text-white">{userName}</span>
        ) : (
          <button
            onClick={login}
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            Sign in
          </button>
        )}
      </div>
    </header>
  );
}
