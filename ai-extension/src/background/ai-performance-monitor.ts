/**
 * AI Performance Monitor
 * 
 * Specialized monitoring for AI operations including:
 * - Response time tracking by model and operation
 * - Token usage tracking and cost estimation
 * - Success/failure rate monitoring
 * - Model selection statistics
 * 
 * Requirements: 13.1 (Performance Optimization), 16.2 (Cost Management)
 */

import { logger, performanceMonitor } from './monitoring';

/**
 * AI model types for tracking
 */
export enum AIModel {
  GEMINI_NANO = 'gemini-nano',
  GEMINI_FLASH = 'gemini-flash',
  GEMINI_FLASH_LITE = 'gemini-flash-lite',
  GEMINI_PRO = 'gemini-pro'
}

/**
 * AI operation types
 */
export enum AIOperation {
  SUMMARIZE = 'summarize',
  TRANSLATE = 'translate',
  EMBED = 'embed',
  ALT_TEXT = 'alt-text',
  TRANSCRIBE = 'transcribe',
  ENHANCE = 'enhance',
  ANALYZE = 'analyze',
  GENERATE = 'generate',
  CHAT = 'chat',
  GENERAL = 'general'
}

/**
 * AI operation result
 */
export interface AIOperationResult {
  success: boolean;
  model: AIModel;
  operation: AIOperation;
  responseTime: number;
  tokensUsed: number;
  error?: string | undefined;
  timestamp: number;
}

/**
 * Token usage statistics
 */
export interface TokenUsageStats {
  total: number;
  byModel: Record<AIModel, number>;
  byOperation: Record<AIOperation, number>;
  estimatedCost: number;
}

/**
 * Response time statistics
 */
export interface ResponseTimeStats {
  average: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
  byModel: Record<AIModel, number>;
  byOperation: Record<AIOperation, number>;
}

/**
 * Success rate statistics
 */
export interface SuccessRateStats {
  total: number;
  successful: number;
  failed: number;
  successRate: number;
  byModel: Record<AIModel, { total: number; successful: number; rate: number }>;
  byOperation: Record<AIOperation, { total: number; successful: number; rate: number }>;
}

/**
 * Model selection statistics
 */
export interface ModelSelectionStats {
  totalDecisions: number;
  selections: Record<AIModel, number>;
  selectionRate: Record<AIModel, number>;
  localVsCloud: {
    local: number;
    cloud: number;
    localRate: number;
  };
}

/**
 * Cost estimation rates (per 1M tokens)
 * Based on Google Gemini pricing
 */
const TOKEN_COSTS = {
  [AIModel.GEMINI_NANO]: 0, // Free (on-device)
  [AIModel.GEMINI_FLASH_LITE]: 0.075, // $0.075 per 1M tokens
  [AIModel.GEMINI_FLASH]: 0.15, // $0.15 per 1M tokens
  [AIModel.GEMINI_PRO]: 1.25, // $1.25 per 1M tokens
};

/**
 * AI Performance Monitor class
 */
export class AIPerformanceMonitor {
  private operations: AIOperationResult[] = [];
  private readonly MAX_OPERATIONS = 1000;
  private readonly STORAGE_KEY = 'ai_performance_metrics';

  // Cumulative statistics
  private totalTokens = 0;
  private tokensByModel: Map<AIModel, number> = new Map();
  private tokensByOperation: Map<AIOperation, number> = new Map();
  private modelSelections: Map<AIModel, number> = new Map();

  constructor() {
    this.loadMetrics();
    this.initializeCounters();
  }

  /**
   * Initialize counters for all models and operations
   */
  private initializeCounters(): void {
    // Initialize model counters
    Object.values(AIModel).forEach(model => {
      if (!this.tokensByModel.has(model)) {
        this.tokensByModel.set(model, 0);
      }
      if (!this.modelSelections.has(model)) {
        this.modelSelections.set(model, 0);
      }
    });

    // Initialize operation counters
    Object.values(AIOperation).forEach(operation => {
      if (!this.tokensByOperation.has(operation)) {
        this.tokensByOperation.set(operation, 0);
      }
    });
  }

