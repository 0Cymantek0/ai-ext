# Vision Integration Layer

## Overview

The Vision Integration Layer enables screenshot capture and AI-powered visual analysis using Google's Gemini Vision models (2.5-Pro, 2.5-Flash, 2.5-Flash-Lite). This feature is disabled by default for MVP and requires explicit configuration.

## Features

### 1. Screenshot Capture
- Capture visible tab areas as PNG or JPEG
- Optional element annotation with numbered bounding boxes
- Device pixel ratio awareness for high-DPI displays
- Element mapping extraction from DOM

### 2. Visual Analysis
- Describe page content and layout
- Identify UI elements by natural language description
- Detect page states (CAPTCHA, authentication, errors)
- Cost tracking and result caching

### 3. Fallback Interaction
- When CSS selector-based interaction fails, use vision to locate elements
- Maps visual identification back to known selectors
- Confidence scoring for element matches

### 4. Observability
- API call tracking by model
- Estimated cost monitoring (USD)
- Cache hit/miss ratios
- Processing time metrics

## Configuration

### Enable Vision Features

```typescript
// In service worker or settings UI
import { getVisionManager } from './browser-agent/vision.js';

const visionManager = getVisionManager();

// Set Gemini API key
await visionManager.setApiKey('YOUR_GEMINI_API_KEY');

// Enable vision features
await visionManager.setEnabled(true);

// Update other configuration
await visionManager.updateConfig({
  defaultModel: 'gemini-2.5-flash',
  cacheEnabled: true,
  costTrackingEnabled: true,
});
```

### Environment Variables

For development, you can set the API key via environment variable:

```bash
VITE_GEMINI_API_KEY=your-api-key-here pnpm dev
```

## Usage Examples

### 1. Capture Screenshot for Analysis

```typescript
// Via message passing
const response = await chrome.runtime.sendMessage({
  kind: 'VISION_CAPTURE_FOR_ANALYSIS',
  payload: {
    tabId: 123, // optional, defaults to active tab
    format: 'png',
    annotateElements: true, // Add numbered overlays
  },
});

if (response.success) {
  const { dataUrl, width, height, elementMappings } = response;
  console.log(`Captured ${width}x${height} screenshot with ${elementMappings?.length} elements`);
}
```

### 2. Analyze Screenshot

```typescript
const response = await chrome.runtime.sendMessage({
  kind: 'VISION_ANALYZE_SCREENSHOT',
  payload: {
    screenshot: dataUrl, // or CaptureResult object
    prompt: 'Describe the main content and layout of this page',
    model: 'gemini-2.5-flash', // optional
    useCache: true, // optional
  },
});

if (response.success) {
  const { text, model, tokensUsed, processingTimeMs, cost } = response.result;
  console.log(`Analysis (${model}): ${text}`);
  console.log(`Tokens: ${tokensUsed}, Time: ${processingTimeMs}ms, Cost: $${cost}`);
}
```

### 3. Detect Page State

```typescript
// Check for CAPTCHA, authentication, or error pages
const response = await chrome.runtime.sendMessage({
  kind: 'VISION_DETECT_PAGE_STATE',
  payload: {
    screenshot: dataUrl,
  },
});

if (response.success) {
  const { detected, type, confidence, requiresHumanIntervention } = response.result;
  
  if (requiresHumanIntervention) {
    console.warn(`Human intervention required: ${type} (confidence: ${confidence})`);
    // Pause workflow, notify user
  }
}
```

### 4. Find Element by Description (Fallback)

