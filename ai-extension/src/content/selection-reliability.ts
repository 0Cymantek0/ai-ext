/**
 * Selection Capture Reliability Module
 * Provides DOM stability checks, retry logic, and error recovery for selection capture
 * Requirements: 2.1, 2.2, 2.3, 15.1, 17.1, 17.2
 */

export interface DOMStabilityCheck {
  isStable: boolean;
  mutationCount: number;
  checkDuration: number;
  recommendation: "proceed" | "retry" | "abort";
}

export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export interface PerformanceMetrics {
  startTime: number;
  endTime: number;
  duration: number;
  textLength: number;
  throughput: number; // chars per ms
  warnings: string[];
}

export interface SelectionValidation {
  isValid: boolean;
  isEmpty: boolean;
  isDetached: boolean;
  isCrossFrame: boolean;
  errors: string[];
  canRetry: boolean;
}

export interface RecoveryStrategy {
  type: "retry" | "fallback" | "user-prompt" | "abort";
  message: string;
  action?: () => Promise<any>;
}

/**
 * DOM Stability Monitor
 * Detects rapidly changing content and recommends capture timing
 */
export class DOMStabilityMonitor {
  private mutationObserver: MutationObserver | null = null;
  private mutationCount = 0;
  private isMonitoring = false;

  /**
   * Check if DOM is stable enough for capture
   */
  async checkStability(
    element: HTMLElement | Document = document,
    duration: number = 500,
  ): Promise<DOMStabilityCheck> {
    const startTime = performance.now();
    this.mutationCount = 0;
    this.isMonitoring = true;

    return new Promise((resolve) => {
      // Set up mutation observer
      this.mutationObserver = new MutationObserver((mutations) => {
        this.mutationCount += mutations.length;
      });

      const target = element instanceof Document ? document.body : element;

      this.mutationObserver.observe(target, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
      });

      // Wait for specified duration
      setTimeout(() => {
        this.stopMonitoring();
        const checkDuration = performance.now() - startTime;

        // Determine stability
        const mutationsPerSecond = (this.mutationCount / checkDuration) * 1000;
        let recommendation: "proceed" | "retry" | "abort";

        if (mutationsPerSecond < 5) {
          recommendation = "proceed";
        } else if (mutationsPerSecond < 20) {
          recommendation = "retry";
        } else {
          recommendation = "abort";
        }

        resolve({
          isStable: mutationsPerSecond < 5,
          mutationCount: this.mutationCount,
          checkDuration,
          recommendation,
        });
      }, duration);
    });
  }

  /**
   * Stop monitoring
   */
  private stopMonitoring(): void {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
    this.isMonitoring = false;
  }

  /**
   * Check if element is being actively mutated
   */
  isElementMutating(
    element: HTMLElement,
    threshold: number = 100,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      let mutationCount = 0;
      const observer = new MutationObserver(() => {
        mutationCount++;
      });

      observer.observe(element, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
      });

      setTimeout(() => {
        observer.disconnect();
        resolve(mutationCount > threshold);
      }, 100);
    });
  }
}

/**
 * Retry Manager
 * Handles retry logic with exponential backoff
 */
export class RetryManager {
  private defaultConfig: RetryConfig = {
    maxRetries: 3,
    initialDelay: 100,
    maxDelay: 2000,
    backoffMultiplier: 2,
  };

  /**
   * Execute operation with retry logic
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {},
  ): Promise<T> {
    const finalConfig = { ...this.defaultConfig, ...config };
    let lastError: Error | null = null;
    let delay = finalConfig.initialDelay;

    for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt < finalConfig.maxRetries) {
          console.warn(
            `[RetryManager] Attempt ${attempt + 1} failed, retrying in ${delay}ms`,
            error,
          );
          await this.sleep(delay);
          delay = Math.min(
            delay * finalConfig.backoffMultiplier,
            finalConfig.maxDelay,
          );
        }
      }
    }

    throw new Error(
      `Operation failed after ${finalConfig.maxRetries + 1} attempts: ${lastError?.message}`,
    );
  }

  /**
   * Sleep for specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Calculate next retry delay
   */
  calculateDelay(attempt: number, config: Partial<RetryConfig> = {}): number {
    const finalConfig = { ...this.defaultConfig, ...config };
    const delay =
      finalConfig.initialDelay *
      Math.pow(finalConfig.backoffMultiplier, attempt);
    return Math.min(delay, finalConfig.maxDelay);
  }
}

