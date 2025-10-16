/**
 * Conversation Metadata Generator
 * 
 * Generates comprehensive metadata for conversations using Gemini Nano
 * for intelligent semantic search capabilities.
 */

import { AIManager } from "./ai-manager.js";
import { logger } from "./monitoring.js";
import type { Message, ConversationMetadata } from "./indexeddb-manager.js";

export class ConversationMetadataGenerator {
  private aiManager: AIManager;

  constructor(aiManager: AIManager) {
    this.aiManager = aiManager;
  }

  /**
   * Generate metadata for a conversation
   */
  async generateMetadata(messages: Message[]): Promise<ConversationMetadata | null> {
    try {
      // Filter out system messages and combine user/assistant messages
      const conversationText = messages
        .filter((m) => m.role !== "system")
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n\n");

      if (!conversationText.trim()) {
        logger.warn("MetadataGenerator", "No content to generate metadata from");
        return null;
      }

      // Create prompt for metadata generation
      const prompt = `Analyze the following conversation and extract metadata in JSON format.

Conversation:
${conversationText.slice(0, 4000)} ${conversationText.length > 4000 ? "..." : ""}

Generate a JSON object with these fields:
- summary: A concise 1-2 sentence summary of the conversation
- keywords: Array of 5-10 important keywords (lowercase, single words or short phrases)
- topics: Array of 3-5 main topics discussed (e.g., "programming", "data analysis")
- entities: Array of specific entities mentioned (names, technologies, concepts, places)
- mainQuestions: Array of 2-3 main questions the user asked

Respond ONLY with valid JSON, no other text:`;

      // Create a session and use Gemini Nano to generate metadata
      const sessionId = await this.aiManager.createSession({
        temperature: 0.3, // Lower temperature for more consistent output
      });

      const response = await this.aiManager.processPrompt(sessionId, prompt);

      if (!response) {
        logger.error("MetadataGenerator", "No response from AI");
        return null;
      }

      // Parse JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.error("MetadataGenerator", "Could not extract JSON from response", {
          response: response.slice(0, 200),
        });
        return this.generateFallbackMetadata(messages);
      }

      const metadata = JSON.parse(jsonMatch[0]);

      // Validate and normalize metadata
      return {
        summary: metadata.summary || "Conversation",
        keywords: Array.isArray(metadata.keywords)
          ? metadata.keywords.slice(0, 10).map((k: string) => k.toLowerCase())
          : [],
        topics: Array.isArray(metadata.topics) ? metadata.topics.slice(0, 5) : [],
        entities: Array.isArray(metadata.entities) ? metadata.entities.slice(0, 10) : [],
        mainQuestions: Array.isArray(metadata.mainQuestions)
          ? metadata.mainQuestions.slice(0, 3)
          : [],
        generatedAt: Date.now(),
      };
    } catch (error) {
      logger.error("MetadataGenerator", "Failed to generate metadata", { error });
      return this.generateFallbackMetadata(messages);
    }
  }

  /**
   * Generate basic fallback metadata when AI generation fails
   */
  private generateFallbackMetadata(messages: Message[]): ConversationMetadata {
    const userMessages = messages.filter((m) => m.role === "user");
    const firstUserMessage = userMessages[0]?.content || "Conversation";

    // Extract simple keywords from first message
    const words = firstUserMessage
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 5);

    return {
      summary: firstUserMessage.slice(0, 100) + (firstUserMessage.length > 100 ? "..." : ""),
      keywords: words,
      topics: [],
      entities: [],
      mainQuestions: userMessages.slice(0, 2).map((m) => m.content.slice(0, 100)),
      generatedAt: Date.now(),
    };
  }
}
