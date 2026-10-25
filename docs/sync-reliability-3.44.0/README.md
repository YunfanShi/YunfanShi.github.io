# Sync reliability 3.44.0

Website baseline: fd0a8d2 / 3.43.0. Website release: 3.44.0. Backend: 3.7.0.

See the DOCX implementation report and `verification.json` for measured results and unfinished production gates. Original user logs, tokens, connection logs, packages and rendered images are not committed.

## Deployment gates

1. Supabase migration `reliable_offline_mutations` must exist before deploying the website.
2. Deploy the backward compatible backend before the website. Leave v4 off until its Azure SQL migration and runtime grants are verified.
3. Apply `jackyun-portal/azure/sync-v4.sql` only to the designated Azure sync database, as the migration administrator, using a transaction and `ON_ERROR_STOP`.
4. Enable a verified account with `SYNC_V4_USERS`, then verify two authenticated clients. Only enable `SYNC_V4_ENABLED=true` after that acceptance passes.
5. Preserve in-flight protocol identity, outbox, receipts, conflicts, documents and tombstones on rollback.

Automatic approval review initially rejected a temporary database firewall rule. The user subsequently explicitly authorized a temporary current single-exit IPv4 rule, migration, and immediate verified cleanup. The Azure migration has now committed; runtime RLS, v3-triggered changes, duplicate suppression, CAS, tombstones and account sequence checks passed in a rollback transaction. See `jackyun-portal/azure/tests/sync-v4.sql`. No proxy helper was used. V4 rollout settings remain absent, so v4 stays disabled pending authenticated acceptance.

Production website deployment `dpl_CRwyB39J51k4v2DUnj4zU2Ktc4bf` is READY for Main `199fde9b932b3697337d8eef7209b3c472791c52` and aliases `jackyun.top`. Public update content includes 3.44.0; Azure `/health/live` reports 3.7.0. An unauthenticated `/api/sync/v4` response is 401 with a request ID; this is an authentication check, not real-account sync acceptance.

## References

- [Replicache synchronization](https://doc.replicache.dev/concepts/how-it-works)
- [Replicache push transaction semantics](https://doc.replicache.dev/reference/server-push)
- [Azure circuit breaker](https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker)