```typescript
// When selector-based interaction fails
const captureResponse = await chrome.runtime.sendMessage({
  kind: 'VISION_CAPTURE_FOR_ANALYSIS',
  payload: { annotateElements: true },
});

if (captureResponse.success) {
  const findResponse = await chrome.runtime.sendMessage({
    kind: 'VISION_FIND_ELEMENT',
    payload: {
      screenshot: captureResponse,
      description: 'the login button',
    },
  });

  if (findResponse.success && findResponse.result) {
    const { index, selector, confidence } = findResponse.result;
    console.log(`Found element #${index} with selector: ${selector} (confidence: ${confidence})`);
    // Use selector for interaction
  }
}
```

### 5. Get Usage Statistics

```typescript
const response = await chrome.runtime.sendMessage({
  kind: 'VISION_GET_USAGE_STATS',
  payload: {},
});

if (response.success) {
  const { totalCalls, callsByModel, estimatedCostUSD, cacheHits, cacheMisses } = response.stats;
  console.log(`Vision API Usage:
  - Total calls: ${totalCalls}
  - Estimated cost: $${estimatedCostUSD.toFixed(4)}
  - Cache hit rate: ${(cacheHits / (cacheHits + cacheMisses) * 100).toFixed(1)}%
  - Calls by model:`, callsByModel);
}
```

## Browser Agent Tools

Vision features are integrated into the Browser Agent tool registry:

1. **capture_for_vision** - Capture optimized screenshots
2. **analyze_screenshot** - Analyze with Gemini Vision
3. **detect_page_state** - Detect CAPTCHAs and errors
4. **find_element_by_vision** - Visual element identification

These tools are available for workflow automation but require vision to be enabled.

## Cost Considerations

### Model Pricing (Estimated)

| Model | Cost per Image |
|-------|----------------|
| gemini-2.5-pro | $0.05 |
| gemini-2.5-flash | $0.02 |
| gemini-2.5-flash-lite | $0.01 |

**Recommendations:**
- Use **flash-lite** for simple detection tasks (CAPTCHA, page state)
- Use **flash** (default) for general analysis and element identification
- Use **pro** only for complex reasoning or multi-step visual tasks
- Enable caching to reduce redundant API calls

### Cache Configuration

```typescript
await visionManager.updateConfig({
  cacheEnabled: true,
  maxCacheEntries: 100, // Maximum cached results
  maxCacheSizeBytes: 50 * 1024 * 1024, // 50MB approximate limit
});
```

Cached results expire after 1 hour by default.

## Testing

### Unit Tests

```bash
# Run vision unit tests
pnpm test src/browser-agent/__tests__/vision.test.ts

# Run all browser agent tests
pnpm test --filter=browser-agent
```

### Manual Validation

Create a test script:

```typescript
// test-vision.ts
import { createVisionManager } from './browser-agent/vision.js';
import { logger } from './background/monitoring.js';

async function testVision() {
  const manager = createVisionManager(logger, {
    apiKey: process.env.VITE_GEMINI_API_KEY,
    enabled: true,
  });

  // Wait for initialization
  await new Promise(resolve => setTimeout(resolve, 100));

  if (!manager.isAvailable()) {
    console.error('Vision not available - check API key');
    return;
  }

  console.log('✓ Vision manager initialized');

  // Test 1: Capture screenshot
  const capture = await manager.captureForVision({
    format: 'png',
    annotateElements: true,
  });

  console.log(`✓ Captured ${capture.width}x${capture.height} screenshot`);
  console.log(`  Elements mapped: ${capture.elementMappings?.length || 0}`);

  // Test 2: Analyze screenshot
  const analysis = await manager.analyzeScreenshot(capture, {
    prompt: 'Describe what you see in this screenshot',
    model: 'gemini-2.5-flash',
  });

  console.log(`✓ Analysis completed in ${analysis.processingTimeMs}ms`);
  console.log(`  Model: ${analysis.model}`);
  console.log(`  Tokens: ${analysis.tokensUsed}`);
  console.log(`  Cost: $${analysis.cost?.toFixed(4)}`);
  console.log(`  Response: ${analysis.text.substring(0, 100)}...`);

  // Test 3: Check usage
  const stats = manager.getUsageStats();
  console.log(`✓ Usage stats:`);
  console.log(`  Total calls: ${stats.totalCalls}`);
  console.log(`  Estimated cost: $${stats.estimatedCostUSD.toFixed(4)}`);

  console.log('\n✓ All tests passed');
}

