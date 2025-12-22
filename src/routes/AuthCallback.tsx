import { useEffect, useState, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useWikimediaCommons } from '../hooks/useWikimediaCommons';

export function AuthCallback() {
  const { handleCallback } = useWikimediaCommons();
  const navigate = useNavigate();
  const [error, setError] = useState<string>();
  const hasRun = useRef(false);

  useEffect(() => {
    // Prevent double execution in React Strict Mode
    if (hasRun.current) return;
    hasRun.current = true;

    handleCallback()
      .then(() => {
        navigate({ to: '/upload' });
      })
      .catch((error_) => {
        console.error(error_);
        setError(error_.message);
      });
  }, [handleCallback, navigate]);

  if (error) {
    return <div>Error: {error}</div>;
  }

  return <div>Logging in...</div>;
}
