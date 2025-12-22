import axios from "axios";
import { generateCodeVerifier, generateCodeChallenge } from "../utils/pkce";
import { useAuthStore } from "../store/authStore";

const CLIENT_ID = import.meta.env.VITE_WIKIMEDIA_CLIENT_ID! as string;

// OAuth 2.0 scopes should be space-separated
// See: https://www.mediawiki.org/wiki/OAuth/For_Admins for grant names
// 'basic' - baseline user info
// 'createeditmovepage' - create/edit file description pages during upload
// 'uploadfile' - upload new files
// 'uploadeditmovefile' - upload, replace, and move files
const OAUTH_SCOPES = [
  "basic",
  "createeditmovepage",
  "uploadfile",
  "uploadeditmovefile",
].join(" ");

// Construct redirect URI based on current location to support both local dev and production
// Assuming the app is served at /commons-uploader/ or root.
// We need to match what is registered in Wikimedia.
const REDIRECT_URI = `${globalThis.location.origin}/commons-uploader/auth/callback`;
const AUTH_BASE_URL = "https://meta.wikimedia.org/w/rest.php/oauth2";
const API_URL = "https://commons.wikimedia.org/w/api.php";

  /**
   * Decode JWT token to extract and log permissions/claims
   */
  function parseAndLogJWT(token: string) {
    try {
      // JWT format: header.payload.signature
      const parts = token.split(".");
      if (parts.length !== 3) {
        console.error(
          "[parseAndLogJWT] Invalid JWT format: expected 3 parts, got",
          parts.length
        );
        return;
      }

      // Decode the payload (second part)
      // Add padding if needed for base64 decoding
      const payload = parts[1];
      const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
      const decoded = JSON.parse(atob(padded));

      console.log("[parseAndLogJWT] JWT Claims:", {
        iss: decoded.iss,
        sub: decoded.sub,
        aud: decoded.aud,
        exp: decoded.exp
          ? new Date(decoded.exp * 1000).toISOString()
          : undefined,
        iat: decoded.iat
          ? new Date(decoded.iat * 1000).toISOString()
          : undefined,
        scopes: decoded.scope || decoded.scopes || "N/A",
        grants: decoded.grants || "N/A",
      });

      return decoded;
    } catch (error) {
      console.error("[parseAndLogJWT] Failed to parse JWT:", error);
      return;
    }
  }

export interface UploadWarning {
  type:
    | "duplicate"
    | "exists"
    | "duplicate-archive"
    | "was-deleted"
    | "badfilename"
    | "filetype-banned"
    | "unknown";
  message: string;
  duplicateFiles?: string[];
}

export interface UploadResult {
  success: boolean;
  filename?: string;
  warnings?: UploadWarning[];
  error?: string;
  /** If warnings were received, this contains the filekey to resume the upload */
  filekey?: string;
}

