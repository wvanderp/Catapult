export function generateCodeVerifier(length = 64): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return btoa(String.fromCodePoint(...array))
    .replaceAll('+', "-")
    .replaceAll('/', "_")
    .replaceAll(/=+/g, "");
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const base64 = btoa(String.fromCodePoint(...new Uint8Array(digest)));
  return base64
    .replaceAll('+', "-")
    .replaceAll('/', "_")
    .replaceAll(/=+/g, "");
}
