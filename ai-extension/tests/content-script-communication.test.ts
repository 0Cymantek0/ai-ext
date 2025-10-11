/**
 * Tests for content script communication
 * Requirements: 2.1, 2.7
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Content Script Communication", () => {
  beforeEach(() => {
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
});