  /**
   * Record an AI operation
   * Requirement 13.1: Track response times
   * Requirement 16.2: Monitor token usage
   * 
   * @param result Operation result
   */
  recordOperation(result: AIOperationResult): void {
    // Add to operations history
    this.operations.push(result);

    // Trim if exceeding max
    if (this.operations.length > this.MAX_OPERATIONS) {
      this.operations = this.operations.slice(-this.MAX_OPERATIONS);
    }

    // Update cumulative statistics
    this.totalTokens += result.tokensUsed;
    
    const modelTokens = this.tokensByModel.get(result.model) || 0;
    this.tokensByModel.set(result.model, modelTokens + result.tokensUsed);

    const opTokens = this.tokensByOperation.get(result.operation) || 0;
    this.tokensByOperation.set(result.operation, opTokens + result.tokensUsed);

    // Log the operation
    if (result.success) {
      logger.info('AIPerformance', `${result.operation} completed`, {
        model: result.model,
        responseTime: `${result.responseTime.toFixed(2)}ms`,
        tokens: result.tokensUsed,
      });

      // Record metric in performance monitor
      performanceMonitor.recordMetric(
        `ai-${result.operation}`,
        result.responseTime,
        'ms',
        {
          model: result.model,
          tokens: result.tokensUsed,
          success: true,
        }
      );
    } else {
      logger.error('AIPerformance', `${result.operation} failed`, {
        model: result.model,
        error: result.error,
      });

      performanceMonitor.recordMetric(
        `ai-${result.operation}`,
        result.responseTime,
        'ms',
        {
          model: result.model,
          success: false,
          error: result.error,
        }
      );
    }

    // Persist metrics
    this.persistMetrics();
  }

  /**
   * Record model selection decision
   * 
   * @param model Selected model
   * @param reason Reason for selection
   */
  recordModelSelection(model: AIModel, reason: string): void {
    const count = this.modelSelections.get(model) || 0;
    this.modelSelections.set(model, count + 1);

    logger.debug('AIPerformance', 'Model selected', {
      model,
      reason,
      totalSelections: count + 1,
    });

    this.persistMetrics();
  }

