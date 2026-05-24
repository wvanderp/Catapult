# Acquiring a WIKIMEDIA CLIENT ID

The Wikimedia API key can be obtained from the following link:

<https://meta.wikimedia.org/wiki/Special:OAuthConsumerRegistration/propose/oauth2>

Make sure that the settings are like:

<https://meta.wikimedia.org/wiki/Special:OAuthListConsumers/view/28fa070cda77c0f1757bbf82b69223d8>

## values

**Application name**: `Catapult Uploader`
**Consumer version**: `1.0`
**Application description**:

```text
Catapult is a modern batch upload tool for Wikimedia Commons. It enables users to upload large sets of images from events, conferences, or photo sessions with consistent metadata, template-based descriptions, automatic EXIF extraction, and per-image customization — all through a streamlined, minimal-effort workflow.
```

**OAuth "callback" URL**: `https://wvanderp.github.io/Catapult/auth/callback`
**Applicable projects**: `commonswiki`
**Grants**:

- `Create, edit, and move pages`
- `Upload new files`
- `Upload, replace, and move files`
