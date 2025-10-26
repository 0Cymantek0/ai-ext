# AI Pocket Debug Report — Search Relevance Issue

Generated: 2024-02-21 11:08:51 UTC  
Extension Version: 1.0.0  
Chrome Version: 122.0.6261.39  
Platform: Ubuntu 22.04 (x64)  
Report ID: a17f3b2c-981e-4d44-b61e-05bf42efcd98

---

## Executive Summary

**Overall Health**: ⚠️ Needs attention

- Storage: ✅ 28% used
- AI Services: ✅ Operational
- Performance: ✅ Stable
- Search Relevance: ⚠️ Average similarity 0.54 (target >0.75)

**Immediate Actions:**

1. Rebuild vector index
2. Verify content chunking strategy
3. Review embedding generator configuration

---

## Vector Operations

### Indexing Queue — ⚠️ Recently Rebuilt

- Pending: 0
- Completed: 9,432 jobs
- Failed: 37 (0.4%)
- Rebuild Trigger: Manual (user action)

### Search Performance — ⚠️ Low Relevance

- Total queries (24h): 612
- Result count avg: 9.8
- Similarity scores:
  - Avg: **0.54** ⚠️
  - p50: 0.57
  - p95: 0.68
  - Max: 0.82

- **Expected range:** Avg 0.75-0.85

---

## Diagnostics

### Chunking Summary

- Chunk size: 1,200 chars (custom)
- Overlap: 0 (custom) ⚠️ Recommended overlap: 100
- Content length distribution:
  - Short (<800 chars): 45%
  - Medium (800-2,000 chars): 38%
  - Long (>2,000 chars): 17%

### Embedding Engine

- Model: `text-embedding-004`
- Failures: 0
- Average latency: 1.4s
- Batch size: 8 (default)

### Similarity Audit (Sample)

| Query                | Expected Tag | Top Result              | Similarity | Notes         |
| -------------------- | ------------ | ----------------------- | ---------- | ------------- |
| "async react hooks"  | programming  | "async storage API"     | 0.47       | Wrong topic   |
| "market analysis"    | research     | "recipe cost breakdown" | 0.52       | Wrong tag     |
| "auto summarization" | ai           | "manual summary tips"   | 0.58       | Partial match |

---

## Recommendations

1. **Adjust Chunking:**
   - Reduce chunk size to 1,000 characters
   - Reintroduce 100-character overlap for context continuity

2. **Rebuild Index:**

   ```javascript
   chrome.runtime.sendMessage({
     kind: 'VECTOR_INDEX_REBUILD',
     payload: { chunkSize: 1000, overlap: 100 },
   });
   ```

3. **Analyze Tagged Content:**
   - Review tagging accuracy for recent additions
   - Remove or retag misclassified content

4. **Add Benchmark Queries:**
   - Use synthetic queries to measure relevance over time
   - Track score trends in the monitoring dashboard

---

_For full troubleshooting steps see: dev-tools/debug-recorder/README.md#troubleshooting_
