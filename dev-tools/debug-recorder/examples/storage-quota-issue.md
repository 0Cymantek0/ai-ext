# AI Pocket Debug Report — Storage Quota Issue

Generated: 2024-02-12 09:45:32 UTC  
Extension Version: 1.0.0  
Chrome Version: 121.0.6167.85  
Platform: Windows 11 (x64)  
Report ID: 3f7a6c2b-4d9e-41c8-8f21-5a328c9012ab

---

## Executive Summary

**Overall Health**: ⚠️ Attention required

- Storage: 🚨 IndexedDB at 97% quota (291 MB / 300 MB)
- AI Services: ✅ Operational
- Performance: ⚠️ Save latency spikes due to quota errors
- Errors: 🚨 Frequent `QuotaExceededError`

**Immediate Actions:**
1. Export and archive old pockets
2. Delete unused vector chunks >90 days old
3. Enable automatic storage cleanup

---

## Storage Status

### IndexedDB — 🚨 Critical
- Size: **291 MB / 300 MB (97%)**
- Projected full in: **2 days** at current growth
- Largest stores:
  - `vectors`: 215 MB (74%)
  - `content`: 58 MB (20%)
  - `conversations`: 18 MB (6%)

### Chrome Storage
- Local: 2.7 MB / 10 MB (27%)
- Sync: 82 KB / 100 KB (82%) ⚠️

---

## Recent Errors (Excerpt)

1. `[09:40:12] QuotaExceededError`
   - Source: `indexeddb-manager.ts:403`
   - Operation: Saving vector chunk for content `doc-7782`
   - Retry: Failed (quota reached)

2. `[09:40:10] QuotaExceededError`
   - Source: `vector-indexing-queue.ts:281`
   - Operation: Batch embedding save (15 chunks)
   - Retry: Skipped to prevent cascade

3. `[09:39:55] Warning`
   - Source: `quota-manager.ts:250`
   - Message: "IndexedDB usage exceeded 95%"

---

## Recommendations

- **Short term:**
  - Remove unused pockets (focus on large PDFs)
  - Clear vector cache in Settings → Storage
  - Enable "Auto-trim vector history" option (14 days)

- **Long term:**
  - Increase chunk pruning threshold
  - Consider selective indexing (disable RAG for low-value tags)

---

_For full troubleshooting steps see: dev-tools/debug-recorder/README.md#troubleshooting_
