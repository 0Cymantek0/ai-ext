/**
 * Conversation Pocket Attachment Tests
 *
 * Tests for pocket attachment API in conversations
 * Ensures robust handling of attach/detach/get operations
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  indexedDBManager,
  type Conversation,
  type Pocket,
} from "./indexeddb-manager.js";

describe("Conversation Pocket Attachment", () => {
  let testPocketId: string;
  let testConversationId: string;
  let secondPocketId: string;

  beforeEach(async () => {
    // Initialize database
    await indexedDBManager.init();

    // Create test pocket
    testPocketId = await indexedDBManager.createPocket({
      name: "Test Pocket",
      description: "A test pocket for attachment",
      contentIds: [],
      tags: ["test"],
      color: "#FF5733",
    });

    // Create second test pocket
    secondPocketId = await indexedDBManager.createPocket({
      name: "Second Test Pocket",
      description: "Another test pocket",
      contentIds: [],
      tags: ["test"],
      color: "#33FF57",
    });

    // Create test conversation
    testConversationId = await indexedDBManager.saveConversation({
      messages: [
        {
          id: crypto.randomUUID(),
          role: "user",
          content: "Hello",
          timestamp: Date.now(),
          source: "gemini-nano",
        },
      ],
      model: "gemini-nano",
      tokensUsed: 10,
    });
  });

  afterEach(async () => {
    // Cleanup: delete test data
    try {
      await indexedDBManager.deleteConversation(testConversationId);
    } catch (error) {
      // Conversation might already be deleted in some tests
    }

    try {
      await indexedDBManager.deletePocket(testPocketId);
    } catch (error) {
      // Pocket might already be deleted in some tests
    }

    try {
      await indexedDBManager.deletePocket(secondPocketId);
    } catch (error) {
      // Pocket might already be deleted in some tests
    }
  });

  describe("attachPocketToConversation", () => {
    it("should successfully attach a pocket to a conversation", async () => {
      await indexedDBManager.attachPocketToConversation(
        testConversationId,
        testPocketId,
      );

      const conversation =
        await indexedDBManager.getConversation(testConversationId);
      expect(conversation).toBeDefined();
      expect(conversation?.attachedPocketId).toBe(testPocketId);
    });

    it("should update updatedAt timestamp when attaching pocket", async () => {
      const conversationBefore =
        await indexedDBManager.getConversation(testConversationId);
      const timestampBefore = conversationBefore?.updatedAt;

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      await indexedDBManager.attachPocketToConversation(
        testConversationId,
        testPocketId,
      );

      const conversationAfter =
        await indexedDBManager.getConversation(testConversationId);
      const timestampAfter = conversationAfter?.updatedAt;

      expect(timestampAfter).toBeGreaterThan(timestampBefore!);
    });

    it("should replace existing attached pocket when attaching a new one", async () => {
      // Attach first pocket
      await indexedDBManager.attachPocketToConversation(
        testConversationId,
        testPocketId,
      );

      let conversation =
        await indexedDBManager.getConversation(testConversationId);
      expect(conversation?.attachedPocketId).toBe(testPocketId);

      // Attach second pocket (should replace first)
      await indexedDBManager.attachPocketToConversation(
        testConversationId,
        secondPocketId,
      );

      conversation = await indexedDBManager.getConversation(testConversationId);
      expect(conversation?.attachedPocketId).toBe(secondPocketId);
    });

    it("should throw error when conversation does not exist", async () => {
      const nonExistentConversationId = "non-existent-conversation-id";

      await expect(
        indexedDBManager.attachPocketToConversation(
          nonExistentConversationId,
          testPocketId,
        ),
      ).rejects.toThrow(/not found/i);
    });

    it("should throw error when pocket does not exist", async () => {
      const nonExistentPocketId = "non-existent-pocket-id";

      await expect(
        indexedDBManager.attachPocketToConversation(
          testConversationId,
          nonExistentPocketId,
        ),
      ).rejects.toThrow(/not found/i);
    });

    it("should preserve other conversation properties when attaching pocket", async () => {
      const conversationBefore =
        await indexedDBManager.getConversation(testConversationId);

      await indexedDBManager.attachPocketToConversation(
        testConversationId,
        testPocketId,
      );

      const conversationAfter =
        await indexedDBManager.getConversation(testConversationId);

      expect(conversationAfter?.id).toBe(conversationBefore?.id);
      expect(conversationAfter?.messages).toEqual(conversationBefore?.messages);
      expect(conversationAfter?.model).toBe(conversationBefore?.model);
      expect(conversationAfter?.tokensUsed).toBe(
        conversationBefore?.tokensUsed,
      );
      expect(conversationAfter?.createdAt).toBe(conversationBefore?.createdAt);
    });
  });

  describe("detachPocketFromConversation", () => {
    beforeEach(async () => {
      // Attach a pocket before each detach test
      await indexedDBManager.attachPocketToConversation(
        testConversationId,
        testPocketId,
      );
    });

    it("should successfully detach a pocket from a conversation", async () => {
      await indexedDBManager.detachPocketFromConversation(testConversationId);

      const conversation =
        await indexedDBManager.getConversation(testConversationId);
      expect(conversation).toBeDefined();
      expect(conversation?.attachedPocketId).toBeUndefined();
    });

    it("should update updatedAt timestamp when detaching pocket", async () => {
      const conversationBefore =
        await indexedDBManager.getConversation(testConversationId);
      const timestampBefore = conversationBefore?.updatedAt;

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      await indexedDBManager.detachPocketFromConversation(testConversationId);

      const conversationAfter =
        await indexedDBManager.getConversation(testConversationId);
      const timestampAfter = conversationAfter?.updatedAt;

      expect(timestampAfter).toBeGreaterThan(timestampBefore!);
    });

    it("should handle detaching when no pocket is attached (idempotent)", async () => {
      // Detach once
      await indexedDBManager.detachPocketFromConversation(testConversationId);

      // Detach again (should not throw error)
      await expect(
        indexedDBManager.detachPocketFromConversation(testConversationId),
      ).resolves.not.toThrow();

      const conversation =
        await indexedDBManager.getConversation(testConversationId);
      expect(conversation?.attachedPocketId).toBeUndefined();
    });

    it("should throw error when conversation does not exist", async () => {
      const nonExistentConversationId = "non-existent-conversation-id";

      await expect(
        indexedDBManager.detachPocketFromConversation(
          nonExistentConversationId,
        ),
      ).rejects.toThrow(/not found/i);
    });

    it("should preserve other conversation properties when detaching pocket", async () => {
      const conversationBefore =
        await indexedDBManager.getConversation(testConversationId);

      await indexedDBManager.detachPocketFromConversation(testConversationId);

      const conversationAfter =
        await indexedDBManager.getConversation(testConversationId);

      expect(conversationAfter?.id).toBe(conversationBefore?.id);
      expect(conversationAfter?.messages).toEqual(conversationBefore?.messages);
      expect(conversationAfter?.model).toBe(conversationBefore?.model);
      expect(conversationAfter?.tokensUsed).toBe(
        conversationBefore?.tokensUsed,
      );
      expect(conversationAfter?.createdAt).toBe(conversationBefore?.createdAt);
    });
  });

  describe("getAttachedPocket", () => {
    it("should return attached pocket when pocket is attached", async () => {
      await indexedDBManager.attachPocketToConversation(
        testConversationId,
        testPocketId,
      );

      const pocket =
        await indexedDBManager.getAttachedPocket(testConversationId);

      expect(pocket).toBeDefined();
      expect(pocket?.id).toBe(testPocketId);
      expect(pocket?.name).toBe("Test Pocket");
      expect(pocket?.description).toBe("A test pocket for attachment");
    });

    it("should return null when no pocket is attached", async () => {
      const pocket =
        await indexedDBManager.getAttachedPocket(testConversationId);

      expect(pocket).toBeNull();
    });

    it("should return null when conversation does not exist", async () => {
      const nonExistentConversationId = "non-existent-conversation-id";

      const pocket = await indexedDBManager.getAttachedPocket(
        nonExistentConversationId,
      );

      expect(pocket).toBeNull();
    });

    it("should return null when attached pocket has been deleted", async () => {
      // Attach pocket
      await indexedDBManager.attachPocketToConversation(
        testConversationId,
        testPocketId,
      );

      // Delete the pocket
      await indexedDBManager.deletePocket(testPocketId);

      // Try to get attached pocket
      const pocket =
        await indexedDBManager.getAttachedPocket(testConversationId);

      expect(pocket).toBeNull();
    });

    it("should return correct pocket after switching attachments", async () => {
      // Attach first pocket
      await indexedDBManager.attachPocketToConversation(
        testConversationId,
        testPocketId,
      );

      // Attach second pocket
      await indexedDBManager.attachPocketToConversation(
        testConversationId,
        secondPocketId,
      );

      const pocket =
        await indexedDBManager.getAttachedPocket(testConversationId);

      expect(pocket).toBeDefined();
      expect(pocket?.id).toBe(secondPocketId);
      expect(pocket?.name).toBe("Second Test Pocket");
    });
  });

  describe("getAttachedPocketId", () => {
    it("should return attached pocket ID when pocket is attached", async () => {
      await indexedDBManager.attachPocketToConversation(
        testConversationId,
        testPocketId,
      );

      const pocketId =
        await indexedDBManager.getAttachedPocketId(testConversationId);

      expect(pocketId).toBe(testPocketId);
    });

    it("should return null when no pocket is attached", async () => {
      const pocketId =
        await indexedDBManager.getAttachedPocketId(testConversationId);

      expect(pocketId).toBeNull();
    });

    it("should return null when conversation does not exist", async () => {
      const nonExistentConversationId = "non-existent-conversation-id";

      const pocketId = await indexedDBManager.getAttachedPocketId(
        nonExistentConversationId,
      );

      expect(pocketId).toBeNull();
    });

    it("should work correctly (lightweight operation)", async () => {
      await indexedDBManager.attachPocketToConversation(
        testConversationId,
        testPocketId,
      );

      const pocketId =
        await indexedDBManager.getAttachedPocketId(testConversationId);
      const pocket =
        await indexedDBManager.getAttachedPocket(testConversationId);

      // Both should return the same pocket ID
      expect(pocketId).toBe(testPocketId);
      expect(pocket?.id).toBe(testPocketId);

      // getAttachedPocketId is a lightweight operation that only returns the ID
      expect(pocketId).toBeDefined();
    });
  });

  describe("Integration scenarios", () => {
    it("should handle complete attach-detach-reattach cycle", async () => {
      // Attach first pocket
      await indexedDBManager.attachPocketToConversation(
        testConversationId,
        testPocketId,
      );
      let pocket = await indexedDBManager.getAttachedPocket(testConversationId);
      expect(pocket?.id).toBe(testPocketId);

      // Detach
      await indexedDBManager.detachPocketFromConversation(testConversationId);
      pocket = await indexedDBManager.getAttachedPocket(testConversationId);
      expect(pocket).toBeNull();

      // Reattach different pocket
      await indexedDBManager.attachPocketToConversation(
        testConversationId,
        secondPocketId,
      );
      pocket = await indexedDBManager.getAttachedPocket(testConversationId);
      expect(pocket?.id).toBe(secondPocketId);
    });

    it("should maintain attachment across conversation updates", async () => {
      // Attach pocket
      await indexedDBManager.attachPocketToConversation(
        testConversationId,
        testPocketId,
      );

      // Update conversation with new message
      await indexedDBManager.updateConversation(testConversationId, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Hello! How can I help you?",
        timestamp: Date.now(),
        source: "gemini-nano",
      });

      // Check attachment is still there
      const pocket =
        await indexedDBManager.getAttachedPocket(testConversationId);
      expect(pocket?.id).toBe(testPocketId);
    });

    it("should handle multiple conversations with different pocket attachments", async () => {
      // Create second conversation
      const secondConversationId = await indexedDBManager.saveConversation({
        messages: [
          {
            id: crypto.randomUUID(),
            role: "user",
            content: "Another conversation",
            timestamp: Date.now(),
            source: "gemini-nano",
          },
        ],
        model: "gemini-nano",
        tokensUsed: 10,
      });

      try {
        // Attach different pockets to each conversation
        await indexedDBManager.attachPocketToConversation(
          testConversationId,
          testPocketId,
        );
        await indexedDBManager.attachPocketToConversation(
          secondConversationId,
          secondPocketId,
        );

        // Verify each conversation has correct pocket
        const pocket1 =
          await indexedDBManager.getAttachedPocket(testConversationId);
        const pocket2 =
          await indexedDBManager.getAttachedPocket(secondConversationId);

        expect(pocket1?.id).toBe(testPocketId);
        expect(pocket2?.id).toBe(secondPocketId);
      } finally {
        // Cleanup
        await indexedDBManager.deleteConversation(secondConversationId);
      }
    });

    it("should handle conversation deletion with attached pocket", async () => {
      // Attach pocket
      await indexedDBManager.attachPocketToConversation(
        testConversationId,
        testPocketId,
      );

      // Delete conversation
      await indexedDBManager.deleteConversation(testConversationId);

      // Verify conversation is deleted
      const conversation =
        await indexedDBManager.getConversation(testConversationId);
      expect(conversation).toBeNull();

      // Verify pocket still exists (should not be deleted)
      const pocket = await indexedDBManager.getPocket(testPocketId);
      expect(pocket).toBeDefined();
      expect(pocket?.id).toBe(testPocketId);
    });
  });
});
