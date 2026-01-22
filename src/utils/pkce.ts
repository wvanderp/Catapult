/**
 * Generates a random code verifier for PKCE (Proof Key for Code Exchange) flow.
 * Used in OAuth2 authentication to prevent authorization code interception attacks.
 *
 * @param length - Length of the code verifier (default: 64)
 * @returns Base64url-encoded random string
 */
export function generateCodeVerifier(length = 64): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return btoa(String.fromCodePoint(...array))
    .replaceAll('+', "-")
    .replaceAll('/', "_")
    .replaceAll(/=+/g, "");
}

/**
 * Generates a code challenge from a verifier for PKCE flow.
 * Creates a SHA-256 hash of the verifier and encodes it as base64url.
 *
 * @param verifier - The code verifier to hash
 * @returns Promise resolving to base64url-encoded SHA-256 hash
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const base64 = btoa(String.fromCodePoint(...new Uint8Array(digest)));
  return base64
    .replaceAll('+', "-")
    .replaceAll('/', "_")
    .replaceAll(/=+/g, "");
}
