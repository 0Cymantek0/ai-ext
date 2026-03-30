/**
 * Gemini Nano Client
 * Handles all interactions with Chrome's built-in AI APIs
 */

export class GeminiNanoClient {
  private promptSession: any = null;
  private summarizerSession: any = null;
  private rewriterSession: any = null;
  private isAvailable = false;

  async initialize(): Promise<boolean> {
    try {
      // Check if Prompt API is available
      if (!("LanguageModel" in globalThis)) {
        console.error(
          "Chrome Prompt API not available. Enable it in chrome://flags/#prompt-api-for-gemini-nano",
        );
        return false;
      }

      // Check Prompt API availability
      const availability = await LanguageModel.availability();
      console.log("[Zork] Prompt API availability:", availability);
      console.log("[Zork] Availability type:", typeof availability);

      // Handle both string and object responses
      const availabilityStatus =
        typeof availability === "string"
          ? availability
          : (availability as any)?.available;

      console.log("[Zork] Availability status:", availabilityStatus);

      if (
        availabilityStatus === "readily" ||
        availabilityStatus === "available"
      ) {
        // Get model parameters
        const params = await LanguageModel.params();
        console.log("[Zork] Model params:", params);

        // Create session with system prompt using initialPrompts
        // Following the same pattern as ai-manager.ts
        const options: any = {
          topK: params.defaultTopK,
          temperature: params.defaultTemperature,
          initialPrompts: [
            {
              role: "system",
              content: this.getSystemPrompt(),
            },
          ],
        };

        console.log("[Zork] Creating session with options:", options);
        this.promptSession = await LanguageModel.create(options);

        if (!this.promptSession) {
          console.error(
            "[Zork] Failed to create Prompt API session - session is null",
          );
          return false;
        }

        this.isAvailable = true;
        console.log("[Zork] Gemini Nano Prompt API initialized successfully");
        console.log("[Zork] Session:", this.promptSession);
      } else if (availabilityStatus === "after-download") {
        console.warn("[Zork] Gemini Nano model needs to be downloaded first");
        return false;
      } else {
        console.error(
          "[Zork] Gemini Nano is not available on this device. Status:",
          availabilityStatus,
        );
        return false;
      }

      // Try to initialize other APIs (optional)
      const ai = (window as any).ai;

      // Initialize Summarizer API (if available)
      if (ai?.summarizer) {
        try {
          const summarizerCapabilities = await ai.summarizer.capabilities();
          if (summarizerCapabilities.available === "readily") {
            this.summarizerSession = await ai.summarizer.create();
            console.log("Summarizer API initialized");
          }
        } catch (error) {
          console.log("Summarizer API not available:", error);
        }
      }

      // Initialize Rewriter API (if available)
      if (ai?.rewriter) {
        try {
          const rewriterCapabilities = await ai.rewriter.capabilities();
          if (rewriterCapabilities.available === "readily") {
            this.rewriterSession = await ai.rewriter.create();
            console.log("Rewriter API initialized");
          }
        } catch (error) {
          console.log("Rewriter API not available:", error);
        }
      }

      return this.isAvailable;
    } catch (error) {
      console.error("Failed to initialize Gemini Nano:", error);
      return false;
    }
  }

  private getSystemPrompt(): string {
    return `You are the Dungeon Master for ZORK: INFINITE EDITION, a text adventure game.
Your role is to create engaging, witty, and mysterious content in the style of the classic Zork game.

Key characteristics:
- Be sarcastic and humorous when appropriate
- Create vivid, atmospheric descriptions
- Maintain logical consistency in the world
- Reward creative player solutions
- Generate challenging but fair puzzles
- Create memorable NPCs with distinct personalities

IMPORTANT: When asked for JSON, respond with ONLY the raw JSON object, no markdown formatting, no code blocks, no backticks.`;
  }

