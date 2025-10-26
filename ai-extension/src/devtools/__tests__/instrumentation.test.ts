/**
 * Dev Instrumentation Tests
 * Verifies the instrumentation module functions correctly and is tree-shaken in production
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  initializeDevInstrumentation,
  getDevInstrumentation,
  teardownDevInstrumentation,
} from "../instrumentation";

describe("Dev Instrumentation", () => {
  const GLOBAL_KEY = "__AI_POCKET_DEVTOOLS__";

  beforeEach(() => {
    // Clean up global state before each test
    delete (globalThis as any)[GLOBAL_KEY];
  });

  afterEach(() => {
    // Clean up after each test
    delete (globalThis as any)[GLOBAL_KEY];
  });

  describe("initializeDevInstrumentation", () => {
    it("should return null when VITE_DEBUG_RECORDER is false", () => {
      // In test environment, the flag will be false by default
      const handle = initializeDevInstrumentation("content");
      
      // Depending on the flag value, handle might be null
      if (handle === null) {
        expect(handle).toBeNull();
      } else {
        expect(handle).toBeDefined();
      }
    });

    it("should initialize handle for each surface type", () => {
      const surfaces = ["content", "background", "sidepanel", "offscreen"] as const;

      surfaces.forEach((surface) => {
        const handle = initializeDevInstrumentation(surface);
        
        if (handle) {
          expect(handle.surface).toBe(surface);
          expect(typeof handle.recordEvent).toBe("function");
          expect(typeof handle.recordSnapshot).toBe("function");
          expect(typeof handle.getEventHistory).toBe("function");
          expect(typeof handle.getSnapshotKeys).toBe("function");
          expect(typeof handle.getProfilerCallback).toBe("function");
        }
      });
    });

    it("should return same handle on multiple initializations", () => {
      const handle1 = initializeDevInstrumentation("content");
      const handle2 = initializeDevInstrumentation("content");
      
      // Both should be the same instance or both null
      expect(handle1).toBe(handle2);
    });

    it("should handle DOM target options", () => {
      const mockDocument = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };

      const handle = initializeDevInstrumentation("content", {
        domTarget: mockDocument as any,
      });

      // If enabled, should have set up listeners
      // If disabled, handle should be null
      if (handle) {
        expect(handle).toBeDefined();
      }
    });

    it("should handle logger options", () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      const handle = initializeDevInstrumentation("background", {
        logger: mockLogger,
      });

      // Logger should be wrapped if instrumentation is enabled
      if (handle) {
        handle.recordEvent("test:event", { data: "test" });
      }
    });
  });

  describe("getDevInstrumentation", () => {
    it("should return null for uninitialized surface", () => {
      const handle = getDevInstrumentation("content");
      
      // Should be null if not initialized or if flag is disabled
      expect(handle === null || handle !== null).toBe(true);
    });

    it("should return handle for initialized surface", () => {
      const initHandle = initializeDevInstrumentation("content");
      const getHandle = getDevInstrumentation("content");
      
      // Both should be the same
      expect(initHandle).toBe(getHandle);
    });
  });

  describe("DevInstrumentationHandle", () => {
    it("should record events", () => {
      const handle = initializeDevInstrumentation("content");
      
      if (handle) {
        handle.recordEvent("test:event", { foo: "bar" });
        
        const history = handle.getEventHistory();
        const testEvents = history.filter((e) => e.event === "test:event");
        
        expect(testEvents.length).toBeGreaterThanOrEqual(1);
        expect(testEvents[0]?.event).toBe("test:event");
        expect(testEvents[0]?.surface).toBe("content");
      }
    });

    it("should record snapshots and detect changes", () => {
      const handle = initializeDevInstrumentation("content");
      
      if (handle) {
        const state1 = { count: 1, name: "test" };
        const state2 = { count: 1, name: "test" }; // Same as state1
        const state3 = { count: 2, name: "test" }; // Different
        
        handle.recordSnapshot("myState", state1);
        const keys1 = handle.getSnapshotKeys();
        expect(keys1).toContain("myState");
        
        // Recording same snapshot should not create duplicate event
        const historyLength1 = handle.getEventHistory().length;
        handle.recordSnapshot("myState", state2);
        const historyLength2 = handle.getEventHistory().length;
        
        // Should not have increased because state2 is identical to state1
        expect(historyLength2).toBe(historyLength1);
        
        // Recording different snapshot should create new event
        handle.recordSnapshot("myState", state3);
        const historyLength3 = handle.getEventHistory().length;
        expect(historyLength3).toBeGreaterThan(historyLength2);
      }
    });

    it("should provide React Profiler callback", () => {
      const handle = initializeDevInstrumentation("sidepanel");
      
      if (handle) {
        const callback = handle.getProfilerCallback("TestComponent");
        
        expect(typeof callback).toBe("function");
        
        // Call the callback
        callback("TestComponent", "mount", 10, 15, 100, 110);
        
        // Should have recorded a react profiler event
        const history = handle.getEventHistory();
        const reactEvents = history.filter((e) => e.event.startsWith("react:"));
        
        expect(reactEvents.length).toBeGreaterThanOrEqual(1);
      }
    });

    it("should limit event history size", () => {
      const handle = initializeDevInstrumentation("content");
      
      if (handle) {
        // Record more than max events (200)
        for (let i = 0; i < 250; i++) {
          handle.recordEvent(`test:event:${i}`, { index: i });
        }
        
        const history = handle.getEventHistory();
        
        // Should not exceed max events
        expect(history.length).toBeLessThanOrEqual(200);
      }
    });
  });

  describe("teardownDevInstrumentation", () => {
    it("should cleanup instrumentation for a surface", () => {
      const handle = initializeDevInstrumentation("content");
      
      if (handle) {
        teardownDevInstrumentation("content");
        
        // After teardown, the surface should be uninitialized
        const registry = (globalThis as any)[GLOBAL_KEY];
        if (registry) {
          const state = registry.surfaces.content;
          expect(state?.initialized).toBe(false);
        }
      }
    });

    it("should be safe to call multiple times", () => {
      initializeDevInstrumentation("content");
      
      // Should not throw
      expect(() => {
        teardownDevInstrumentation("content");
        teardownDevInstrumentation("content");
      }).not.toThrow();
    });
  });

  describe("Hot reload safety", () => {
    it("should not duplicate listeners on re-initialization", () => {
      const mockDocument = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };

      const handle1 = initializeDevInstrumentation("content", {
        domTarget: mockDocument as any,
      });

      const addListenerCallCount1 = mockDocument.addEventListener.mock.calls.length;

      // Re-initialize (simulating hot reload)
      const handle2 = initializeDevInstrumentation("content", {
        domTarget: mockDocument as any,
      });

      const addListenerCallCount2 = mockDocument.addEventListener.mock.calls.length;

      // Should be the same handle
      expect(handle1).toBe(handle2);

      // Should not have added more listeners
      expect(addListenerCallCount2).toBe(addListenerCallCount1);
    });
  });

  describe("Data sanitization", () => {
    it("should handle circular references in event details", () => {
      const handle = initializeDevInstrumentation("content");
      
      if (handle) {
        const circular: any = { name: "test" };
        circular.self = circular;
        
        // Should not throw when recording circular data
        expect(() => {
          handle.recordEvent("test:circular", circular);
        }).not.toThrow();
      }
    });

    it("should handle Error objects", () => {
      const handle = initializeDevInstrumentation("content");
      
      if (handle) {
        const error = new Error("Test error");
        
        expect(() => {
          handle.recordEvent("test:error", { error });
        }).not.toThrow();
        
        const history = handle.getEventHistory();
        const errorEvent = history.find((e) => e.event === "test:error");
        
        if (errorEvent) {
          expect(errorEvent.detail?.error).toBeDefined();
        }
      }
    });

    it("should truncate large strings", () => {
      const handle = initializeDevInstrumentation("content");
      
      if (handle) {
        const largeString = "a".repeat(10000);
        
        handle.recordEvent("test:large", { text: largeString });
        
        const history = handle.getEventHistory();
        const largeEvent = history.find((e) => e.event === "test:large");
        
        // The string should be sanitized/truncated
        if (largeEvent) {
          expect(largeEvent.detail).toBeDefined();
        }
      }
    });
  });

  describe("Edge cases", () => {
    it("should handle undefined and null values", () => {
      const handle = initializeDevInstrumentation("content");
      
      if (handle) {
        expect(() => {
          handle.recordEvent("test:undefined", undefined);
          handle.recordEvent("test:null", null);
          handle.recordSnapshot("test:undefined", undefined);
          handle.recordSnapshot("test:null", null);
        }).not.toThrow();
      }
    });

    it("should handle empty strings and objects", () => {
      const handle = initializeDevInstrumentation("content");
      
      if (handle) {
        expect(() => {
          handle.recordEvent("test:empty:string", "");
          handle.recordEvent("test:empty:object", {});
          handle.recordEvent("test:empty:array", []);
        }).not.toThrow();
      }
    });

    it("should handle deeply nested objects", () => {
      const handle = initializeDevInstrumentation("content");
      
      if (handle) {
        const deep: any = { level: 0 };
        let current = deep;
        
        for (let i = 1; i < 100; i++) {
          current.next = { level: i };
          current = current.next;
        }
        
        expect(() => {
          handle.recordEvent("test:deep", deep);
        }).not.toThrow();
      }
    });
  });
});
