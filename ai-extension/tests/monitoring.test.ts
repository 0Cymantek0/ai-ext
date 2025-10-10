/**
 * Tests for Service Worker Monitoring System
 * Requirements: 13.1, 13.2
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  Logger,
  LogLevel,
  PerformanceMonitor,
} from "../src/background/monitoring";

// Mock chrome.storage API
const mockStorage = {
  local: {
    get: vi.fn().mockResolvedValue({}),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
};

global.chrome = {
  storage: mockStorage,
} as any;

describe("Logger", () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger({
      minLevel: LogLevel.DEBUG,
      maxEntries: 100,
      persistLogs: false,
      consoleOutput: false,
    });
  });

  it("should create log entries", () => {
    logger.info("TestCategory", "Test message", { data: "test" });
    const logs = logger.getLogs();

    expect(logs.length).toBe(1);
    expect(logs[0].level).toBe(LogLevel.INFO);
    expect(logs[0].category).toBe("TestCategory");
    expect(logs[0].message).toBe("Test message");
  });

  it("should filter logs by level", () => {
    logger.debug("Test", "Debug message");
    logger.info("Test", "Info message");
    logger.warn("Test", "Warn message");
    logger.error("Test", "Error message");

    const errorLogs = logger.getLogs(LogLevel.ERROR);
    expect(errorLogs.length).toBe(1);
    expect(errorLogs[0].level).toBe(LogLevel.ERROR);
  });

  it("should filter logs by category", () => {
    logger.info("Category1", "Message 1");
    logger.info("Category2", "Message 2");
    logger.info("Category1", "Message 3");

    const category1Logs = logger.getLogs(undefined, "Category1");
    expect(category1Logs.length).toBe(2);
  });

  it("should limit log entries", () => {
    for (let i = 0; i < 150; i++) {
      logger.info("Test", `Message ${i}`);
    }

    const logs = logger.getLogs();
    expect(logs.length).toBeLessThanOrEqual(100);
  });

  it("should export logs as JSON", () => {
    logger.info("Test", "Test message");
    const exported = logger.exportLogs();

    expect(exported).toBeTruthy();
    const parsed = JSON.parse(exported);
    expect(Array.isArray(parsed)).toBe(true);
  });
});

describe("PerformanceMonitor", () => {
  let logger: Logger;
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    logger = new Logger({
      minLevel: LogLevel.DEBUG,
      maxEntries: 100,
      persistLogs: false,
      consoleOutput: false,
    });
    monitor = new PerformanceMonitor(logger);
  });

  it("should record metrics", () => {
    monitor.recordMetric("test-metric", 100, "ms");
    const metrics = monitor.getMetrics("test-metric");

    expect(metrics.length).toBe(1);
    expect(metrics[0].name).toBe("test-metric");
    expect(metrics[0].value).toBe(100);
    expect(metrics[0].unit).toBe("ms");
  });

  it("should measure async function execution time", async () => {
    const testFn = async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return "result";
    };

    const result = await monitor.measureAsync("async-test", testFn);

    expect(result).toBe("result");
    const metrics = monitor.getMetrics("async-test");
    expect(metrics.length).toBe(1);
    expect(metrics[0].value).toBeGreaterThan(0);
  });

  it("should measure sync function execution time", () => {
    const testFn = () => {
      let sum = 0;
      for (let i = 0; i < 1000; i++) {
        sum += i;
      }
      return sum;
    };

    const result = monitor.measure("sync-test", testFn);

    expect(result).toBe(499500);
    const metrics = monitor.getMetrics("sync-test");
    expect(metrics.length).toBe(1);
    expect(metrics[0].value).toBeGreaterThan(0);
  });

  it("should handle errors in measured functions", async () => {
    const errorFn = async () => {
      throw new Error("Test error");
    };

    await expect(monitor.measureAsync("error-test", errorFn)).rejects.toThrow(
      "Test error",
    );

    const metrics = monitor.getMetrics("error-test");
    expect(metrics.length).toBe(1);
    expect(metrics[0].metadata?.success).toBe(false);
  });

  it("should get performance summary", () => {
    monitor.recordMetric("metric1", 100, "ms");
    monitor.recordMetric("metric2", 200, "ms");

    const summary = monitor.getSummary();

    expect(summary.totalMetrics).toBe(2);
    expect(summary.memorySnapshots).toBeGreaterThanOrEqual(0);
  });

  it("should export metrics as JSON", () => {
    monitor.recordMetric("test", 100, "ms");
    const exported = monitor.exportMetrics();

    expect(exported).toBeTruthy();
    const parsed = JSON.parse(exported);
    expect(parsed.metrics).toBeDefined();
    expect(parsed.summary).toBeDefined();
  });

  it("should limit stored metrics", () => {
    for (let i = 0; i < 600; i++) {
      monitor.recordMetric("test", i, "count");
    }

    const metrics = monitor.getMetrics();
    expect(metrics.length).toBeLessThanOrEqual(500);
  });
});

describe("Integration Tests", () => {
  it("should integrate logger with performance monitor", async () => {
    const logger = new Logger({
      minLevel: LogLevel.DEBUG,
      maxEntries: 100,
      persistLogs: false,
      consoleOutput: false,
    });

    const monitor = new PerformanceMonitor(logger);

    // Perform some operations
    await monitor.measureAsync("integration-test", async () => {
      logger.info("Test", "Integration test message");
      return "success";
    });

    // Verify both systems recorded data
    const logs = logger.getLogs();
    const metrics = monitor.getMetrics("integration-test");

    expect(logs.length).toBeGreaterThan(0);
    expect(metrics.length).toBe(1);
  });
});
