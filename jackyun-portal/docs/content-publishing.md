# Articles and share links

Manage articles and redirects at `/admin/content`. The existing novel and redemption manager is at `/admin/content/library`.

Articles use Markdown (GFM tables and task lists), a unique 3–80 character lowercase slug, explicit published/draft state, and public or signed-in visibility. Public routes are `/articles` and `/articles/<slug>`; they are intentionally absent from the workspace sidebar. Drafts are never served publicly. Raw HTML in Markdown is not executed.

Share links have a cryptographically random `j-` code at the domain root. Administrators can change the display name and HTTP(S) target without changing the share URL, or disable it. The interstitial displays the name and actual URL, waits three seconds, and offers a manual link. Short codes obscure the destination in the shared address; they do not make the displayed destination secret.

The migration enables RLS and grants clients only article reads matching publication and visibility. Link records are accessible only through authenticated administrator actions and the server interstitial. Service credentials stay on the server. Pages are dynamic so revoked publication, access changes, and disabled links take effect without stale public caches.

## Performance and China access

Google Material Icons Round is hosted at `/fonts/material-icons-round.otf` with its Apache license, eliminating the Google CSS/font connection while preserving the icon design. Admin routes have a loading boundary and default partial prefetch. Anonymous redirect pages avoid account queries. `vercel.json` places functions in Tokyo (`hnd1`), matching the Supabase database in `ap-northeast-1`; the previous function region was Washington (`iad1`).

These changes remove external font dependence and improve navigation feedback. They do not establish mainland latency improvement: test actual mainland networks before making that claim. Hosting is still overseas. A mainland mirror/CDN needs a separate deployment/domain plan and any applicable filing; avoid caching private admin, login, or API responses at a CDN.

## Verification

Run `node --test tests/site-content.test.mts`, ESLint and `npm run build`. Verify anonymous public reads, signed-in restricted reads, draft invisibility, denied direct writes, link edits and disabled links against the database and HTTP routes.

### Release verification (2026-09-26)

- Database migration applied; transactional assertions passed for anonymous, signed-in, anonymous-account, and denied-write access.
- Production admin session: created a draft, rendered Markdown preview, edited and published it, created a random link, changed its name/target while retaining the code, and disabled it.
- Anonymous HTTP: draft 404; published public article 200 with rendered Markdown; login-only article 307 without body; disabled link 404. Signed-in browser successfully read the restricted article. Test fixtures were removed.
- Tokyo production deployment Ready, function outputs confirmed `hnd1`, health endpoint returned 200/ok.
- Build, TypeScript, changed-file ESLint, content tests (2), and existing reader/admin tests (14) passed. Full-repository ESLint still reports five pre-existing plain anchor navigation violations outside this change.
- Mainland network latency and a physical phone viewport have not been measured in this session.