/**
 * Selection Validator
 * Validates selections and detects edge cases
 */
export class SelectionValidator {
  /**
   * Validate selection for capture
   */
  validate(selection: Selection | null): SelectionValidation {
    const errors: string[] = [];
    let isEmpty = false;
    let isDetached = false;
    let isCrossFrame = false;

    // Check if selection exists
    if (!selection || selection.rangeCount === 0) {
      errors.push("No selection found");
      isEmpty = true;
      return {
        isValid: false,
        isEmpty,
        isDetached,
        isCrossFrame,
        errors,
        canRetry: false,
      };
    }

    // Check if selection is empty
    const text = selection.toString().trim();
    if (text.length === 0) {
      errors.push("Selection is empty");
      isEmpty = true;
    }

    // Check for detached elements
    try {
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;

      if (!document.contains(container)) {
        errors.push("Selection contains detached elements");
        isDetached = true;
      }

      // Check if container is still in DOM
      if (container.nodeType === Node.ELEMENT_NODE) {
        const element = container as HTMLElement;
        if (!element.isConnected) {
          errors.push("Selection element is not connected to DOM");
          isDetached = true;
        }
      }
    } catch (error) {
      errors.push("Failed to access selection range");
      isDetached = true;
    }

    // Check for cross-frame selections
    try {
      const range = selection.getRangeAt(0);
      const startContainer = range.startContainer;
      const endContainer = range.endContainer;

      // Check if containers are in different documents
      if (startContainer.ownerDocument !== endContainer.ownerDocument) {
        errors.push("Selection spans multiple frames");
        isCrossFrame = true;
      }
    } catch (error) {
      errors.push("Failed to validate cross-frame selection");
      isCrossFrame = true;
    }

    const isValid = errors.length === 0;
    const canRetry = !isEmpty && !isCrossFrame; // Can retry if not empty or cross-frame

    return {
      isValid,
      isEmpty,
      isDetached,
      isCrossFrame,
      errors,
      canRetry,
    };
  }

  /**
   * Validate element for capture
   */
  validateElement(element: HTMLElement | null): SelectionValidation {
    const errors: string[] = [];
    let isEmpty = false;
    let isDetached = false;
    const isCrossFrame = false;

    if (!element) {
      errors.push("Element is null");
      isEmpty = true;
      return {
        isValid: false,
        isEmpty,
        isDetached,
        isCrossFrame,
        errors,
        canRetry: false,
      };
    }

    // Check if element is connected
    if (!element.isConnected) {
      errors.push("Element is not connected to DOM");
      isDetached = true;
    }

    // Check if element is in document
    if (!document.contains(element)) {
      errors.push("Element is not in document");
      isDetached = true;
    }

    // Check if element has content
    const text = element.textContent?.trim() || "";
    if (text.length === 0) {
      errors.push("Element has no text content");
      isEmpty = true;
    }

    const isValid = errors.length === 0;
    const canRetry = !isEmpty; // Can retry if not empty

    return {
      isValid,
      isEmpty,
      isDetached,
      isCrossFrame,
      errors,
      canRetry,
    };
  }
}

/**
 * Performance Monitor
 * Tracks and optimizes performance for large selections
 */
export class PerformanceMonitor {
  private readonly LARGE_SELECTION_THRESHOLD = 10000; // 10KB
  private readonly VERY_LARGE_SELECTION_THRESHOLD = 100000; // 100KB

  /**
   * Monitor selection capture performance
   */
  async monitorCapture<T>(
    operation: () => Promise<T>,
    textLength: number,
  ): Promise<{ result: T; metrics: PerformanceMetrics }> {
    const startTime = performance.now();
    const warnings: string[] = [];

    // Add warnings for large selections
    if (textLength > this.VERY_LARGE_SELECTION_THRESHOLD) {
      warnings.push("Very large selection (>100KB) - may impact performance");
    } else if (textLength > this.LARGE_SELECTION_THRESHOLD) {
      warnings.push("Large selection (>10KB) - processing may take longer");
    }

    try {
      const result = await operation();
      const endTime = performance.now();
      const duration = endTime - startTime;
      const throughput = textLength / duration;

      // Add performance warnings
      if (duration > 1000) {
        warnings.push(
          `Capture took ${Math.round(duration)}ms - consider optimizing`,
        );
      }

      const metrics: PerformanceMetrics = {
        startTime,
        endTime,
        duration,
        textLength,
        throughput,
        warnings,
      };

      return { result, metrics };
    } catch (error) {
      const endTime = performance.now();
      const duration = endTime - startTime;

      warnings.push(`Capture failed after ${Math.round(duration)}ms`);

      throw error;
    }
  }

