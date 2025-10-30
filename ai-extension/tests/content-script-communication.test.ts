/**
 * Tests for content script communication
 * Requirements: 2.1, 2.7
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Content Script Communication", () => {
  beforeEach(() => {
    vi.resetModules();
    // Mock chrome.runtime API
    global.chrome = {
      runtime: {
        sendMessage: vi.fn(),
        onMessage: {
          addListener: vi.fn(),
        },
      },
    } as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Message Client", () => {
    it("should generate unique request IDs", async () => {
      const { sendMessage } = await import("../src/shared/message-client.js");

      // Mock successful response
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
        success: true,
        data: { result: "test" },
      });

      const response1 = await sendMessage("CAPTURE_REQUEST", {
        mode: "full-page",
        pocketId: "test",
      });

      const response2 = await sendMessage("CAPTURE_REQUEST", {
        mode: "full-page",
        pocketId: "test",
      });

      expect(response1.success).toBe(true);
      expect(response2.success).toBe(true);

      // Verify sendMessage was called twice with different requestIds
      expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
      const call1 = vi.mocked(chrome.runtime.sendMessage).mock.calls[0][0];
      const call2 = vi.mocked(chrome.runtime.sendMessage).mock.calls[1][0];
      expect(call1.requestId).not.toBe(call2.requestId);
    });

    it("should handle message timeout", async () => {
      const { sendMessage } = await import("../src/shared/message-client.js");

      // Mock delayed response
      vi.mocked(chrome.runtime.sendMessage).mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ success: true }), 100);
          }),
      );

      const response = await sendMessage(
        "CAPTURE_REQUEST",
        { mode: "full-page", pocketId: "test" },
        { timeout: 50 },
      );

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe("SEND_FAILED");
      expect(response.error?.message).toContain("timeout");
    });
  });

  describe("Message Handler", () => {
    it("invokes registered handlers and wraps successful results", async () => {
      const { messageHandler } = await import("../src/shared/message-client.js");
      const payload = { value: 42 };
      const handler = vi.fn().mockResolvedValue({ ok: true });

      messageHandler.on("PING" as any, handler);
      const response = await messageHandler.handleMessage(
        { kind: "PING", payload },
        { tab: { id: 123 } } as chrome.runtime.MessageSender,
      );

      expect(handler).toHaveBeenCalledWith(payload, expect.any(Object));
      expect(response).toEqual({ success: true, data: { ok: true } });

      messageHandler.off("PING" as any);
    });

    it("returns a success envelope when no handler is registered", async () => {
      const { messageHandler } = await import("../src/shared/message-client.js");

      const response = await messageHandler.handleMessage(
        { kind: "UNHANDLED", payload: { test: true } },
        {} as chrome.runtime.MessageSender,
      );

      expect(response).toEqual({ success: true });
    });

    it("captures handler errors and returns structured failure metadata", async () => {
      const { messageHandler } = await import("../src/shared/message-client.js");
      const error = new Error("handler boom");
      const handler = vi.fn().mockRejectedValue(error);

      messageHandler.on("ERROR_TEST" as any, handler);
      const response = await messageHandler.handleMessage(
        { kind: "ERROR_TEST", payload: {} },
        {} as chrome.runtime.MessageSender,
      );

      expect(handler).toHaveBeenCalled();
      expect(response.success).toBe(false);
      expect(response.error?.code).toBe("HANDLER_ERROR");
      expect(response.error?.message).toBe("handler boom");

      messageHandler.off("ERROR_TEST" as any);
    });

    it("bridges chrome.onMessage listeners via getListener", async () => {
      const { messageHandler } = await import("../src/shared/message-client.js");
      const handler = vi.fn().mockResolvedValue("pong");
      const listener = messageHandler.getListener();

      messageHandler.on("PING" as any, handler);

      const sendResponse = vi.fn();
      const keepChannelAlive = listener(
        { kind: "PING", payload: { id: 1 } },
        {} as chrome.runtime.MessageSender,
        sendResponse,
      );

      expect(keepChannelAlive).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(sendResponse).toHaveBeenCalledWith({ success: true, data: "pong" });
      messageHandler.off("PING" as any);
    });

    it("returns structured error when message structure is invalid", async () => {
      const { messageHandler } = await import("../src/shared/message-client.js");

      const response = await messageHandler.handleMessage(
        { invalid: true } as any,
        {} as chrome.runtime.MessageSender,
      );

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe("INVALID_MESSAGE");
    });
  });
});
