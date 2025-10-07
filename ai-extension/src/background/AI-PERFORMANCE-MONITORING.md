# AI Performance Monitoring

## Overview

The AI Performance Monitoring system provides comprehensive tracking and analysis of AI operations across all models (Gemini Nano, Flash, Flash-Lite, and Pro). It implements Requirements 13.1 (Performance Optimization) and 16.2 (Cost Management) by tracking response times, token usage, and providing cost estimates.

## Features

### 1. Response Time Tracking

Track response times for all AI operations:
- **Per-operation metrics**: Track individual operation times
- **Statistical analysis**: Calculate average, min, max, and percentiles (p50, p95, p99)
- **Model comparison**: Compare response times across different models
- **Operation comparison**: Compare response times across different operation types

### 2. Token Usage Monitoring

Monitor token consumption across all AI models:
- **Total token tracking**: Track cumulative token usage
- **Per-model breakdown**: See token usage by each model
- **Per-operation breakdown**: See token usage by operation type
- **Cost estimation**: Calculate estimated costs based on token usage

### 3. Success Rate Monitoring

Track success and failure rates:
- **Overall success rate**: Track total success percentage
- **Per-model success rates**: Compare reliability across models
- **Per-operation success rates**: Identify problematic operations
- **Error tracking**: Record and analyze error patterns

### 4. Model Selection Statistics

Monitor AI model selection decisions:
- **Selection frequency**: Track how often each model is selected
- **Local vs Cloud ratio**: Monitor on-device vs cloud processing balance
- **Decision reasoning**: Track reasons for model selection

## Usage

### Basic Usage

```typescript
import { aiPerformanceMonitor, AIModel, AIOperation } from './ai-performance-monitor';

// Automatically measure an operation
const result = await aiPerformanceMonitor.measureOperation(
  AIModel.GEMINI_NANO,
  AIOperation.SUMMARIZE,
  async () => {
    // Your AI operation here
    return await processContent();
  }
);

// Manually record an operation
aiPerformanceMonitor.recordOperation({
  success: true,
  model: AIModel.GEMINI_FLASH,
  operation: AIOperation.CHAT,
  responseTime: 1250,
  tokensUsed: 450,
  timestamp: Date.now(),
});

// Record model selection decision
aiPerformanceMonitor.recordModelSelection(
  AIModel.GEMINI_PRO,
  'Complex reasoning task requires Pro model'
);
```

### Getting Statistics

```typescript
// Get token usage statistics
const tokenStats = aiPerformanceMonitor.getTokenUsageStats();
console.log('Total tokens used:', tokenStats.total);
console.log('Estimated cost:', `$${tokenStats.estimatedCost.toFixed(4)}`);
console.log('Tokens by model:', tokenStats.byModel);

// Get response time statistics
const timeStats = aiPerformanceMonitor.getResponseTimeStats();
console.log('Average response time:', `${timeStats.average.toFixed(2)}ms`);
console.log('95th percentile:', `${timeStats.p95.toFixed(2)}ms`);
console.log('Response times by model:', timeStats.byModel);

// Get success rate statistics
const successStats = aiPerformanceMonitor.getSuccessRateStats();
console.log('Overall success rate:', `${successStats.successRate.toFixed(2)}%`);
console.log('Success by model:', successStats.byModel);

// Get model selection statistics
const selectionStats = aiPerformanceMonitor.getModelSelectionStats();
console.log('Total decisions:', selectionStats.totalDecisions);
console.log('Local vs Cloud:', selectionStats.localVsCloud);
console.log('Selection rates:', selectionStats.selectionRate);

// Get comprehensive summary
const summary = aiPerformanceMonitor.getSummary();
console.log('Performance Summary:', summary);
```

### Cost Management

```typescript
// Get cost breakdown by model
const costBreakdown = aiPerformanceMonitor.getCostBreakdown();

Object.entries(costBreakdown).forEach(([model, data]) => {
  console.log(`${model}:`);
  console.log(`  Tokens: ${data.tokens.toLocaleString()}`);
  console.log(`  Cost: $${data.cost.toFixed(4)}`);
});

// Get recent operations for analysis
const recentOps = aiPerformanceMonitor.getRecentOperations(20);
recentOps.forEach(op => {
  console.log(`${op.operation} (${op.model}): ${op.responseTime.toFixed(2)}ms, ${op.tokensUsed} tokens`);
});
```

### Data Management