  /**
   * Optimize large text processing
   */
  optimizeLargeText(text: string, maxLength: number = 50000): string {
    if (text.length <= maxLength) {
      return text;
    }

    console.warn(
      `[PerformanceMonitor] Text truncated from ${text.length} to ${maxLength} characters`,
    );
    return (
      text.substring(0, maxLength) +
      "\n\n[... content truncated for performance ...]"
    );
  }

  /**
   * Check if selection is too large
   */
  isSelectionTooLarge(textLength: number): boolean {
    return textLength > this.VERY_LARGE_SELECTION_THRESHOLD;
  }
}

/**
 * Error Recovery Manager
 * Provides graceful degradation and user-friendly error recovery
 */
export class ErrorRecoveryManager {
  /**
   * Determine recovery strategy for error
   */
  determineRecoveryStrategy(
    error: Error,
    validation: SelectionValidation,
    attemptCount: number,
  ): RecoveryStrategy {
    // Empty selection - prompt user
    if (validation.isEmpty) {
      return {
        type: "user-prompt",
        message: "No text is selected. Please select some text and try again.",
      };
    }

    // Cross-frame selection - not supported
    if (validation.isCrossFrame) {
      return {
        type: "abort",
        message:
          "Selections spanning multiple frames are not supported. Please select content within a single frame.",
      };
    }

    // Detached element - retry or fallback
    if (validation.isDetached) {
      if (attemptCount < 2) {
        return {
          type: "retry",
          message: "The selected content has changed. Retrying capture...",
        };
      } else {
        return {
          type: "fallback",
          message:
            "Unable to capture selection. Falling back to basic text extraction.",
          action: async () => {
            // Fallback to window.getSelection()
            const selection = window.getSelection();
            return selection?.toString() || "";
          },
        };
      }
    }

    // Generic error - retry if possible
    if (validation.canRetry && attemptCount < 3) {
      return {
        type: "retry",
        message: `Capture failed: ${error.message}. Retrying...`,
      };
    }

    // Final fallback
    return {
      type: "fallback",
      message:
        "Unable to capture selection with full context. Capturing basic text only.",
      action: async () => {
        const selection = window.getSelection();
        return selection?.toString() || "";
      },
    };
  }

  /**
   * Execute recovery strategy
   */
  async executeRecovery(strategy: RecoveryStrategy): Promise<any> {
    console.info(
      `[ErrorRecovery] Executing ${strategy.type} strategy: ${strategy.message}`,
    );

    switch (strategy.type) {
      case "retry":
        // Caller should handle retry
        throw new Error("RETRY_REQUESTED");

      case "fallback":
        if (strategy.action) {
          return await strategy.action();
        }
        throw new Error("No fallback action provided");

      case "user-prompt":
        // Show user-friendly message
        this.showUserMessage(strategy.message, "warning");
        throw new Error(strategy.message);

      case "abort":
        this.showUserMessage(strategy.message, "error");
        throw new Error(strategy.message);

      default:
        throw new Error("Unknown recovery strategy");
    }
  }

