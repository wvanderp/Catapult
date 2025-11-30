import { useWikimediaAuth } from '../hooks/useWikimediaAuth';

export function Header() {
  const { login, logout, isAuthenticated, userName } = useWikimediaAuth();

  return (
    <header className="bg-black border-b border-zinc-800 h-16 flex items-center px-6 sticky top-0 z-10">
      <h1 className="text-white text-xl font-bold tracking-tight">Commons Uploader</h1>
      {isAuthenticated ? (
        <div className="ml-auto flex items-center gap-4">
          {userName && <span className="text-white text-sm">{userName}</span>}
          <button 
            onClick={logout}
            className="text-sm font-medium text-gray-300 hover:text-white px-4 py-2 rounded-md hover:bg-zinc-800 transition-colors"
          >
            Sign out
          </button>
        </div>
      ) : (
        <button 
          onClick={login}
          className="ml-auto text-sm font-medium text-gray-300 hover:text-white px-4 py-2 rounded-md hover:bg-zinc-800 transition-colors"
        >
          Sign in
        </button>
      )}
    </header>
  );
}
