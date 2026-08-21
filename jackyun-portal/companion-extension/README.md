# JackYun Companion

Manifest V3 extension for Chrome and Edge. It tracks active time only on the allowlisted learning sites, keeps an offline queue, and syncs aggregated daily records to JackYun Portal after OAuth 2.1 + PKCE login.

## Portal configuration

> Security status: the leaked legacy key has been retired from the current tree. A new public manifest key now fixes the development extension ID at `nlckikhapgbekdclakobfopdihiibafl`; its private signing key is local-only and ignored by Git. Store publication and OAuth client registration still require the account owner.

1. In Supabase Authentication → OAuth Server, enable OAuth 2.1 and set the authorization path to `https://jackyun.top/oauth/consent`.
2. Register a public OAuth client named `JackYun Companion`.
3. Register the exact redirect URI `https://nlckikhapgbekdclakobfopdihiibafl.chromiumapp.org/oauth2` on the OAuth client.
4. Set `NEXT_PUBLIC_COMPANION_OAUTH_CLIENT_ID`, `COMPANION_V1_ENABLED=true`, and a base64-encoded 32-byte `AI_CONFIG_ENCRYPTION_KEY` in the deployment environment.
5. Apply the `companion_sync_and_navigation_v2` Supabase migration before enabling the feature flag.

For development and production, use separate OAuth clients and exact redirect URIs. A development build must also replace the production Supabase host entry in `manifest.json` with its exact project host. The extension never contains a client secret or Supabase service-role key.

## Local install

Open `chrome://extensions` or `edge://extensions`, enable Developer mode, choose “Load unpacked,” and select this directory. The ZIP published by Portal contains the same files.