  /**
   * Show user-friendly message
   */
  private showUserMessage(
    message: string,
    type: "info" | "warning" | "error",
  ): void {
    // Create toast notification
    const toast = document.createElement("div");
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      max-width: 400px;
      padding: 16px;
      background: ${type === "error" ? "#fee2e2" : type === "warning" ? "#fef3c7" : "#dbeafe"};
      border: 1px solid ${type === "error" ? "#fca5a5" : type === "warning" ? "#fde68a" : "#93c5fd"};
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 999999;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      color: ${type === "error" ? "#991b1b" : type === "warning" ? "#92400e" : "#1e40af"};
      animation: slideIn 0.3s ease;
    `;

    toast.textContent = message;
    document.body.appendChild(toast);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      toast.style.animation = "slideOut 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  }
}

/**
 * Reliable Selection Capture
 * Combines all reliability features for robust selection capture
 */
export class ReliableSelectionCapture {
  private stabilityMonitor = new DOMStabilityMonitor();
  private retryManager = new RetryManager();
  private validator = new SelectionValidator();
  private performanceMonitor = new PerformanceMonitor();
  private errorRecovery = new ErrorRecoveryManager();

  /**
   * Capture selection with full reliability features
   */
  async captureWithReliability(
    captureOperation: () => Promise<any>,
    options: {
      checkStability?: boolean;
      enableRetry?: boolean;
      monitorPerformance?: boolean;
    } = {},
  ): Promise<any> {
    const {
      checkStability = true,
      enableRetry = true,
      monitorPerformance = true,
    } = options;

    let attemptCount = 0;

    const executeCapture = async (): Promise<any> => {
      attemptCount++;

      // 1. Validate selection
      const selection = window.getSelection();
      const validation = this.validator.validate(selection);

      if (!validation.isValid) {
        const strategy = this.errorRecovery.determineRecoveryStrategy(
          new Error(validation.errors.join(", ")),
          validation,
          attemptCount,
        );

        if (strategy.type === "retry" && enableRetry) {
          throw new Error("RETRY_REQUESTED");
        }

        return await this.errorRecovery.executeRecovery(strategy);
      }

      // 2. Check DOM stability
      if (checkStability) {
        const stability = await this.stabilityMonitor.checkStability(
          document,
          300,
        );

        if (stability.recommendation === "abort") {
          throw new Error("DOM is too unstable for reliable capture");
        }

        if (
          stability.recommendation === "retry" &&
          enableRetry &&
          attemptCount < 2
        ) {
          console.warn("[ReliableCapture] DOM unstable, retrying...");
          await new Promise((resolve) => setTimeout(resolve, 500));
          throw new Error("RETRY_REQUESTED");
        }
      }

      // 3. Execute capture with performance monitoring
      const textLength = selection?.toString().length || 0;

      if (monitorPerformance) {
        const { result, metrics } =
          await this.performanceMonitor.monitorCapture(
            captureOperation,
            textLength,
          );

        if (metrics.warnings.length > 0) {
          console.warn(
            "[ReliableCapture] Performance warnings:",
            metrics.warnings,
          );
        }

        return result;
      } else {
        return await captureOperation();
      }
    };

    // Execute with retry if enabled
    if (enableRetry) {
      return await this.retryManager.executeWithRetry(executeCapture, {
        maxRetries: 3,
        initialDelay: 200,
        maxDelay: 1000,
      });
    } else {
      return await executeCapture();
    }
  }

  /**
   * Validate and capture element
   */
  async captureElementWithReliability(
    element: HTMLElement,
    captureOperation: () => Promise<any>,
    options: {
      checkStability?: boolean;
      enableRetry?: boolean;
    } = {},
  ): Promise<any> {
    const { checkStability = true, enableRetry = true } = options;

    let attemptCount = 0;

    const executeCapture = async (): Promise<any> => {
      attemptCount++;

      // 1. Validate element
      const validation = this.validator.validateElement(element);

      if (!validation.isValid) {
        const strategy = this.errorRecovery.determineRecoveryStrategy(
          new Error(validation.errors.join(", ")),
          validation,
          attemptCount,
        );

        if (strategy.type === "retry" && enableRetry) {
          throw new Error("RETRY_REQUESTED");
        }

        return await this.errorRecovery.executeRecovery(strategy);
      }

      // 2. Check if element is being mutated
      if (checkStability) {
        const isMutating =
          await this.stabilityMonitor.isElementMutating(element);

        if (isMutating && enableRetry && attemptCount < 2) {
          console.warn("[ReliableCapture] Element is mutating, retrying...");
          await new Promise((resolve) => setTimeout(resolve, 300));
          throw new Error("RETRY_REQUESTED");
        }
      }

      // 3. Execute capture
      return await captureOperation();
    };

    // Execute with retry if enabled
    if (enableRetry) {
      return await this.retryManager.executeWithRetry(executeCapture, {
        maxRetries: 2,
        initialDelay: 150,
        maxDelay: 500,
      });
    } else {
      return await executeCapture();
    }
  }
}

// Export singleton instance
export const reliableSelectionCapture = new ReliableSelectionCapture();
