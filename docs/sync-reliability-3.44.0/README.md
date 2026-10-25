# Sync reliability 3.44.0

Website baseline: fd0a8d2 / 3.43.0. Website release: 3.44.0. Backend: 3.7.0.

See the DOCX implementation report and `verification.json` for measured results and unfinished production gates. Original user logs, tokens, connection logs, packages and rendered images are not committed.

## Deployment gates

1. Supabase migration `reliable_offline_mutations` must exist before deploying the website.
2. Deploy the backward compatible backend before the website. Leave v4 off until its Azure SQL migration and runtime grants are verified.
3. Apply `jackyun-portal/azure/sync-v4.sql` only to the designated Azure sync database, as the migration administrator, using a transaction and `ON_ERROR_STOP`.
4. Enable a verified account with `SYNC_V4_USERS`, then verify two authenticated clients. Only enable `SYNC_V4_ENABLED=true` after that acceptance passes.
5. Preserve in-flight protocol identity, outbox, receipts, conflicts, documents and tombstones on rollback.

The attempted temporary single-IP firewall rule was rejected by automatic approval review. It was not created. Do not bypass that rejection with another tunnel or helper. Obtain explicit authorization or an approved existing network route before migrating Azure.

## References

- [Replicache synchronization](https://doc.replicache.dev/concepts/how-it-works)
- [Replicache push transaction semantics](https://doc.replicache.dev/reference/server-push)
- [Azure circuit breaker](https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker)