  /**
   * Measure an AI operation with automatic recording
   * 
   * @param model AI model used
   * @param operation Operation type
   * @param fn Function to measure
   * @returns Result of the function
   */
  async measureOperation<T>(
    model: AIModel,
    operation: AIOperation,
    fn: () => Promise<T>
  ): Promise<T> {
    const startTime = performance.now();
    let tokensUsed = 0;
    let success = true;
    let error: string | undefined;

    try {
      const result = await fn();
      
      // Extract token usage if result is an AIResponse
      if (result && typeof result === 'object' && 'tokensUsed' in result) {
        tokensUsed = (result as any).tokensUsed || 0;
      }

      return result;
    } catch (err) {
      success = false;
      error = err instanceof Error ? err.message : 'Unknown error';
      throw err;
    } finally {
      const responseTime = performance.now() - startTime;

      // Record the operation
      this.recordOperation({
        success,
        model,
        operation,
        responseTime,
        tokensUsed,
        error,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Get token usage statistics
   * Requirement 16.2: Monitor token usage
   * 
   * @returns Token usage stats
   */
  getTokenUsageStats(): TokenUsageStats {
    const byModel: Record<AIModel, number> = {} as Record<AIModel, number>;
    const byOperation: Record<AIOperation, number> = {} as Record<AIOperation, number>;

    // Convert maps to records
    this.tokensByModel.forEach((tokens, model) => {
      byModel[model] = tokens;
    });

    this.tokensByOperation.forEach((tokens, operation) => {
      byOperation[operation] = tokens;
    });

    // Calculate estimated cost
    const estimatedCost = this.calculateTotalCost();

    return {
      total: this.totalTokens,
      byModel,
      byOperation,
      estimatedCost,
    };
  }

  /**
   * Calculate total cost based on token usage
   * Requirement 16.2: Track costs for budget management
   * 
   * @returns Estimated cost in USD
   */
  private calculateTotalCost(): number {
    let totalCost = 0;

    this.tokensByModel.forEach((tokens, model) => {
      const costPerMillion = TOKEN_COSTS[model] || 0;
      const cost = (tokens / 1_000_000) * costPerMillion;
      totalCost += cost;
    });

    return totalCost;
  }

  /**
   * Get cost breakdown by model
   * 
   * @returns Cost breakdown
   */
  getCostBreakdown(): Record<AIModel, { tokens: number; cost: number }> {
    const breakdown: Record<AIModel, { tokens: number; cost: number }> = {} as any;

    this.tokensByModel.forEach((tokens, model) => {
      const costPerMillion = TOKEN_COSTS[model] || 0;
      const cost = (tokens / 1_000_000) * costPerMillion;
      breakdown[model] = { tokens, cost };
    });

    return breakdown;
  }

  /**
   * Get response time statistics
   * Requirement 13.1: Track response times
   * 
   * @returns Response time stats
   */
  getResponseTimeStats(): ResponseTimeStats {
    if (this.operations.length === 0) {
      return {
        average: 0,
        min: 0,
        max: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        byModel: {} as Record<AIModel, number>,
        byOperation: {} as Record<AIOperation, number>,
      };
    }

    const responseTimes = this.operations.map(op => op.responseTime);
    const sorted = [...responseTimes].sort((a, b) => a - b);

    // Calculate percentiles
    const p50 = this.getPercentile(sorted, 50);
    const p95 = this.getPercentile(sorted, 95);
    const p99 = this.getPercentile(sorted, 99);

    // Calculate by model
    const byModel: Record<AIModel, number> = {} as Record<AIModel, number>;
    Object.values(AIModel).forEach(model => {
      const modelOps = this.operations.filter(op => op.model === model);
      if (modelOps.length > 0) {
        const avg = modelOps.reduce((sum, op) => sum + op.responseTime, 0) / modelOps.length;
        byModel[model] = avg;
      }
    });

    // Calculate by operation
    const byOperation: Record<AIOperation, number> = {} as Record<AIOperation, number>;
    Object.values(AIOperation).forEach(operation => {
      const opOps = this.operations.filter(op => op.operation === operation);
      if (opOps.length > 0) {
        const avg = opOps.reduce((sum, op) => sum + op.responseTime, 0) / opOps.length;
        byOperation[operation] = avg;
      }
    });

    return {
      average: responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length,
      min: Math.min(...responseTimes),
      max: Math.max(...responseTimes),
      p50,
      p95,
      p99,
      byModel,
      byOperation,
    };
  }

  /**
   * Calculate percentile from sorted array
   */
  private getPercentile(sorted: number[], percentile: number): number {
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)] || 0;
  }

  /**
   * Get success rate statistics
   * 
   * @returns Success rate stats
   */
  getSuccessRateStats(): SuccessRateStats {
    const total = this.operations.length;
    const successful = this.operations.filter(op => op.success).length;
    const failed = total - successful;

    // Calculate by model
    const byModel: Record<AIModel, { total: number; successful: number; rate: number }> = {} as any;
    Object.values(AIModel).forEach(model => {
      const modelOps = this.operations.filter(op => op.model === model);
      const modelSuccessful = modelOps.filter(op => op.success).length;
      if (modelOps.length > 0) {
        byModel[model] = {
          total: modelOps.length,
          successful: modelSuccessful,
          rate: (modelSuccessful / modelOps.length) * 100,
        };
      }
    });

    // Calculate by operation
    const byOperation: Record<AIOperation, { total: number; successful: number; rate: number }> = {} as any;
    Object.values(AIOperation).forEach(operation => {
      const opOps = this.operations.filter(op => op.operation === operation);
      const opSuccessful = opOps.filter(op => op.success).length;
      if (opOps.length > 0) {
        byOperation[operation] = {
          total: opOps.length,
          successful: opSuccessful,
          rate: (opSuccessful / opOps.length) * 100,
        };
      }
    });

    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? (successful / total) * 100 : 0,
      byModel,
      byOperation,
    };
  }

  /**
   * Get model selection statistics
   * 
   * @returns Model selection stats
   */
  getModelSelectionStats(): ModelSelectionStats {
    const totalDecisions = Array.from(this.modelSelections.values()).reduce((sum, count) => sum + count, 0);

    const selections: Record<AIModel, number> = {} as Record<AIModel, number>;
    const selectionRate: Record<AIModel, number> = {} as Record<AIModel, number>;

    this.modelSelections.forEach((count, model) => {
      selections[model] = count;
      selectionRate[model] = totalDecisions > 0 ? (count / totalDecisions) * 100 : 0;
    });

    // Calculate local vs cloud
    const local = this.modelSelections.get(AIModel.GEMINI_NANO) || 0;
    const cloud = totalDecisions - local;

    return {
      totalDecisions,
      selections,
      selectionRate,
      localVsCloud: {
        local,
        cloud,
        localRate: totalDecisions > 0 ? (local / totalDecisions) * 100 : 0,
      },
    };
  }

  /**
   * Get comprehensive performance summary
   * 
   * @returns Performance summary
   */
  getSummary(): {
    tokenUsage: TokenUsageStats;
    responseTime: ResponseTimeStats;
    successRate: SuccessRateStats;
    modelSelection: ModelSelectionStats;
  } {
    return {
      tokenUsage: this.getTokenUsageStats(),
      responseTime: this.getResponseTimeStats(),
      successRate: this.getSuccessRateStats(),
      modelSelection: this.getModelSelectionStats(),
    };
  }

  /**
   * Get recent operations
   * 
   * @param limit Number of operations to return
   * @returns Recent operations
   */
  getRecentOperations(limit: number = 10): AIOperationResult[] {
    return this.operations.slice(-limit);
  }

  /**
   * Clear all metrics
   */
  async clearMetrics(): Promise<void> {
    this.operations = [];
    this.totalTokens = 0;
    this.tokensByModel.clear();
    this.tokensByOperation.clear();
    this.modelSelections.clear();
    this.initializeCounters();

    await chrome.storage.local.remove(this.STORAGE_KEY);
    logger.info('AIPerformance', 'Metrics cleared');
  }

  /**
   * Persist metrics to storage
   */
  private async persistMetrics(): Promise<void> {
    try {
      const data = {
        operations: this.operations.slice(-100), // Only persist recent operations
        totalTokens: this.totalTokens,
        tokensByModel: Object.fromEntries(this.tokensByModel),
        tokensByOperation: Object.fromEntries(this.tokensByOperation),
        modelSelections: Object.fromEntries(this.modelSelections),
      };

      await chrome.storage.local.set({
        [this.STORAGE_KEY]: data,
      });
    } catch (error) {
      logger.error('AIPerformance', 'Failed to persist metrics', error);
    }
  }

  /**
   * Load persisted metrics
   */
  private async loadMetrics(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(this.STORAGE_KEY);
      const data = result[this.STORAGE_KEY];

      if (data) {
        this.operations = data.operations || [];
        this.totalTokens = data.totalTokens || 0;
        
        if (data.tokensByModel) {
          this.tokensByModel = new Map(Object.entries(data.tokensByModel) as [AIModel, number][]);
        }
        
        if (data.tokensByOperation) {
          this.tokensByOperation = new Map(Object.entries(data.tokensByOperation) as [AIOperation, number][]);
        }
        
        if (data.modelSelections) {
          this.modelSelections = new Map(Object.entries(data.modelSelections) as [AIModel, number][]);
        }

        logger.info('AIPerformance', 'Metrics loaded', {
          operations: this.operations.length,
          totalTokens: this.totalTokens,
        });
      }
    } catch (error) {
      logger.error('AIPerformance', 'Failed to load metrics', error);
    }
  }

  /**
   * Export metrics as JSON
   * 
   * @returns JSON string of metrics
   */
  exportMetrics(): string {
    return JSON.stringify(
      {
        summary: this.getSummary(),
        recentOperations: this.getRecentOperations(50),
        costBreakdown: this.getCostBreakdown(),
      },
      null,
      2
    );
  }
}

// Export singleton instance
export const aiPerformanceMonitor = new AIPerformanceMonitor();
