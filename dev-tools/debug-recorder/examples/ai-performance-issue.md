# AI Pocket Debug Report — AI Performance Issue

Generated: 2024-02-18 16:22:47 UTC  
Extension Version: 1.0.0  
Chrome Version: 122.0.6261.29  
Platform: Mac OS X (arm64)  
Report ID: c8d4f1e9-7b2a-4a3c-9e11-8f5d9c6ea123

---

## Executive Summary

**Overall Health**: ⚠️ Performance degraded

- Storage: ✅ 32% used
- AI Services: ⚠️ High latency on Gemini Flash
- Performance: 🚨 p95 latency 12s (normal: 2-3s)
- Errors: ⚠️ 12 timeouts in last hour

**Immediate Actions:**

1. Check network connectivity
2. Verify API key validity
3. Switch to Gemini Nano (on-device) temporarily

---

## AI Performance

### Gemini Nano — ✅ Healthy

- Status: Available (v1.5.0)
- Latency:
  - p50: 1.4s
  - p95: 3.1s
  - p99: 4.8s
- Errors: 0

### Cloud AI (Gemini Flash) — 🚨 Slow

- Status: API key valid
- Latency:
  - p50: 4.2s (expected: 0.8s) 🚨
  - p95: 12.3s (expected: 2.1s) 🚨
  - p99: 18.7s 🚨
  - Max: 25.4s (timeout threshold: 30s)
- Errors:
  - Timeouts: 12 (5%)
  - Rate limits: 0
  - Network: 3 (1%)

---

## Root Cause Analysis

**Probable Issues:**

1. **Network latency**: ISP throttling or regional server issues
2. **API overload**: Google AI API experiencing high load
3. **Configuration**: Possibly using distant region endpoint

---

## Recent Errors (Excerpt)

1. `[16:20:12] TimeoutError`
   - Source: `cloud-ai-manager.ts:187`
   - Message: "Request timed out after 30s"
   - Context: Chat request (token count: 1,234)
   - Recovery: Retry succeeded after 12s

2. `[16:18:45] NetworkError`
   - Source: `fetch-wrapper.ts:67`
   - Message: "Failed to fetch: ERR_NETWORK_CHANGED"
   - Context: Embedding generation
   - Recovery: Auto-retry queued

---

## Recommendations

- **Immediate:**
  - Switch AI preference to "Prefer Nano" in Settings
  - Refresh network connection (disconnect/reconnect WiFi)
  - Test network: `ping generativelanguage.googleapis.com`

- **Long term:**
  - Enable "Auto-switch on slow response" (experimental feature)
  - Report persistent slowness to Google AI support
  - Consider adding network quality detection

---

_For full troubleshooting steps see: dev-tools/debug-recorder/README.md#troubleshooting_
