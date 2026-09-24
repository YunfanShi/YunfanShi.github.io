# Backup Center

Settings → Data & Privacy contains the Backup Center. It groups supported account data into pages. Database writes save the previous page state in `backup_center_versions` in the same transaction as the write. A failed backup aborts the data write. Existing data receives a baseline when the migration runs.

Each account can choose 4 through 10 versions **per page** (7 by default). On each new version, the oldest version beyond the limit is deleted. Lowering the limit prunes extra versions immediately. The existing Schedule-specific 90-day history remains available separately.

The browser also records versions of syncable local page data in IndexedDB, scoped by account (or guest), when it observes a change. It checks every two seconds and on cross-tab storage events. It keeps the same per-page count. A rapid sequence of local changes between checks may appear as one version; each successful cloud write still gets its own database backup.

Restoring a cloud version first saves the current page, then merges saved rows into the account in one database transaction. Rows created after the backup are retained. Local sync metadata and pending operations for restored JSON keys are updated so the next sync does not silently reverse the restore. Restoring a local version first saves the current local page, then writes the selected keys and queues normal sync. The UI can download either version type and import an edited local page JSON file after validation.

Sensitive credentials, tokens, diagnostics, and AI configuration are excluded from versions and full exports. Schedule imports must contain meaningful Schedule data. Reader shelf metadata is included, but book file bodies in Storage are not. Full JSON exports have a checksum; the existing import panel validates the checksum and lets users choose tables before merging data. Exports page through all rows (up to 20,000 per table) rather than relying on the API's single-query row limit.

Deploy the SQL migration before the application code. The application exposes cloud controls only after authentication. To verify locally, run `supabase db reset --local --yes`, then `docker exec -i supabase_db_jackyun-portal psql -U postgres -d postgres -v ON_ERROR_STOP=1 < tests/backup-center.sql`. The SQL test runs inside a rolled-back transaction and checks Schedule protection, page restoration, account isolation, and retention.
