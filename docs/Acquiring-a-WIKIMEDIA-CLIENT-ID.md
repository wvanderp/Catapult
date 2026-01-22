# Acquiring a WIKIMEDIA CLIENT ID

The Wikimedia API key can be obtained from the following link:

<https://meta.wikimedia.org/wiki/Special:OAuthConsumerRegistration/propose/oauth2>

Make sure that the settings are like:

<https://meta.wikimedia.org/wiki/Special:OAuthListConsumers/view/28fa070cda77c0f1757bbf82b69223d8>

most importantly the Redirect URI should be set to:

```url
http://localhost:5173/Catapult/auth/callback
```

and the key need to grant access to:

```text
Interact with pages
Interact with media
```
