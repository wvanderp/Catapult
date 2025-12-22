import { Link } from '@tanstack/react-router';
import { useWikimediaCommons } from '../hooks/useWikimediaCommons';

export function Header() {
  const { login, logout, isAuthenticated, userName } = useWikimediaCommons();

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center border-b border-zinc-800 bg-black px-6">
      <Link to="/upload" className="text-xl font-bold tracking-tight text-white hover:text-gray-200 transition-colors">
        Commons Uploader
      </Link>
      {isAuthenticated ? (
        <div className="ml-auto flex items-center gap-4">
          {userName && <span className="text-sm text-white">{userName}</span>}
          <button
            onClick={logout}
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            Sign out
          </button>
        </div>
      ) : (
        <button
          onClick={login}
          className="ml-auto rounded-md px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-zinc-800 hover:text-white"
        >
          Sign in
        </button>
      )}
    </header>
  );
}
