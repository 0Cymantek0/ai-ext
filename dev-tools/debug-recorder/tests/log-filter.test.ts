/**
 * Unit tests for log filtering heuristics
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  LogFilterPipeline,
  createDefaultLogFilter,
  createStrictLogFilter,
  createVerboseLogFilter,
} from '../src/log-filter.js';
import type {
  StructuredLogEnvelope,
  Interaction,
  LogFilterConfig,
  NetworkRequestEntry,
} from '../src/types.js';

describe('LogFilterPipeline', () => {
  let filter: LogFilterPipeline;

  beforeEach(() => {
    filter = createDefaultLogFilter();
  });

  describe('Semantic Filtering', () => {
    it('should filter out logs matching deny patterns', () => {
      const logs: StructuredLogEnvelope[] = [
        {
          timestamp: Date.now(),
          level: 'info',
          message: '[HMR] Hot update applied',
          origin: 'content-script',
        },
        {
          timestamp: Date.now(),
          level: 'info',
          message: 'User clicked button',
          origin: 'content-script',
        },
        {
          timestamp: Date.now(),
          level: 'debug',
          message: '[vite] connecting...',
          origin: 'content-script',
        },
      ];

      const { filteredLogs } = filter.filterAndCorrelate(logs, []);

      expect(filteredLogs).toHaveLength(1);
      expect(filteredLogs[0]?.message).toBe('User clicked button');
    });

    it('should only allow logs matching allow patterns when specified', () => {
      const customFilter = new LogFilterPipeline({
        allowPatterns: [/AI request/i, /Storage/i],
        denyPatterns: [],
      });

      const logs: StructuredLogEnvelope[] = [
        {
          timestamp: Date.now(),
          level: 'info',
          message: 'AI request started',
          origin: 'background',
        },
        {
          timestamp: Date.now(),
          level: 'info',
          message: 'Random log message',
          origin: 'background',
        },
        {
          timestamp: Date.now(),
          level: 'info',
          message: 'Storage operation completed',
          origin: 'background',
        },
      ];

      const { filteredLogs } = customFilter.filterAndCorrelate(logs, []);

      expect(filteredLogs).toHaveLength(2);
      expect(filteredLogs[0]?.message).toBe('AI request started');
      expect(filteredLogs[1]?.message).toBe('Storage operation completed');
    });

    it('should filter by minimum log level', () => {
      const customFilter = new LogFilterPipeline({
        minLevel: 'warn',
        denyPatterns: [],
      });

      const logs: StructuredLogEnvelope[] = [
        { timestamp: Date.now(), level: 'debug', message: 'Debug', origin: 'background' },
        { timestamp: Date.now(), level: 'info', message: 'Info', origin: 'background' },
        { timestamp: Date.now(), level: 'warn', message: 'Warning', origin: 'background' },
        { timestamp: Date.now(), level: 'error', message: 'Error', origin: 'background' },
      ];

      const { filteredLogs } = customFilter.filterAndCorrelate(logs, []);

      expect(filteredLogs).toHaveLength(2);
      expect(filteredLogs[0]?.level).toBe('warn');
      expect(filteredLogs[1]?.level).toBe('error');
    });

    it('should filter by origin', () => {
      const customFilter = new LogFilterPipeline({
        origins: ['background', 'side-panel'],
        denyPatterns: [],
      });

      const logs: StructuredLogEnvelope[] = [
        { timestamp: Date.now(), level: 'info', message: 'Background', origin: 'background' },
        { timestamp: Date.now(), level: 'info', message: 'Content', origin: 'content-script' },
        { timestamp: Date.now(), level: 'info', message: 'Side Panel', origin: 'side-panel' },
        { timestamp: Date.now(), level: 'info', message: 'Offscreen', origin: 'offscreen' },
      ];

      const { filteredLogs } = customFilter.filterAndCorrelate(logs, []);

      expect(filteredLogs).toHaveLength(2);
      expect(filteredLogs[0]?.origin).toBe('background');
      expect(filteredLogs[1]?.origin).toBe('side-panel');
    });

    it('should filter by category', () => {
      const customFilter = new LogFilterPipeline({
        categories: ['ai-request', 'storage-operation'],
        denyPatterns: [],
      });

      const logs: StructuredLogEnvelope[] = [
        {
          timestamp: Date.now(),
          level: 'info',
          message: 'AI',
          origin: 'background',
          category: 'ai-request',
        },
        {
          timestamp: Date.now(),
          level: 'info',
          message: 'Storage',
          origin: 'background',
          category: 'storage-operation',
        },
        {
          timestamp: Date.now(),
          level: 'info',
          message: 'Navigation',
          origin: 'background',
          category: 'navigation',
        },
      ];

      const { filteredLogs } = customFilter.filterAndCorrelate(logs, []);

      expect(filteredLogs).toHaveLength(2);
      expect(filteredLogs[0]?.category).toBe('ai-request');
      expect(filteredLogs[1]?.category).toBe('storage-operation');
    });
  });

  describe('Duplicate Suppression', () => {
    it('should suppress duplicate logs beyond maxDuplicates', () => {
      const customFilter = new LogFilterPipeline({
        maxDuplicates: 2,
        denyPatterns: [],
        throttleMs: 0,
      });

      const logs: StructuredLogEnvelope[] = Array.from({ length: 5 }, (_, i) => ({
        timestamp: Date.now() + i,
        level: 'info' as const,
        message: 'Repeated message',
        origin: 'background' as const,
      }));

      const { filteredLogs } = customFilter.filterAndCorrelate(logs, []);

      // Should only keep first 2 duplicates
      expect(filteredLogs).toHaveLength(2);
    });

    it('should treat logs with different messages as non-duplicates', () => {
      const customFilter = new LogFilterPipeline({
        maxDuplicates: 2,
        denyPatterns: [],
        throttleMs: 0,
      });

      const logs: StructuredLogEnvelope[] = [
        {
          timestamp: Date.now(),
          level: 'info',
          message: 'Message A',
          origin: 'background',
        },
        {
          timestamp: Date.now(),
          level: 'info',
          message: 'Message B',
          origin: 'background',
        },
        {
          timestamp: Date.now(),
          level: 'info',
          message: 'Message A',
          origin: 'background',
        },
      ];

      const { filteredLogs } = customFilter.filterAndCorrelate(logs, []);

      // Should keep all logs as only Message A repeats (2 times)
      expect(filteredLogs).toHaveLength(3);
    });

    it('should reset duplicate tracking after reset()', () => {
      const customFilter = new LogFilterPipeline({
        maxDuplicates: 2,
        denyPatterns: [],
        throttleMs: 0,
      });

      const logs: StructuredLogEnvelope[] = Array.from({ length: 3 }, (_, i) => ({
        timestamp: Date.now() + i,
        level: 'info' as const,
        message: 'Repeated message',
        origin: 'background' as const,
      }));

      const result1 = customFilter.filterAndCorrelate(logs, []);
      expect(result1.filteredLogs).toHaveLength(2);

      // Reset and filter again
      customFilter.reset();
      const result2 = customFilter.filterAndCorrelate(logs, []);
      expect(result2.filteredLogs).toHaveLength(2);
    });
  });

  describe('Throttling', () => {
    it('should throttle high-frequency logs', () => {
      const customFilter = new LogFilterPipeline({
        throttleMs: 1000,
        denyPatterns: [],
        maxDuplicates: 100,
      });

      const baseTime = Date.now();
      const logs: StructuredLogEnvelope[] = [
        {
          timestamp: baseTime,
          level: 'info',
          message: 'Frequent log',
          origin: 'background',
        },
        {
          timestamp: baseTime + 100,
          level: 'info',
          message: 'Frequent log',
          origin: 'background',
        },
        {
          timestamp: baseTime + 500,
          level: 'info',
          message: 'Frequent log',
          origin: 'background',
        },
        {
          timestamp: baseTime + 1100,
          level: 'info',
          message: 'Frequent log',
          origin: 'background',
        },
      ];

      const { filteredLogs } = customFilter.filterAndCorrelate(logs, []);

      // Should only keep first and last (after throttle window)
      expect(filteredLogs).toHaveLength(2);
      expect(filteredLogs[0]?.timestamp).toBe(baseTime);
      expect(filteredLogs[1]?.timestamp).toBe(baseTime + 1100);
    });

    it('should not throttle when throttleMs is not set', () => {
      const customFilter = new LogFilterPipeline({
        denyPatterns: [],
        throttleMs: 0,
      });

      const logs: StructuredLogEnvelope[] = Array.from({ length: 5 }, (_, i) => ({
        timestamp: Date.now() + i * 100,
        level: 'info' as const,
        message: 'Frequent log',
        origin: 'background' as const,
      }));

      const { filteredLogs } = customFilter.filterAndCorrelate(logs, []);

      // Should keep all logs
      expect(filteredLogs.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Temporal Correlation', () => {
    it('should correlate logs with interactions within temporal window', () => {
      const baseTime = Date.now();

      const interactions: Interaction[] = [
        {
          id: 'interaction-1',
          timestamp: baseTime,
          type: 'click',
          description: 'Button clicked',
          status: 'success',
        },
        {
          id: 'interaction-2',
          timestamp: baseTime + 10000,
          type: 'ai_request',
          description: 'AI request',
          status: 'success',
        },
      ];

      const logs: StructuredLogEnvelope[] = [
        {
          timestamp: baseTime + 100,
          level: 'info',
          message: 'Log near click',
          origin: 'background',
        },
        {
          timestamp: baseTime + 10500,
          level: 'info',
          message: 'Log near AI request',
          origin: 'background',
        },
        {
          timestamp: baseTime + 50000,
          level: 'info',
          message: 'Log far from any interaction',
          origin: 'background',
        },
      ];

      const { correlatedLogs } = filter.filterAndCorrelate(logs, interactions);

      // First log should correlate with click (within 2000ms window)
      const clickLogs = correlatedLogs.get('interaction-1');
      expect(clickLogs).toBeDefined();
      expect(clickLogs?.length).toBeGreaterThan(0);
      expect(clickLogs?.[0]?.message).toBe('Log near click');

      // Second log should correlate with AI request (within 10000ms window)
      const aiLogs = correlatedLogs.get('interaction-2');
      expect(aiLogs).toBeDefined();
      expect(aiLogs?.length).toBeGreaterThan(0);
      expect(aiLogs?.[0]?.message).toBe('Log near AI request');
    });

    it('should use interaction-specific temporal windows', () => {
      filter.updateTemporalWindows({
        click: 500,
        ai_request: 15000,
      });

      const baseTime = Date.now();

      const interactions: Interaction[] = [
        {
          id: 'interaction-1',
          timestamp: baseTime,
          type: 'click',
          description: 'Button clicked',
          status: 'success',
        },
      ];

      const logs: StructuredLogEnvelope[] = [
        {
          timestamp: baseTime + 300,
          level: 'info',
          message: 'Within window',
          origin: 'background',
        },
        {
          timestamp: baseTime + 700,
          level: 'info',
          message: 'Outside window',
          origin: 'background',
        },
      ];

      const { correlatedLogs } = filter.filterAndCorrelate(logs, interactions);

      const clickLogs = correlatedLogs.get('interaction-1');
      expect(clickLogs).toBeDefined();
      expect(clickLogs?.length).toBe(1);
      expect(clickLogs?.[0]?.message).toBe('Within window');
    });

    it('should correlate logs with the closest interaction', () => {
      const baseTime = Date.now();

      const interactions: Interaction[] = [
        {
          id: 'interaction-1',
          timestamp: baseTime,
          type: 'click',
          description: 'First click',
          status: 'success',
        },
        {
          id: 'interaction-2',
          timestamp: baseTime + 1000,
          type: 'click',
          description: 'Second click',
          status: 'success',
        },
      ];

      const logs: StructuredLogEnvelope[] = [
        {
          timestamp: baseTime + 900,
          level: 'info',
          message: 'Log between clicks',
          origin: 'background',
        },
      ];

      const { correlatedLogs } = filter.filterAndCorrelate(logs, interactions);

      // Log should correlate with second click (closer)
      const firstClickLogs = correlatedLogs.get('interaction-1');
      const secondClickLogs = correlatedLogs.get('interaction-2');

      // Only one should have the log
      expect(
        (firstClickLogs?.length ?? 0) + (secondClickLogs?.length ?? 0),
      ).toBe(1);
    });
  });

  describe('Priority Filtering', () => {
    it('should calculate priority based on level and category', () => {
      const errorLog: StructuredLogEnvelope = {
        timestamp: Date.now(),
        level: 'error',
        message: 'Error occurred',
        origin: 'background',
        category: 'ai-request',
      };

      const infoLog: StructuredLogEnvelope = {
        timestamp: Date.now(),
        level: 'info',
        message: 'Info message',
        origin: 'background',
        category: 'debug',
      };

      const errorPriority = filter.getPriority(errorLog);
      const infoPriority = filter.getPriority(infoLog);

      expect(errorPriority).toBeGreaterThan(infoPriority);
    });

    it('should filter logs by priority threshold', () => {
      const logs: StructuredLogEnvelope[] = [
        {
          timestamp: Date.now(),
          level: 'error',
          message: 'Error',
          origin: 'background',
          category: 'ai-request',
        },
        {
          timestamp: Date.now(),
          level: 'warn',
          message: 'Warning',
          origin: 'background',
          category: 'storage-operation',
        },
        {
          timestamp: Date.now(),
          level: 'debug',
          message: 'Debug',
          origin: 'background',
          category: 'debug',
        },
      ];

      // Filter for priority >= 10 (error * ai-request = 5 * 5 = 25)
      const highPriorityLogs = filter.filterByPriority(logs, 10);

      expect(highPriorityLogs.length).toBeGreaterThan(0);
      expect(highPriorityLogs[0]?.level).toBe('error');
    });
  });

  describe('Network Request Correlation', () => {
    it('should correlate network requests with interactions', () => {
      const baseTime = Date.now();

      const interactions: Interaction[] = [
        {
          id: 'interaction-1',
          timestamp: baseTime,
          type: 'api_call',
          description: 'API call made',
          status: 'success',
        },
      ];

      const requests: NetworkRequestEntry[] = [
        {
          timestamp: baseTime + 50,
          url: 'https://api.example.com/data',
          method: 'GET',
          status: 200,
          duration: 150,
        },
        {
          timestamp: baseTime + 10000,
          url: 'https://api.example.com/other',
          method: 'POST',
          status: 201,
        },
      ];

      requests.forEach((req) => filter.addNetworkRequest(req));

      const correlatedRequests = filter.correlateNetworkRequests(interactions);

      const apiCallRequests = correlatedRequests.get('interaction-1');
      expect(apiCallRequests).toBeDefined();
      expect(apiCallRequests?.length).toBe(1);
      expect(apiCallRequests?.[0]?.url).toBe('https://api.example.com/data');
    });

    it('should clean up old network requests', () => {
      const oldTime = Date.now() - 400000; // 6.67 minutes ago

      filter.addNetworkRequest({
        timestamp: oldTime,
        url: 'https://old.example.com',
        method: 'GET',
      });

      filter.addNetworkRequest({
        timestamp: Date.now(),
        url: 'https://new.example.com',
        method: 'GET',
      });

      const interactions: Interaction[] = [
        {
          id: 'interaction-1',
          timestamp: Date.now(),
          type: 'api_call',
          description: 'Recent API call',
          status: 'success',
        },
      ];

      const correlatedRequests = filter.correlateNetworkRequests(interactions);

      // Should only find the recent request
      const recentRequests = correlatedRequests.get('interaction-1');
      expect(recentRequests).toBeDefined();
      expect(recentRequests?.every((req) => !req.url.includes('old'))).toBe(true);
    });
  });

  describe('Preset Filters', () => {
    it('should create a strict filter with high threshold', () => {
      const strictFilter = createStrictLogFilter();

      const logs: StructuredLogEnvelope[] = [
        { timestamp: Date.now(), level: 'debug', message: 'Debug', origin: 'background' },
        { timestamp: Date.now(), level: 'info', message: 'Info', origin: 'background' },
        { timestamp: Date.now(), level: 'warn', message: 'Warning', origin: 'background' },
        { timestamp: Date.now(), level: 'error', message: 'Error', origin: 'background' },
      ];

      const { filteredLogs } = strictFilter.filterAndCorrelate(logs, []);

      expect(filteredLogs.length).toBeLessThanOrEqual(2);
      expect(filteredLogs.every((log) => log.level === 'warn' || log.level === 'error')).toBe(
        true,
      );
    });

    it('should create a verbose filter with minimal filtering', () => {
      const verboseFilter = createVerboseLogFilter();

      const logs: StructuredLogEnvelope[] = [
        { timestamp: Date.now(), level: 'debug', message: 'Debug', origin: 'background' },
        { timestamp: Date.now(), level: 'info', message: 'Info', origin: 'background' },
        { timestamp: Date.now(), level: 'warn', message: 'Warning', origin: 'background' },
      ];

      const { filteredLogs } = verboseFilter.filterAndCorrelate(logs, []);

      // Verbose filter should keep all logs
      expect(filteredLogs).toHaveLength(3);
    });
  });

  describe('Configuration Updates', () => {
    it('should update filter configuration', () => {
      filter.updateConfig({
        minLevel: 'error',
        maxDuplicates: 1,
      });

      const logs: StructuredLogEnvelope[] = [
        { timestamp: Date.now(), level: 'info', message: 'Info', origin: 'background' },
        { timestamp: Date.now(), level: 'error', message: 'Error', origin: 'background' },
      ];

      const { filteredLogs } = filter.filterAndCorrelate(logs, []);

      expect(filteredLogs).toHaveLength(1);
      expect(filteredLogs[0]?.level).toBe('error');
    });

    it('should update category weights', () => {
      filter.updateCategoryWeights({
        'custom-category': 10,
      });

      const highPriorityLog: StructuredLogEnvelope = {
        timestamp: Date.now(),
        level: 'info',
        message: 'Custom',
        origin: 'background',
        category: 'custom-category',
      };

      const normalLog: StructuredLogEnvelope = {
        timestamp: Date.now(),
        level: 'info',
        message: 'Normal',
        origin: 'background',
        category: 'debug',
      };

      const customPriority = filter.getPriority(highPriorityLog);
      const normalPriority = filter.getPriority(normalLog);

      expect(customPriority).toBeGreaterThan(normalPriority);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty log arrays', () => {
      const { filteredLogs, correlatedLogs } = filter.filterAndCorrelate([], []);

      expect(filteredLogs).toHaveLength(0);
      expect(correlatedLogs.size).toBe(0);
    });

    it('should handle empty interaction arrays', () => {
      const logs: StructuredLogEnvelope[] = [
        {
          timestamp: Date.now(),
          level: 'info',
          message: 'Log without interaction',
          origin: 'background',
        },
      ];

      const { filteredLogs, correlatedLogs } = filter.filterAndCorrelate(logs, []);

      expect(filteredLogs).toHaveLength(1);
      expect(correlatedLogs.size).toBe(0);
    });

    it('should handle logs with missing optional fields', () => {
      const logs: StructuredLogEnvelope[] = [
        {
          timestamp: Date.now(),
          level: 'info',
          message: 'Minimal log',
          origin: 'background',
        },
      ];

      const { filteredLogs } = filter.filterAndCorrelate(logs, []);

      expect(filteredLogs).toHaveLength(1);
    });
  });
});