testVision().catch(console.error);
```

Run with:
```bash
VITE_GEMINI_API_KEY=your-key npx tsx test-vision.ts
```

## Security & Privacy

### Data Handling
- Screenshots are sent to Google's Gemini API for analysis
- No screenshots are stored on Google servers beyond the API call
- Results can be cached locally (chrome.storage.local)
- API keys are stored in chrome.storage.local (encrypted by Chrome)

### User Consent
- Vision features are **disabled by default**
- Users must explicitly provide an API key and enable the feature
- Clear documentation about data transmission to Google
- Usage statistics help users monitor API consumption

### Best Practices
1. Only capture screenshots when necessary
2. Avoid capturing sensitive information (passwords, PII)
3. Inform users about vision feature usage in your workflow
4. Implement workflow pause for human escalation when required
5. Monitor costs and set appropriate limits

## Workflow Integration

### Detection-Driven Workflow

```typescript
import { getVisionManager } from './browser-agent/vision.js';

async function workflowWithVisionFallback(workflowId: string) {
  const vision = getVisionManager();

  // Step 1: Try normal interaction
  let element;
  try {
    element = await findElementBySelector('#submit-btn');
  } catch (error) {
    console.log('Selector failed, using vision fallback...');

    // Step 2: Capture screenshot with annotations
    const screenshot = await vision.captureForVision({
      annotateElements: true,
    });

    // Step 3: Detect page state
    const state = await vision.detectPageState(screenshot);
    
    if (state.requiresHumanIntervention) {
      // Pause workflow and notify user
      await pauseWorkflow(workflowId, {
        reason: `Human intervention required: ${state.type}`,
        confidence: state.confidence,
      });
      return;
    }

    // Step 4: Find element by description
    const result = await vision.findElementByDescription(
      screenshot,
      'the submit button'
    );

    if (!result) {
      throw new Error('Element not found via vision');
    }

    element = await findElementBySelector(result.selector);
  }

  // Step 5: Continue with interaction
  await element.click();
}
```

## Troubleshooting

### Vision not available
- Check that API key is set: `await visionManager.getConfig()`
- Verify API key is valid (test with a simple API call)
- Ensure vision is enabled: `await visionManager.setEnabled(true)`

### High costs
- Review usage stats: `visionManager.getUsageStats()`
- Enable caching if disabled
- Use cheaper models (flash-lite) for simple tasks
- Reduce screenshot capture frequency

### Slow performance
- Check cache hit rate - low rate indicates redundant calls
- Use async patterns to avoid blocking
- Consider preprocessing screenshots (resize, compress)
- Monitor processing time metrics

### Element mapping issues
- Ensure elements are visible in viewport
- Check devicePixelRatio scaling
- Verify content script is loaded
- Test with simpler page layouts first

## Limitations

1. **Viewport Only**: Only captures visible tab area (no full-page screenshots)
2. **Static Content**: Screenshots are static; dynamic content may change between capture and interaction
3. **API Limits**: Subject to Google Gemini API rate limits and quotas
4. **Cost**: Vision API calls incur costs; monitor usage carefully
5. **Accuracy**: Element identification confidence varies by page complexity
6. **English-Centric**: Best performance with English content and descriptions

## Future Enhancements

- Full-page screenshot capture (via scrolling and stitching)
- Video/animation capture for dynamic content
- OCR integration for text extraction
- Batch processing for multiple screenshots
- Custom model fine-tuning for specific domains
- Advanced cost controls and budgets

## References

- [Google Generative AI SDK](https://www.npmjs.com/package/@google/generative-ai)
- [Gemini API Documentation](https://ai.google.dev/docs)
- [Chrome Extension APIs](https://developer.chrome.com/docs/extensions/reference/)
- [Browser Agent Architecture](./browser-agent-architecture.md)
