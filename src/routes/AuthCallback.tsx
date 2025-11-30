import { useEffect, useState, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useWikimediaAuth } from '../hooks/useWikimediaAuth';

export function AuthCallback() {
  const { handleCallback } = useWikimediaAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const hasRun = useRef(false);

  useEffect(() => {
    // Prevent double execution in React Strict Mode
    if (hasRun.current) return;
    hasRun.current = true;

    handleCallback()
      .then(() => {
        navigate({ to: '/' });
      })
      .catch((err) => {
        console.error(err);
        setError(err.message);
      });
  }, [handleCallback, navigate]);

  if (error) {
    return <div>Error: {error}</div>;
  }

  return <div>Logging in...</div>;
}
