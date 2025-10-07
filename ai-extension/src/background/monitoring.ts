/**
 * Service Worker Monitoring System
 * Implements logging and performance monitoring
 * Requirements: 13.1, 13.2
 */

/**
 * Chrome-specific Performance Memory API
 */
interface PerformanceMemory {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
}

/**
 * Extended Performance interface with Chrome memory API
 */
interface ChromePerformance extends Performance {
    memory?: PerformanceMemory;
}

/**
 * Log Levels
 */
export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
}

/**
 * Log Entry Structure
 */
export interface LogEntry {
    timestamp: number;
    level: LogLevel;
    category: string;
    message: string;
    data?: any;
    stackTrace?: string | undefined;
}

/**
 * Performance Metric
 */
export interface PerformanceMetric {
    name: string;
    value: number;
    unit: string;
    timestamp: number;
    metadata?: Record<string, any> | undefined;
}

/**
 * Memory Usage Snapshot
 */
export interface MemorySnapshot {
    timestamp: number;
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
    usagePercentage: number;
}

/**
 * Logger Configuration
 */
interface LoggerConfig {
    minLevel: LogLevel;
    maxEntries: number;
    persistLogs: boolean;
    consoleOutput: boolean;
}

/**
 * Logger Class
 * Centralized logging system with persistence and filtering
 */
export class Logger {
    private config: LoggerConfig;
    private logs: LogEntry[] = [];
    private readonly STORAGE_KEY = "monitoring_logs";

    constructor(config: Partial<LoggerConfig> = {}) {
        this.config = {
            minLevel: LogLevel.DEBUG,
            maxEntries: 1000,
            persistLogs: true,
            consoleOutput: true,
            ...config,
        };

        // Load persisted logs
        this.loadLogs();
    }

    /**
     * Log debug message
     */
    debug(category: string, message: string, data?: any): void {
        this.log(LogLevel.DEBUG, category, message, data);
    }

    /**
     * Log info message
     */
    info(category: string, message: string, data?: any): void {
        this.log(LogLevel.INFO, category, message, data);
    }

    /**
     * Log warning message
     */
    warn(category: string, message: string, data?: any): void {
        this.log(LogLevel.WARN, category, message, data);
    }

    /**
     * Log error message
     */
    error(category: string, message: string, error?: any): void {
        const stackTrace = error instanceof Error ? error.stack : undefined;
        this.log(LogLevel.ERROR, category, message, error, stackTrace);
    }

    /**
     * Core logging method
     */
    private log(
        level: LogLevel,
        category: string,
        message: string,
        data?: any,
        stackTrace?: string
    ): void {
        // Check if level meets minimum threshold
        if (level < this.config.minLevel) {
            return;
        }

        const entry: LogEntry = {
            timestamp: Date.now(),
            level,
            category,
            message,
            data,
            stackTrace,
        };

        // Add to in-memory logs
        this.logs.push(entry);

        // Trim logs if exceeding max entries
        if (this.logs.length > this.config.maxEntries) {
            this.logs = this.logs.slice(-this.config.maxEntries);
        }

        // Console output
        if (this.config.consoleOutput) {
            this.outputToConsole(entry);
        }

        // Persist logs
        if (this.config.persistLogs) {
            this.persistLogs();
        }
    }

    /**
     * Output log entry to console
     */
    private outputToConsole(entry: LogEntry): void {
        const timestamp = new Date(entry.timestamp).toISOString();
        const prefix = `[${timestamp}] [${LogLevel[entry.level]}] [${entry.category}]`;

        switch (entry.level) {
            case LogLevel.DEBUG:
                console.debug(prefix, entry.message, entry.data || "");
                break;
            case LogLevel.INFO:
                console.info(prefix, entry.message, entry.data || "");
                break;
            case LogLevel.WARN:
                console.warn(prefix, entry.message, entry.data || "");
                break;
            case LogLevel.ERROR:
                console.error(prefix, entry.message, entry.data || "");
                if (entry.stackTrace) {
                    console.error("Stack trace:", entry.stackTrace);
                }
                break;
        }
    }

    /**
     * Persist logs to storage
     */
    private async persistLogs(): Promise<void> {
        try {
            // Only persist recent logs to avoid storage bloat
            const recentLogs = this.logs.slice(-100);
            await chrome.storage.local.set({
                [this.STORAGE_KEY]: recentLogs,
            });
        } catch (error) {
            console.error("[Logger] Failed to persist logs", error);
        }
    }

    /**
     * Load persisted logs
     */
    private async loadLogs(): Promise<void> {
        try {
            const result = await chrome.storage.local.get(this.STORAGE_KEY);
            if (result[this.STORAGE_KEY]) {
                this.logs = result[this.STORAGE_KEY];
            }
        } catch (error) {
            console.error("[Logger] Failed to load logs", error);
        }
    }

    /**
     * Get logs filtered by level and category
     */
    getLogs(
        minLevel?: LogLevel,
        category?: string,
        limit?: number
    ): LogEntry[] {
        let filtered = this.logs;

        if (minLevel !== undefined) {
            filtered = filtered.filter((log) => log.level >= minLevel);
        }

        if (category) {
            filtered = filtered.filter((log) => log.category === category);
        }

        if (limit) {
            filtered = filtered.slice(-limit);
        }

        return filtered;
    }

