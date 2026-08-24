# JackYun Companion

Manifest V3 extension for Chrome and Edge. It tracks active time only on the allowlisted learning sites, keeps an offline queue, and syncs aggregated daily records to JackYun Portal after OAuth 2.1 + PKCE login.

## Portal configuration

> Security status: the leaked legacy key has been retired from the current tree. A new public manifest key fixes the extension ID at `nlckikhapgbekdclakobfopdihiibafl`; its private signing key is local-only and ignored by Git. Store publication still requires the account owner.

1. In Supabase Authentication → OAuth Server, enable OAuth 2.1 and set the authorization path to `/oauth/consent` (the Site URL supplies `https://jackyun.top`).
2. Register a public OAuth client named `JackYun Companion`.
3. Register the exact redirect URI `https://nlckikhapgbekdclakobfopdihiibafl.chromiumapp.org/oauth2` on the OAuth client.
4. Set `NEXT_PUBLIC_COMPANION_OAUTH_CLIENT_ID`, `COMPANION_V1_ENABLED=true`, and a base64-encoded 32-byte `AI_CONFIG_ENCRYPTION_KEY` in the deployment environment.
5. Apply the `companion_sync_and_navigation_v2` Supabase migration before enabling the feature flag.

For development and production, use separate OAuth clients and exact redirect URIs. A development build must also replace the production Supabase host entry in `manifest.json` with its exact project host. The extension never contains a client secret or Supabase service-role key.

## Local install

The signed release artifacts are:

- `public/downloads/jackyun-companion-v1.0.1.zip` for Chrome Web Store upload or unpacked developer-mode installation.
- `public/downloads/jackyun-companion-v1.0.1.crx` for signature verification, Verified CRX Uploads, Linux, or managed enterprise environments.

On Windows and macOS, Chrome blocks direct installation of local CRX files that are not delivered by the Chrome Web Store. Until store review is complete, extract the ZIP, open `chrome://extensions` or `edge://extensions`, enable Developer mode, choose “Load unpacked,” and select the extracted directory containing `manifest.json`.
