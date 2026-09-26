# Sync responsiveness

Sync HTTP requests allow 45 seconds; sync database requests allow 30 seconds and route execution allows 60 seconds. Ordinary UI requests retain their 8-second deadline. Caller cancellation still applies.

Requests carry at most 10 operations or 250,000 encoded bytes. Oversized single operations use the existing large transfer path. Parts normally contain 60,000 raw bytes; payloads above 12 MB adapt the part size up to 120,000 bytes to retain the existing 200-part database limit and 24 MB transfer capacity. Old clients remain accepted.

The status panel replays current status when mounted and displays upload/download progress. Manual requests during active sync are coalesced into one follow-up run. Pending batches drain before success is reported; failure preserves the durable outbox. Guest mode explains that login is required.

Sidebar links disable speculative Next.js prefetching. PWA startup no longer warms every offline route; visited-page caching remains. This trades slower first navigation and fewer never-visited offline pages for less competition with sync requests.

Verification: sync-performance, sync-v2, logout-resilience, PWA and mobile regression tests. Real authenticated cross-device sync and physical iPhone Safari/Chrome require account/device verification.