    /**
     * Clear all logs
     */
    async clearLogs(): Promise<void> {
        this.logs = [];
        await chrome.storage.local.remove(this.STORAGE_KEY);
    }

    /**
     * Export logs as JSON
     */
    exportLogs(): string {
        return JSON.stringify(this.logs, null, 2);
    }
}

/**
 * Performance Monitor
 * Tracks performance metrics and resource usage
 */
export class PerformanceMonitor {
    private metrics: PerformanceMetric[] = [];
    private memorySnapshots: MemorySnapshot[] = [];
    private readonly MAX_METRICS = 500;
    private readonly MAX_SNAPSHOTS = 100;
    private readonly STORAGE_KEY = "monitoring_metrics";
    private readonly MEMORY_THRESHOLD = 80 * 1024 * 1024; // 80MB (Requirement 13.9)
    private logger: Logger;
    private monitoringInterval: number | null = null;

    constructor(logger: Logger) {
        this.logger = logger;
        this.loadMetrics();
    }

    /**
     * Start continuous monitoring
     */
    startMonitoring(intervalMs: number = 30000): void {
        if (this.monitoringInterval) {
            this.stopMonitoring();
        }

        this.logger.info("PerformanceMonitor", "Starting continuous monitoring", {
            intervalMs,
        });

        // Initial snapshot
        this.captureMemorySnapshot();

        // Set up interval
        this.monitoringInterval = setInterval(() => {
            this.captureMemorySnapshot();
            this.checkMemoryThreshold();
        }, intervalMs) as unknown as number;
    }

