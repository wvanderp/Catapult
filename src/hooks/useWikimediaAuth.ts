import { generateCodeVerifier, generateCodeChallenge } from '../utils/pkce';
import { useAuthStore } from '../store/authStore';

const CLIENT_ID = import.meta.env.VITE_WIKIMEDIA_CLIENT_ID! as string;
// Construct redirect URI based on current location to support both local dev and production
// Assuming the app is served at /commons-uploader/ or root.
// We need to match what is registered in Wikimedia.
const REDIRECT_URI = `${window.location.origin}/commons-uploader/auth/callback`; 
const AUTH_BASE_URL = 'https://meta.wikimedia.org/w/rest.php/oauth2';

export function useWikimediaAuth() {
  const { accessToken, refreshToken, expiresAt, userName, setTokens, setUserName, clearTokens } = useAuthStore();

  const getValidAccessToken = async () => {
    const current = Math.floor(Date.now() / 1000);
    if (accessToken && expiresAt && current < expiresAt - 60) {
      return accessToken;
    }

    if (refreshToken) {
       const body = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: CLIENT_ID,
        refresh_token: refreshToken,
      });
      
      try {
        const res = await fetch(`${AUTH_BASE_URL}/access_token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        });
        
        if (res.ok) {
          const data = await res.json();
          setTokens({
              accessToken: data.access_token,
              refreshToken: data.refresh_token || refreshToken,
              expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
          });
          return data.access_token;
        }
      } catch (e) {
        console.error("Failed to refresh token", e);
      }
    }
    
    clearTokens();
    return null;
  };

  const fetchUserInfo = async (token: string) => {
    try {
      // Use origin=* for CORS support with the MediaWiki API
      const res = await fetch('https://commons.wikimedia.org/w/api.php?action=query&meta=userinfo&format=json&origin=*', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setUserName(data.query.userinfo.name);
      }
    } catch (e) {
      console.error("Failed to fetch user info", e);
    }
  };

  const login = async () => {
    const state = generateCodeVerifier(32);
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);

    sessionStorage.setItem('wm_state', state);
    sessionStorage.setItem('wm_verifier', verifier);

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    window.location.href = `${AUTH_BASE_URL}/authorize?${params.toString()}`;
  };

  const handleCallback = async () => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');
    const storedState = sessionStorage.getItem('wm_state');
    const verifier = sessionStorage.getItem('wm_verifier');

    if (error) {
      throw new Error(`OAuth error: ${error} - ${errorDescription}`);
    }

    // Check if we already processed this callback (prevents double invocation in React Strict Mode)
    if (!verifier || !storedState) {
      // Already processed or invalid state - check if we have tokens
      if (accessToken) {
        return; // Already authenticated
      }
      throw new Error('Invalid OAuth state or missing code');
    }

    if (!code || !state || state !== storedState) {
      throw new Error('Invalid OAuth state or missing code');
    }

    // Clear session storage BEFORE making the request to prevent double invocation
    sessionStorage.removeItem('wm_state');
    sessionStorage.removeItem('wm_verifier');

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    });

    const res = await fetch(`${AUTH_BASE_URL}/access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Token endpoint error: ${res.status} ${text}`);
    }

    const data = await res.json();
    
    setTokens({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
    });

    await fetchUserInfo(data.access_token);
  };

  const logout = () => {
    clearTokens();
  };
  
  return { login, handleCallback, logout, accessToken, isAuthenticated: !!accessToken, getValidAccessToken, userName };
}