  private extractJSON(response: string): string {
    // Remove markdown code blocks if present
    let cleaned = response.trim();

    // Remove ```json and ``` markers
    cleaned = cleaned.replace(/^```json\s*/i, "");
    cleaned = cleaned.replace(/^```\s*/, "");
    cleaned = cleaned.replace(/\s*```$/, "");

    return cleaned.trim();
  }

  async generateLocation(context: any): Promise<any> {
    if (!this.promptSession) {
      throw new Error("Prompt API not available");
    }

    const prompt = `Generate a new location for the player.

Context:
- Previous location: ${context.previousLocation || "Starting area"}
- Direction moved: ${context.direction}
- World theme: ${context.theme}
- Player level: ${context.playerLevel}
- Locations visited: ${context.visitedCount}

Generate a JSON response with this structure:
{
  "name": "Location name (2-5 words)",
  "description": "Vivid description (2-3 sentences, atmospheric and engaging)",
  "exits": ["north", "south", "east", "west"],
  "items": [{"name": "item name", "description": "item desc", "takeable": true}],
  "npcs": [{"name": "npc name", "description": "npc desc", "personality": "personality"}],
  "atmosphere": "mood/feeling of the location"
}

Make it mysterious, engaging, and Zork-like. Include 2-4 exits, 0-3 items, and 0-1 NPCs.`;

    try {
      const response = await this.promptSession.prompt(prompt);
      const cleaned = this.extractJSON(response);
      return JSON.parse(cleaned);
    } catch (error) {
      console.error("Failed to generate location:", error);
      return this.getFallbackLocation();
    }
  }

  async parseCommand(command: string, gameState: any): Promise<any> {
    if (!this.promptSession) {
      throw new Error("Prompt API not available");
    }

    const prompt = `Parse this player command and determine the action.

Command: "${command}"
Current location: ${gameState.currentLocation}
Inventory: ${gameState.inventory.join(", ") || "empty"}

Respond ONLY with raw JSON (no markdown, no code blocks):
{
  "verb": "action verb (go, take, use, attack, talk, examine, etc.)",
  "object": "primary object or null",
  "target": "secondary object or null",
  "direction": "direction if movement command or null",
  "understood": true/false
}`;

    try {
      const response = await this.promptSession.prompt(prompt);
      const cleaned = this.extractJSON(response);
      return JSON.parse(cleaned);
    } catch (error) {
      console.error("Failed to parse command:", error);
      return { understood: false };
    }
  }

  async generateResponse(action: any, gameState: any): Promise<string> {
    if (!this.promptSession) {
      throw new Error("Prompt API not available");
    }

    const prompt = `Generate a witty, Zork-style response to the player's action.

Action: ${JSON.stringify(action)}
Location: ${gameState.currentLocation}
Context: ${gameState.context || ""}

Respond with a single paragraph (1-3 sentences) that:
- Is humorous and sarcastic when appropriate
- Describes what happened
- Maintains the Zork personality
- Advances the story

Just return the text response, no JSON.`;

    try {
      return await this.promptSession.prompt(prompt);
    } catch (error) {
      console.error("Failed to generate response:", error);
      return "Something mysterious happens, but you're not quite sure what.";
    }
  }

  async generateNPCDialogue(
    npc: any,
    playerInput: string,
    history: string[],
  ): Promise<string> {
    if (!this.promptSession) {
      throw new Error("Prompt API not available");
    }

    const prompt = `You are ${npc.name}, a ${npc.personality} character in ZORK.

Your description: ${npc.description}
Relationship with player: ${npc.relationship > 0 ? "friendly" : npc.relationship < 0 ? "hostile" : "neutral"}
Previous conversation: ${history.slice(-3).join(" | ") || "First meeting"}

Player says: "${playerInput}"

Respond in character (1-3 sentences). Be witty, stay in character, remember past interactions.
Just return the dialogue, no JSON.`;

    try {
      return await this.promptSession.prompt(prompt);
    } catch (error) {
      console.error("Failed to generate NPC dialogue:", error);
      return `${npc.name} looks at you silently.`;
    }
  }

  async summarizeGameState(gameState: any): Promise<string> {
    if (!this.summarizerSession) {
      return "Summary not available";
    }

    const stateText = `Player has visited ${gameState.visitedLocations.length} locations, 
    completed ${gameState.completedPuzzles.length} puzzles, 
    and made ${gameState.moves} moves. 
    Current score: ${gameState.score}. 
    Inventory: ${gameState.inventory.join(", ") || "empty"}.`;

    try {
      return await this.summarizerSession.summarize(stateText);
    } catch (error) {
      console.error("Failed to summarize:", error);
      return stateText;
    }
  }

  async rewriteDescription(text: string): Promise<string> {
    if (!this.rewriterSession) {
      return text;
    }

    try {
      return await this.rewriterSession.rewrite(text);
    } catch (error) {
      console.error("Failed to rewrite:", error);
      return text;
    }
  }

  private getFallbackLocation(): any {
    return {
      name: "Mysterious Chamber",
      description:
        "You find yourself in a dimly lit chamber. The walls are covered in ancient runes that seem to shimmer in the faint light.",
      exits: ["north", "south", "east", "west"],
      items: [],
      npcs: [],
      atmosphere: "mysterious and slightly unsettling",
    };
  }

  isReady(): boolean {
    return this.isAvailable;
  }

  async destroy(): Promise<void> {
    if (this.promptSession) {
      await this.promptSession.destroy();
    }
    if (this.summarizerSession) {
      await this.summarizerSession.destroy();
    }
    if (this.rewriterSession) {
      await this.rewriterSession.destroy();
    }
  }
}