    /**
     * Stop continuous monitoring
     */
    stopMonitoring(): void {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
            this.logger.info("PerformanceMonitor", "Stopped continuous monitoring");
        }
    }

    /**
     * Record a performance metric
     */
    recordMetric(
        name: string,
        value: number,
        unit: string,
        metadata?: Record<string, any>
    ): void {
        const metric: PerformanceMetric = {
            name,
            value,
            unit,
            timestamp: Date.now(),
            metadata,
        };

        this.metrics.push(metric);

        // Trim metrics if exceeding max
        if (this.metrics.length > this.MAX_METRICS) {
            this.metrics = this.metrics.slice(-this.MAX_METRICS);
        }

        this.logger.debug("PerformanceMonitor", `Metric recorded: ${name}`, {
            value,
            unit,
            metadata,
        });

        // Persist metrics periodically
        this.persistMetrics();
    }

    /**
     * Measure execution time of a function
     */
    async measureAsync<T>(
        name: string,
        fn: () => Promise<T>,
        metadata?: Record<string, any>
    ): Promise<T> {
        const startTime = performance.now();

        try {
            const result = await fn();
            const duration = performance.now() - startTime;

            this.recordMetric(name, duration, "ms", {
                ...metadata,
                success: true,
            });

            return result;
        } catch (error) {
            const duration = performance.now() - startTime;

            this.recordMetric(name, duration, "ms", {
                ...metadata,
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            });

            throw error;
        }
    }

    /**
     * Measure execution time of a synchronous function
     */
    measure<T>(
        name: string,
        fn: () => T,
        metadata?: Record<string, any>
    ): T {
        const startTime = performance.now();

        try {
            const result = fn();
            const duration = performance.now() - startTime;

            this.recordMetric(name, duration, "ms", {
                ...metadata,
                success: true,
            });

            return result;
        } catch (error) {
            const duration = performance.now() - startTime;

            this.recordMetric(name, duration, "ms", {
                ...metadata,
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            });

            throw error;
        }
    }

    /**
     * Capture memory usage snapshot
     */
    captureMemorySnapshot(): MemorySnapshot | null {
        // Check if performance.memory is available (Chrome only)
        const chromePerf = performance as ChromePerformance;
        if (!chromePerf.memory) {
            this.logger.warn(
                "PerformanceMonitor",
                "performance.memory not available"
            );
            return null;
        }

        const snapshot: MemorySnapshot = {
            timestamp: Date.now(),
            usedJSHeapSize: chromePerf.memory.usedJSHeapSize,
            totalJSHeapSize: chromePerf.memory.totalJSHeapSize,
            jsHeapSizeLimit: chromePerf.memory.jsHeapSizeLimit,
            usagePercentage:
                (chromePerf.memory.usedJSHeapSize / chromePerf.memory.jsHeapSizeLimit) *
                100,
        };

        this.memorySnapshots.push(snapshot);

        // Trim snapshots if exceeding max
        if (this.memorySnapshots.length > this.MAX_SNAPSHOTS) {
            this.memorySnapshots = this.memorySnapshots.slice(-this.MAX_SNAPSHOTS);
        }

        this.logger.debug("PerformanceMonitor", "Memory snapshot captured", {
            usedMB: (snapshot.usedJSHeapSize / 1024 / 1024).toFixed(2),
            usagePercentage: snapshot.usagePercentage.toFixed(2),
        });

        return snapshot;
    }

    /**
     * Check if memory usage exceeds threshold (Requirement 13.9)
     */
    private checkMemoryThreshold(): void {
        const chromePerf = performance as ChromePerformance;
        if (!chromePerf.memory) return;

        const usedMemory = chromePerf.memory.usedJSHeapSize;

        if (usedMemory > this.MEMORY_THRESHOLD) {
            this.logger.warn(
                "PerformanceMonitor",
                "Memory usage exceeds threshold",
                {
                    usedMB: (usedMemory / 1024 / 1024).toFixed(2),
                    thresholdMB: (this.MEMORY_THRESHOLD / 1024 / 1024).toFixed(2),
                }
            );

            // Trigger cleanup event
            this.triggerCleanup();
        }
    }

    /**
     * Trigger cleanup when memory threshold is exceeded
     */
    private triggerCleanup(): void {
        this.logger.info("PerformanceMonitor", "Triggering memory cleanup");

        const chromePerf = performance as ChromePerformance;
        // Dispatch custom event for cleanup
        const event = new CustomEvent("memory-cleanup-needed", {
            detail: {
                usedMemory: chromePerf.memory?.usedJSHeapSize,
                threshold: this.MEMORY_THRESHOLD,
            },
        });

        globalThis.dispatchEvent(event);
    }

    /**
     * Get metrics filtered by name
     */
    getMetrics(name?: string, limit?: number): PerformanceMetric[] {
        let filtered = this.metrics;

        if (name) {
            filtered = filtered.filter((metric) => metric.name === name);
        }

        if (limit) {
            filtered = filtered.slice(-limit);
        }

        return filtered;
    }

    /**
     * Get memory snapshots
     */
    getMemorySnapshots(limit?: number): MemorySnapshot[] {
        if (limit) {
            return this.memorySnapshots.slice(-limit);
        }
        return this.memorySnapshots;
    }

    /**
     * Get current memory usage
     */
    getCurrentMemoryUsage(): MemorySnapshot | null {
        return this.captureMemorySnapshot();
    }

    /**
     * Get performance summary
     */
    getSummary(): {
        totalMetrics: number;
        memorySnapshots: number;
        averageMemoryUsage: number;
        peakMemoryUsage: number;
        currentMemoryUsage: number | null;
    } {
        const avgMemory =
            this.memorySnapshots.length > 0
                ? this.memorySnapshots.reduce(
                    (sum, snap) => sum + snap.usedJSHeapSize,
                    0
                ) / this.memorySnapshots.length
                : 0;

        const peakMemory =
            this.memorySnapshots.length > 0
                ? Math.max(...this.memorySnapshots.map((snap) => snap.usedJSHeapSize))
                : 0;

        const chromePerf = performance as ChromePerformance;
        const currentMemory = chromePerf.memory?.usedJSHeapSize || null;

        return {
            totalMetrics: this.metrics.length,
            memorySnapshots: this.memorySnapshots.length,
            averageMemoryUsage: avgMemory,
            peakMemoryUsage: peakMemory,
            currentMemoryUsage: currentMemory,
        };
    }

    /**
     * Persist metrics to storage
     */
    private async persistMetrics(): Promise<void> {
        try {
            // Only persist recent metrics to avoid storage bloat
            const recentMetrics = this.metrics.slice(-100);
            const recentSnapshots = this.memorySnapshots.slice(-50);

            await chrome.storage.local.set({
                [this.STORAGE_KEY]: {
                    metrics: recentMetrics,
                    snapshots: recentSnapshots,
                },
            });
        } catch (error) {
            this.logger.error(
                "PerformanceMonitor",
                "Failed to persist metrics",
                error
            );
        }
    }

    /**
     * Load persisted metrics
     */
    private async loadMetrics(): Promise<void> {
        try {
            const result = await chrome.storage.local.get(this.STORAGE_KEY);
            if (result[this.STORAGE_KEY]) {
                this.metrics = result[this.STORAGE_KEY].metrics || [];
                this.memorySnapshots = result[this.STORAGE_KEY].snapshots || [];
            }
        } catch (error) {
            this.logger.error(
                "PerformanceMonitor",
                "Failed to load metrics",
                error
            );
        }
    }

    /**
     * Clear all metrics
     */
    async clearMetrics(): Promise<void> {
        this.metrics = [];
        this.memorySnapshots = [];
        await chrome.storage.local.remove(this.STORAGE_KEY);
        this.logger.info("PerformanceMonitor", "Metrics cleared");
    }

    /**
     * Export metrics as JSON
     */
    exportMetrics(): string {
        return JSON.stringify(
            {
                metrics: this.metrics,
                snapshots: this.memorySnapshots,
                summary: this.getSummary(),
            },
            null,
            2
        );
    }
}

/**
 * Create singleton instances
 */
export const logger = new Logger({
    minLevel: LogLevel.DEBUG,
    maxEntries: 1000,
    persistLogs: true,
    consoleOutput: true,
});

export const performanceMonitor = new PerformanceMonitor(logger);