```typescript
// Export metrics for analysis
const metricsJson = aiPerformanceMonitor.exportMetrics();
console.log(metricsJson);

// Clear all metrics
await aiPerformanceMonitor.clearMetrics();
```

## Integration with AI Managers

### AI Manager (Gemini Nano)

The AI Manager automatically tracks all Gemini Nano operations:

```typescript
// processPrompt automatically tracks performance
const result = await aiManager.processPrompt(
  sessionId,
  prompt,
  { operation: AIOperation.SUMMARIZE }
);

// processPromptStreaming tracks streaming operations
const stream = await aiManager.processPromptStreaming(
  sessionId,
  prompt,
  { operation: AIOperation.CHAT }
);
```

### Cloud AI Manager

The Cloud AI Manager automatically tracks all cloud operations:

```typescript
// All cloud operations are automatically monitored
const response = await cloudAIManager.processWithFlash(
  prompt,
  { operation: AIOperation.ANALYZE }
);

// Streaming operations are also tracked
for await (const chunk of cloudAIManager.processWithFlashStreaming(prompt)) {
  // Process chunk
}
```

### Hybrid AI Engine

The Hybrid AI Engine tracks model selection decisions:

```typescript
// Model selection is automatically recorded
const decision = await hybridEngine.determineProcessingLocation(task);
// Decision is logged with reasoning

// Processing operations are tracked
const result = await hybridEngine.processContent(task);
```

## Cost Estimation

Token costs are based on Google Gemini pricing (per 1M tokens):

| Model | Cost per 1M Tokens |
|-------|-------------------|
| Gemini Nano | $0.00 (free, on-device) |
| Gemini Flash-Lite | $0.075 |
| Gemini Flash | $0.15 |
| Gemini Pro | $1.25 |

The system automatically calculates estimated costs based on actual token usage.

## Performance Targets

The monitoring system helps ensure these performance targets are met:

- **Simple tasks (Gemini Nano)**: < 500ms response time (Requirement 3.9)
- **Memory usage**: < 100MB peak (Requirement 13.1)
- **Token tracking accuracy**: 100% of operations tracked (Requirement 16.2)
- **Cost estimation**: Real-time cost tracking for budget management (Requirement 16.2)

## Data Persistence

### Storage
- **Location**: chrome.storage.local
- **Key**: `ai_performance_metrics`
- **Retention**: Last 100 operations, cumulative statistics
- **Max In-Memory**: 1000 operations

### Automatic Persistence
- Metrics are automatically persisted after each operation
- Statistics are preserved across browser sessions
- Data can be exported for external analysis

## Monitoring Dashboard (Future Enhancement)

The performance data can be visualized in a dashboard showing:
- Real-time response time graphs
- Token usage trends over time
- Cost accumulation charts
- Model selection distribution
- Success rate trends
- Performance comparisons

## Best Practices

1. **Always specify operation type** when calling AI operations:
   ```typescript
   await aiManager.processPrompt(sessionId, prompt, {
     operation: AIOperation.SUMMARIZE
   });
   ```

2. **Monitor costs regularly** for budget management:
   ```typescript
   const stats = aiPerformanceMonitor.getTokenUsageStats();
   if (stats.estimatedCost > dailyBudget) {
     // Alert user or throttle operations
   }
   ```

3. **Analyze performance trends** to optimize model selection:
   ```typescript
   const timeStats = aiPerformanceMonitor.getResponseTimeStats();
   // Use data to adjust model selection thresholds
   ```

4. **Track success rates** to identify issues:
   ```typescript
   const successStats = aiPerformanceMonitor.getSuccessRateStats();
   if (successStats.byModel[AIModel.GEMINI_FLASH].rate < 95) {
     // Investigate Flash model issues
   }
   ```

5. **Export metrics periodically** for long-term analysis:
   ```typescript
   // Export weekly for analysis
   const metrics = aiPerformanceMonitor.exportMetrics();
   // Save to file or send to analytics service
   ```

## Requirements Satisfied

- **Requirement 13.1**: Performance optimization through response time tracking
- **Requirement 16.2**: Cost management through token usage monitoring and cost estimation
- **Requirement 4.1**: Support for hybrid AI decision tracking
- **Requirement 4.4**: Model selection statistics and analysis

## Future Enhancements

- Real-time performance dashboard in side panel
- Automated performance alerts and recommendations
- Historical trend analysis and predictions
- Integration with budget management system
- Performance regression detection
- A/B testing support for model selection strategies
- Export to external analytics platforms
