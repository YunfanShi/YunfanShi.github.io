# JackYun Watch API v1

The gateway lives at `https://jackyun.top/api/watch/v1`. All responses use private `no-store`. The client accepts HTTPS only, refuses redirects, bounds request bodies to 32 KB and snapshot responses to 2 MB.

## Authentication

`POST login` accepts `{identifier,password,name}`. It returns `{session}` or `{mfaRequired,id,claimSecret}`. For the latter, `POST mfa` accepts `{id,claimSecret,code}`; a wrong six-digit TOTP consumes the challenge and requires a new login. Phone MFA is rejected explicitly.

A device session contains `deviceId`, `deviceSecret`, `accessToken`, `refreshToken`, `accountLabel`, and `expiresAt`. The two tokens are random opaque gateway credentials, not Supabase tokens. Supabase access and refresh tokens remain encrypted in `watch_devices.session_payload` on the server. Every watch request checks the device, account and MFA state; the database uses the verified account session and RLS.

Authenticated requests use `Authorization: Bearer <opaque access token>`, `X-Watch-Device`, and `X-Watch-Secret`. `POST refresh` uses the device ID, secret and opaque refresh token in its JSON body, without an Authorization header. An expired account token triggers refresh; revoked or disabled accounts clear local data. Temporary errors preserve local intent. Refresh response loss can be retried using the same device credentials.

## Pairing

`POST pair/create` accepts `{name}` and returns `id`, `claimSecret`, an eight-digit `code`, `expiresAt`, and a QR `url`. The QR URL contains only the ID. The watch keeps its separate claim secret. Requests expire after five minutes.

Logged-in browser users call `POST pair/inspect` with `{id}` or `{code}`. The response shows device name, current account and expiry. They must explicitly call `POST pair/approve` with `{id}`. Mutation requests require the same Origin as the website. Approval creates an independent account session, then seals the gateway device session for the watch.

The watch polls `POST pair/claim` with `{id,claimSecret}`; it receives pending, a one-time login response, or an expired response. The database atomically consumes the sealed payload. Cancel uses `POST pair/cancel` with the same credentials. The QR decoder is vendored jsQR 1.4.0 with its license; it never sends camera frames to an external service.

## Data and writes

`GET snapshot` returns `apiVersion:1`, `timezone`, `generatedAt`, `modules`, `lessons`, `tasks`, `notifications`, `unreadCount`, `notificationHasMore`, `countdowns`, and `cue`. Each module is `ready`, `error` or `not_synced`. A failed module must not be treated as an empty successful result. The native client retains a previous successful module as `cached` and labels it explicitly.

The timetable and CUE summary reuse existing portal rules. Timetable cache spans the current week and the next seven days. The initial calendar is Asia/Shanghai. Tasks are limited to 500, countdowns to 200, notifications to the server's recent page. Browser-local, unsynchronized data is unavailable.

`POST operations` accepts a stable UUID `operationId`, `kind`, optional `targetId` and `version`, and `details`. The only kinds are:

- `task`: UUID target, exact `updated_at` version, `{completed:boolean}`.
- `notification`: visible notification UUID, mark read for the authenticated account.
- `focus`: `{durationSeconds,plannedSeconds,startedAt,completedAt}`; times are epoch milliseconds. Active time must be at least 60 seconds, no more than six hours and no greater than elapsed time.

The server records an operation receipt in the same transaction as its write. Identical retries return the saved result. Reusing an ID with changed data or submitting a stale task version returns 409. Deleted notifications return 404; malformed operations return 422. The watch preserves these conflicts for user review. Focus completion is saved and enqueued in one local encrypted transaction.

`GET devices` and `POST devices/revoke` are browser-account management endpoints. `POST logout` revokes the device and its independent account session. Offline logout erases local data; use the website to revoke its server credential when connectivity is available.

## Deployment and validation

The SQL migration and rollback integration test are in the portal repository. `WATCH_V1_ENABLED=true` activates the gateway. `WATCH_PAIR_KEY` can separate payload encryption from the existing service key; changing encryption keys invalidates cached server sessions and requires device login again. Server credentials are never committed or delivered to the client.

The production schema has been applied and its permissions checked. The production deployment requires explicit release approval after automatic approval review rejected it. Source, APK and DOCX are on main; local browser approval tests use simulated endpoints. Real login, refresh, QR claim and revocation require online validation after release. Real HUAWEI WATCH 4 installation and reminder behavior remain unverified.
