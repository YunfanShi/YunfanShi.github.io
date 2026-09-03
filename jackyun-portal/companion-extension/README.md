# JackYun Companion

Manifest V3 extension for Chrome and Edge. It includes offline ad and tracker blocking, active learning-time tracking, an offline queue, JackYun sync after OAuth 2.1 + PKCE login, English SafeGuard, and independently configurable first-party tools.

Ad blocking is enabled by default and uses two local layers: packaged `declarativeNetRequest` rules stop known ad/tracker requests before download, and `adblock.js` removes recognized advertising containers left in the page. Users can disable all protection from the prominent popup switch or allowlist only the current site. The rules do not require Google services or a remote subscription.

English SafeGuard pauses non-learning Chinese-language websites before use. A user may open a short translation window and continue only after the visible page and any detected subtitles contain enough English, including browser-translated and Immersive Translate bilingual pages. Recognized education sites and pages are excluded by default; Chinese video and gaming domains always override that exception. Classification happens locally and page text is not uploaded.

## Included tools and hosted source

- Native optional modules: tracking-link cleanup, ZNotes keyboard quiz controls, BestExam PDF link preparation, Discord image protection, and a China/UTC−6 time badge.
- Built-in core ad blocking, optional strict tracker blocking, cosmetic cleanup, per-site allowlisting, and a first-install onboarding page.
- Existing learning statistics, 25/50 minute focus sessions, later-learning queue, local backup import, and account sync.
- Exact snapshots of every first-party userscript hosted under `/userscripts` are packaged in `hosted-sources/` with `catalog.json`. High-impact TR3000 and Save My Exams developer tools are source-only and never run automatically.

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

- `public/downloads/jackyun-companion-v1.3.0.zip` for unpacked developer-mode installation and the next Chrome Web Store upload.
- `public/downloads/jackyun-companion-v1.1.0.crx` remains the latest signed candidate for signature verification, Verified CRX Uploads, Linux, or managed enterprise environments. The 1.3.0 CRX requires the local-only signing key and is intentionally not fabricated in this repository.

On Windows and macOS, Chrome blocks direct installation of local CRX files that are not delivered by the Chrome Web Store. Until store review is complete, extract the ZIP, open `chrome://extensions` or `edge://extensions`, enable Developer mode, choose “Load unpacked,” and select the extracted directory containing `manifest.json`.
