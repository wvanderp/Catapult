# Acquiring a WIKIMEDIA CLIENT ID

The Wikimedia API key can be obtained from the following link:

<https://meta.wikimedia.org/wiki/Special:OAuthConsumerRegistration/propose/oauth2>

## values

**Application name**: `Catapult Uploader`
**Consumer version**: `1.0`
**Application description**:

```text
Catapult is a modern batch upload tool for Wikimedia Commons. It lets users upload large sets of images from events, conferences, or photo sessions with consistent metadata, template-based descriptions, automatic EXIF extraction, and per-image customization—all through a streamlined, low-effort workflow.
```

**OAuth "callback" URL**: `https://wvanderp.github.io/Catapult/auth/callback`
**Applicable projects**: `commonswiki`
**Client is confidential**: `No` ← **CRITICAL**. Catapult is a public single-page app
with no backend, so it cannot keep a `client_secret`. It authenticates via PKCE
instead. If this is set to `Yes`, the token endpoint will reject the request
with `Check the client_secret parameter`.

Wikimedia distinguishes between these client types:

- A **confidential client** runs on a server inaccessible to end users and can
  store a client secret securely.
- A **public client**, such as an installed app or a web app without a server
  component, runs on a device controlled by the end user and cannot store a
  client secret securely.

Catapult is therefore a **public client**.

**Allowed OAuth2 grant types**:

- [x] `Authorization code`
- [x] `Refresh token`
- [ ] `Client credentials`

The client-credentials grant requires a confidential client and is not suitable
for Catapult. The authorization-code flow uses PKCE, and the refresh-token grant
lets the app renew an authenticated user's session.

**Types of grants being requested**:

- [ ] `User identity verification only, no ability to read pages or act on a user's behalf.`
- [ ] `User identity verification only with access to real name and email address, no ability to read pages or act on a user's behalf.`
- [x] `Request authorization for specific permissions.`

Grants only provide access to rights already held by the authenticated Wikimedia
user. Do not request risky grants unless Catapult needs them for its upload
workflow.

**Grants**:

- `Create, edit, and move pages`
- `Upload new files`
- `Upload, replace, and move files`

## Local development

For local development, register a separate consumer with:

- **OAuth "callback" URL**: `http://localhost:5173/Catapult/auth/callback`
- **Client is confidential**: `No`

Use its client ID in your local `.env` file as `VITE_WIKIMEDIA_CLIENT_ID`.

> The redirect URI sent by the app is `${location.origin}/Catapult/auth/callback`,
> so it must match the registered callback URL **exactly** (including scheme,
> host, port, and path).