export function useWikimediaCommons() {
  const {
    accessToken,
    refreshToken,
    expiresAt,
    userName,
    setTokens,
    setUserName,
    clearTokens,
  } = useAuthStore();

  // ==================== Authentication ====================



  async function getValidAccessToken() {
    const current = Math.floor(Date.now() / 1000);
    if (accessToken && expiresAt && current < expiresAt - 60) {
      console.log(
        "[getValidAccessToken] Token still valid, returning cached token"
      );
      return accessToken;
    }

    if (refreshToken) {
      const body = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: CLIENT_ID,
        refresh_token: refreshToken,
      });

      console.log(
        "[getValidAccessToken] Refreshing token with grant_type=refresh_token"
      );

      try {
        const response = await axios.post(`${AUTH_BASE_URL}/access_token`, body, {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });

        if (response.status === 200) {
          const data = response.data;
          console.log("[getValidAccessToken] Token refresh successful", {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_in: data.expires_in,
          });
          // Parse and log JWT claims including permissions
          parseAndLogJWT(data.access_token);
          setTokens({
            accessToken: data.access_token,
            refreshToken: data.refresh_token || refreshToken,
            expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
          });
          return data.access_token;
        } else {
          console.error(
            "[getValidAccessToken] Token refresh failed with status",
            response.status
          );
        }
      } catch (error) {
        console.error("[getValidAccessToken] Failed to refresh token", error);
      }
    }

    console.log(
      "[getValidAccessToken] No valid token available, clearing tokens"
    );
    clearTokens();
    return;
  }

  async function fetchUserInfo(token: string) {
    try {
      // Prefer the OAuth2 resource profile endpoint (most reliable for identity).
      console.log(
        "[fetchUserInfo] Attempting to fetch profile from OAuth2 resource endpoint"
      );
      const profileResponse = await axios.get(`${AUTH_BASE_URL}/resource/profile`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (profileResponse.status === 200) {
        const profile = profileResponse.data;
        console.log("[fetchUserInfo] OAuth2 profile response:", profile);
        
        // Extract name from profile with fallbacks
        function extractName(p: Record<string, unknown>): string | undefined {
          if (typeof p?.username === "string") return p.username;
          if (typeof p?.user_name === "string") return p.user_name;
          if (typeof p?.name === "string") return p.name;
          return;
        }
        const name = extractName(profile);

        if (name) {
          console.log(
            "[fetchUserInfo] User name extracted from OAuth2 profile:",
            name
          );
          setUserName(name);
          return;
        }
      } else {
        console.log(
          "[fetchUserInfo] OAuth2 profile endpoint returned non-ok status:",
          profileResponse.status
        );
      }

      console.log(
        "[fetchUserInfo] Falling back to MediaWiki Action API userinfo endpoint"
      );

      const url = new URL(API_URL);
      url.search = new URLSearchParams({
        action: "query",
        meta: "userinfo",
        format: "json",
        crossorigin: "",
      }).toString();

      const response = await axios.get(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 200) {
        const data = response.data;
        console.log("[fetchUserInfo] MediaWiki userinfo response:", data);
        const name = data?.query?.userinfo?.name;
        if (typeof name === "string") {
          console.log(
            "[fetchUserInfo] User name extracted from MediaWiki API:",
            name
          );
          setUserName(name);
        }
      } else {
        console.log(
          "[fetchUserInfo] MediaWiki userinfo endpoint returned non-ok status:",
          response.status
        );
      }
    } catch (error) {
      console.error("[fetchUserInfo] Failed to fetch user info", error);
    }
  }

  async function handleCallback() {
    const url = new URL(globalThis.location.href);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");
    const storedState = sessionStorage.getItem("wm_state");
    const verifier = sessionStorage.getItem("wm_verifier");

    if (error) {
      throw new Error(`OAuth error: ${error} - ${errorDescription}`);
    }

    // Check if we already processed this callback (prevents double invocation in React Strict Mode)
    if (!verifier || !storedState) {
      // Already processed or invalid state - check if we have tokens
      if (accessToken) {
        return; // Already authenticated
      }
      throw new Error("Invalid OAuth state or missing code");
    }

    if (!code || !state || state !== storedState) {
      throw new Error("Invalid OAuth state or missing code");
    }

    // Clear session storage BEFORE making the request to prevent double invocation
    sessionStorage.removeItem("wm_state");
    sessionStorage.removeItem("wm_verifier");

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    });

    console.log("[handleCallback] Exchanging authorization code for tokens", {
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
    });

    try {
      const response = await axios.post(`${AUTH_BASE_URL}/access_token`, body, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      const data = response.data;
      console.log("[handleCallback] Token exchange successful", {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
      });

      // Parse and log JWT claims including permissions
      parseAndLogJWT(data.access_token);

      setTokens({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
      });

      await fetchUserInfo(data.access_token);
    } catch (error) {
      const errorMessage =
        axios.isAxiosError(error) && error.response
          ? error.response.data
          : String(error);
      console.error("[handleCallback] Token exchange failed", {
        error: errorMessage,
      });
      throw new Error(`Token endpoint error: ${errorMessage}`);
    }
  }

  function logout() {
    clearTokens();
  }

  // ==================== Commons API ====================

  // Check if we're properly authenticated on Commons with full debug info
  async function checkAuth() {
    const token = await getValidAccessToken();
    if (!token) {
      console.log("[checkAuth] No valid token, returning unauthenticated");
      return { authenticated: false, username: undefined, rights: [], groups: [] };
    }

    const parameters = new URLSearchParams({
      action: "query",
      meta: "userinfo",
      uiprop: "groups|rights|blockinfo",
      format: "json",
      origin: globalThis.location.origin,
    });

    console.log("[checkAuth] Checking auth status with parameters:", {
      action: "query",
      meta: "userinfo",
      uiprop: "groups|rights|blockinfo",
      format: "json",
    });

    const response = await axios.get(`${API_URL}?${parameters.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = response.data;
    console.log("[checkAuth] Response from Commons API:", data);

    const userinfo = data?.query?.userinfo;
    // If anon is present, user is not authenticated
    if (userinfo?.anon !== undefined) {
      return {
        authenticated: false,
        username: userinfo?.name,
        rights: [],
        groups: [],
      };
    }

    // Log important info for debugging
    const hasUploadRight = userinfo?.rights?.includes("upload");
    const hasUploadByUrl = userinfo?.rights?.includes("upload_by_url");
    console.log("User:", userinfo?.name);
    console.log("Groups:", userinfo?.groups);
    console.log("Has upload right:", hasUploadRight);
    console.log("Has upload_by_url right:", hasUploadByUrl);
    console.log("Block info:", userinfo?.blockid ? "BLOCKED" : "Not blocked");

    return {
      authenticated: true,
      username: userinfo?.name,
      rights: userinfo?.rights || [],
      groups: userinfo?.groups || [],
      hasUploadRight,
      blocked: !!userinfo?.blockid,
    };
  }

  async function getCsrfToken() {
    const token = await getValidAccessToken();
    if (!token) throw new Error("Not authenticated");

    const url = new URL(API_URL);
    url.search = new URLSearchParams({
      action: "query",
      meta: "tokens",
      type: "csrf",
      format: "json",
      formatversion: "2",
      // For OAuth authenticated CORS requests, use crossorigin to enable CORS.
      crossorigin: "",
    }).toString();

    console.log("[getCsrfToken] Requesting CSRF token", url.search);
    // For OAuth authenticated CORS requests:
    // - Use crossorigin= parameter to enable CORS with OAuth Bearer token
    // - Include Authorization: Bearer header
    // See: https://www.mediawiki.org/wiki/API:Cross-site_requests#Authenticated_CORS_requests_using_OAuth
    const response = await axios.get(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = response.data;
    console.log("[getCsrfToken] Response:", data);

    if (!data.query || !data.query.tokens) {
      console.error("[getCsrfToken] Invalid response, no tokens returned");
      throw new Error(`Failed to get CSRF token: ${JSON.stringify(data)}`);
    }

    const csrfToken = data.query.tokens.csrftoken;

    // Check if we got the anonymous token (+\) which means auth wasn't recognized
    if (csrfToken === "+\\") {
      console.error(
        "[getCsrfToken] Received anonymous CSRF token - OAuth auth not recognized"
      );
      throw new Error(
        "Authentication not recognized by Commons API. Please try logging out and back in."
      );
    }

    console.log("[getCsrfToken] CSRF token obtained successfully");
    return csrfToken;
  }

  async function uploadFile(
    file: File,
    filename: string,
    text: string,
    options?: { ignorewarnings?: boolean; filekey?: string }
  ): Promise<UploadResult> {
    const token = await getValidAccessToken();
    if (!token) throw new Error("Not authenticated");

    const csrfToken = await getCsrfToken();

    // For OAuth authenticated CORS requests, use crossorigin= parameter
    // This tells MediaWiki to echo back Access-Control-Allow-Origin for any origin
    // when the request is authenticated with OAuth.
    // See: https://www.mediawiki.org/wiki/API:Cross-site_requests#Authenticated_CORS_requests_using_OAuth
    const url = new URL(API_URL);
    url.search = new URLSearchParams({
      action: "upload",
      format: "json",
      formatversion: "2",
      crossorigin: "",
    }).toString();

    const form = new FormData();
    form.append("filename", filename);
    form.append("text", text); // Page content
    form.append("token", csrfToken);

    console.log("[uploadFile] token:", csrfToken);
    console.log("[uploadFile] Uploading file with parameters:", url.toString(), JSON.stringify(form));

    // Only ignore warnings if explicitly requested (e.g., user confirmed to overwrite)
    // Per plan: "Don't blindly ignorewarnings=1. Handle the warning response and rename or dedupe."
    if (options?.ignorewarnings) {
      form.append("ignorewarnings", "1");
    }

    // If resuming after warnings, use filekey instead of uploading file again
    if (options?.filekey) {
      console.log("[uploadFile] Resuming upload with filekey");
      form.append("filekey", options.filekey);
    } else {
      console.log("[uploadFile] Starting new upload with file");
      form.append("file", file);
    }

    // For OAuth authenticated CORS requests:
    // - Use crossorigin= parameter to enable CORS with OAuth Bearer token
    // - Include Authorization: Bearer header
    // - axios will automatically set Content-Type with FormData boundary
    // See: https://www.mediawiki.org/wiki/API:Upload and API:Cross-site_requests
    const result = await axios.post(url.toString(), form, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = result.data;
    console.log("[uploadFile] Response from upload API:", data);

    // Handle API errors
    if (data.error) {
      // Check for permission-related errors
      const errorInfo = data.error.info || data.error.code || "Upload failed";
      console.error("[uploadFile] API error:", {
        code: data.error.code,
        info: errorInfo,
      });

      // Detect "user not in allowed groups" error which typically means:
      // - OAuth token not properly recognized
      // - User is not autoconfirmed (needs 10 edits + 4 days account age)
      // - OAuth app doesn't have proper grants
      if (errorInfo.includes("limited to users in one of the groups")) {
        console.error(
          "[uploadFile] Permission denied - user not autoconfirmed or lacks groups"
        );
        return {
          success: false,
          error:
            "Permission denied: Your account may not have upload rights. " +
            "On Wikimedia Commons, you need to be an autoconfirmed user (account at least 4 days old with 10+ edits). " +
            "Also try logging out and back in to refresh your OAuth permissions.",
        };
      }

      return {
        success: false,
        error: errorInfo,
      };
    }

    // Handle warnings (file not uploaded, but we have a filekey to resume)
    if (data.upload?.result === "Warning" && data.upload?.warnings) {
      console.log(
        "[uploadFile] Upload returned warnings, need user confirmation",
        {
          warnings: Object.keys(data.upload.warnings),
          filekey: data.upload.filekey,
          filename: data.upload.filename,
        }
      );
      const warnings = parseWarnings(data.upload.warnings);
      return {
        success: false,
        warnings,
        filekey: data.upload.filekey,
        filename: data.upload.filename,
      };
    }

    // Success
    if (data.upload?.result === "Success") {
      console.log("[uploadFile] Upload successful", {
        filename: data.upload.filename,
      });
      return {
        success: true,
        filename: data.upload.filename,
      };
    }

    // Unknown response
    console.error("[uploadFile] Unexpected response format", data);
    return {
      success: false,
      error: `Unexpected response: ${JSON.stringify(data)}`,
    };
  }

  return {
    // Auth state
    accessToken,
    userName,
    isAuthenticated: !!accessToken,
    // Auth actions
    login,
    handleCallback,
    logout,
    getValidAccessToken,
    parseAndLogJWT,
    // Commons API
    checkAuth,
    getCsrfToken,
    uploadFile,
  };
}

/**
 * Parse MediaWiki upload warnings into a structured format
 */
function parseWarnings(warnings: Record<string, unknown>): UploadWarning[] {
  const result: UploadWarning[] = [];

  for (const [key, value] of Object.entries(warnings)) {
    switch (key) {
      case "exists": {
        result.push({
          type: "exists",
          message: `A file with this name already exists: ${value}`,
        });
        break;
      }
      case "duplicate": {
        result.push({
          type: "duplicate",
          message: "This file is a duplicate of existing file(s)",
          duplicateFiles: Array.isArray(value) ? value : [String(value)],
        });
        break;
      }
      case "duplicate-archive": {
        result.push({
          type: "duplicate-archive",
          message: `This file was previously deleted: ${value}`,
        });
        break;
      }
      case "was-deleted": {
        result.push({
          type: "was-deleted",
          message: `A file with this name was previously deleted: ${value}`,
        });
        break;
      }
      case "badfilename": {
        result.push({
          type: "badfilename",
          message: `Bad filename: ${value}`,
        });
        break;
      }
      case "filetype-banned": {
        result.push({
          type: "filetype-banned",
          message: `This file type is not allowed: ${value}`,
        });
        break;
      }
      default: {
        result.push({
          type: "unknown",
          message: `${key}: ${JSON.stringify(value)}`,
        });
      }
    }
  }

  return result;
}

async function login() {
  const state = generateCodeVerifier(32);
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);

  sessionStorage.setItem("wm_state", state);
  sessionStorage.setItem("wm_verifier", verifier);

  const parameters = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: OAUTH_SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  globalThis.location.href = `${AUTH_BASE_URL}/authorize?${parameters.toString()}`;
}
