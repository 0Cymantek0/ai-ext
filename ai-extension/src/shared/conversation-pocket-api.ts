/**
 * Conversation Pocket Attachment API
 *
 * Client-side API for attaching/detaching pockets to conversations
 * Used by UI components to interact with the backend
 */

import type {
  ConversationAttachPocketPayload,
  ConversationDetachPocketPayload,
  ConversationGetAttachedPocketPayload,
  ConversationAttachedPocketResult,
} from "./types/index.js";

/**
 * Attach a pocket to a conversation for RAG context retrieval
 *
 * @param conversationId - ID of the conversation
 * @param pocketId - ID of the pocket to attach
 * @returns Result with attached pocket information
 * @throws Error if conversation or pocket not found
 */
export async function attachPocketToConversation(
  conversationId: string,
  pocketId: string,
): Promise<ConversationAttachedPocketResult> {
  const payload: ConversationAttachPocketPayload = {
    conversationId,
    pocketId,
  };

  const response = await chrome.runtime.sendMessage({
    kind: "CONVERSATION_ATTACH_POCKET",
    payload,
  });

  if (!response.success) {
    throw new Error(
      `Failed to attach pocket: ${response.error || "Unknown error"}`,
    );
  }

  return {
    conversationId: response.conversationId,
    attachedPocketId: response.attachedPocketId,
    pocketName: response.pocketName,
    pocketDescription: response.pocketDescription,
  };
}

/**
 * Detach pocket(s) from a conversation
 *
 * @param conversationId - ID of the conversation
 * @param pocketId - Optional: ID of specific pocket to detach, or undefined to detach all
 * @returns Result confirming detachment
 * @throws Error if conversation not found
 */
export async function detachPocketFromConversation(
  conversationId: string,
  pocketId?: string,
): Promise<ConversationAttachedPocketResult> {
  const payload: ConversationDetachPocketPayload = {
    conversationId,
    ...(pocketId && { pocketId }),
  };

  const response = await chrome.runtime.sendMessage({
    kind: "CONVERSATION_DETACH_POCKET",
    payload,
  });

  if (!response.success) {
    throw new Error(
      `Failed to detach pocket: ${response.error || "Unknown error"}`,
    );
  }

  return {
    conversationId: response.conversationId,
    attachedPocketId: null,
    attachedPocketIds: response.attachedPocketIds || [],
  };
}

/**
 * Get all pockets attached to a conversation
 *
 * @param conversationId - ID of the conversation
 * @returns Attached pockets information or empty array if no pockets attached
 */
export async function getAttachedPocket(
  conversationId: string,
): Promise<ConversationAttachedPocketResult> {
  const payload: ConversationGetAttachedPocketPayload = {
    conversationId,
  };

  const response = await chrome.runtime.sendMessage({
    kind: "CONVERSATION_GET_ATTACHED_POCKET",
    payload,
  });

  if (!response.success) {
    throw new Error(
      `Failed to get attached pocket: ${response.error || "Unknown error"}`,
    );
  }

  return {
    conversationId: response.conversationId,
    attachedPocketId: response.attachedPocketId,
    attachedPocketIds: response.attachedPocketIds || [],
    pockets: response.pockets || [],
    pocketName: response.pocketName,
    pocketDescription: response.pocketDescription,
  };
}

/**
 * Check if a conversation has attached pockets
 *
 * @param conversationId - ID of the conversation
 * @returns True if at least one pocket is attached, false otherwise
 */
export async function hasAttachedPocket(
  conversationId: string,
): Promise<boolean> {
  try {
    const result = await getAttachedPocket(conversationId);
    return (
      (result.attachedPocketIds && result.attachedPocketIds.length > 0) ||
      result.attachedPocketId !== null
    );
  } catch (error) {
    console.error("Failed to check attached pocket:", error);
    return false;
  }
}

/**
 * Toggle pocket attachment (attach if not attached, detach if attached)
 *
 * @param conversationId - ID of the conversation
 * @param pocketId - ID of the pocket to attach (required if currently no pocket attached)
 * @returns Result with new attachment state
 */
export async function togglePocketAttachment(
  conversationId: string,
  pocketId?: string,
): Promise<ConversationAttachedPocketResult> {
  const current = await getAttachedPocket(conversationId);

  if (current.attachedPocketId) {
    // Pocket is attached, detach it
    return await detachPocketFromConversation(conversationId);
  } else {
    // No pocket attached, attach one
    if (!pocketId) {
      throw new Error(
        "pocketId is required when no pocket is currently attached",
      );
    }
    return await attachPocketToConversation(conversationId, pocketId);
  }
}
