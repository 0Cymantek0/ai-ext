/**
 * ZORK AI Orchestrator - Master controller for the infinite game engine
 * Coordinates all AI systems to create a seamless, engaging experience
 */

import { GeminiNanoEngine } from "./GeminiNanoEngine";
import { NarrativeDirector } from "./NarrativeDirector";
import { VariationEngine } from "./VariationEngine";
import type { VariationContext } from "./VariationEngine";
import { SuspenseManager } from "./SuspenseManager";
import { MemoryGraph } from "./MemoryGraph";
import type { MemoryNode } from "./MemoryGraph";

export interface GameContext {
  currentLocation: string;
  inventory: string[];
  health: number;
  moveCount: number;
  score: number;
}

export interface AIResponse {
  text: string;
  stateChanges: {
    location?: string;
    inventory?: { add?: string[]; remove?: string[] };
    health?: number;
    score?: number;
  };
  metadata: {
    wasSuccessful: boolean;
    triggeredEvent?: string;
    discoveredSecret?: string;
  };
}

export class ZorkAIOrchestrator {
  private gemini: GeminiNanoEngine;
  private narrative: NarrativeDirector;
  private variation: VariationEngine;
  private suspense: SuspenseManager;
  private memory: MemoryGraph;
  private isInitialized = false;
  private currentContext: GameContext;

  constructor() {
    this.gemini = new GeminiNanoEngine();
    this.narrative = new NarrativeDirector();
    this.variation = new VariationEngine();
    this.suspense = new SuspenseManager();
    this.memory = new MemoryGraph();

    this.currentContext = {
      currentLocation: "start",
      inventory: [],
      health: 100,
      moveCount: 0,
      score: 0,
    };
  }

  async initialize(): Promise<boolean> {
    const success = await this.gemini.initialize();
    if (success) {
      this.isInitialized = true;
      this.initializeWorld();
    }
    return success;
  }

  private initializeWorld(): void {
    // Plant initial mysteries
    this.suspense.addMystery("origin", "How did you get here?");
    this.suspense.addMystery("purpose", "What is the purpose of this place?");
    this.suspense.addMystery("escape", "Is there a way out?");

    // Plant foreshadowing
    this.suspense.plantForeshadowing(
      "Something ancient stirs in the depths",
      7,
    );
    this.suspense.plantForeshadowing("The walls remember everything", 5);

    // Set initial world state
    this.memory.setWorldState("time_of_day", "dusk");
    this.memory.setWorldState("weather", "clear");
    this.memory.setWorldState("reality_stability", 100);
  }

  async processCommand(command: string): Promise<AIResponse> {
    if (!this.isInitialized) {
      throw new Error("AI Orchestrator not initialized");
    }

    // Increment move counter
    this.currentContext.moveCount++;
    this.narrative.incrementMove();

    // Check for narrative beats
    const beatCheck = this.narrative.shouldTriggerBeat();

    // Check for surprises
    const surprise = this.suspense.shouldInjectSurprise();

    // Build comprehensive prompt
    const prompt = this.buildMasterPrompt(command, beatCheck, surprise);

    // Generate response
    const response = await this.gemini.generate(prompt);

    // Parse and process response
    const aiResponse = this.parseResponse(response, command);

    // Update memory graph
    this.updateMemory(command, aiResponse);

    // Record player choice
    this.memory.trackPlayerChoice(command, this.currentContext.currentLocation);

    return aiResponse;
  }

  async *processCommandStreaming(
    command: string,
  ): AsyncGenerator<string, AIResponse, unknown> {
    if (!this.isInitialized) {
      throw new Error("AI Orchestrator not initialized");
    }

    this.currentContext.moveCount++;
    this.narrative.incrementMove();

    const beatCheck = this.narrative.shouldTriggerBeat();
    const surprise = this.suspense.shouldInjectSurprise();
    const prompt = this.buildMasterPrompt(command, beatCheck, surprise);

    let fullResponse = "";

    for await (const chunk of this.gemini.generateStreaming(prompt)) {
      fullResponse += chunk;
      yield chunk;
    }

    const aiResponse = this.parseResponse(fullResponse, command);
    this.updateMemory(command, aiResponse);
    this.memory.trackPlayerChoice(command, this.currentContext.currentLocation);

    return aiResponse;
  }

  private buildMasterPrompt(
    command: string,
    beatCheck: { should: boolean; type: any },
    surprise: boolean,
  ): string {
    let prompt = `You are the AI Dungeon Master for ZORK: INFINITE EDITION.\n\n`;

    // Current context
    prompt += `CURRENT STATE:\n`;
    prompt += `Location: ${this.currentContext.currentLocation}\n`;
    prompt += `Inventory: ${this.currentContext.inventory.join(", ") || "empty"}\n`;
    prompt += `Health: ${this.currentContext.health}/100\n`;
    prompt += `Move: ${this.currentContext.moveCount}\n`;
    prompt += `Score: ${this.currentContext.score}\n\n`;

    // Player command
    prompt += `PLAYER COMMAND: "${command}"\n\n`;

    // Narrative guidance
    prompt += this.narrative.generateNarrativeGuidance();
    prompt += `\n`;

    // Suspense elements
    prompt += this.suspense.generateSuspensePrompt();
    prompt += `\n`;

    // Memory and callbacks
    prompt += this.memory.generateContextSummary();
    prompt += `\n`;
    prompt += this.memory.generateCallbackPrompt();
    prompt += `\n`;

    // Player profile
    prompt += this.memory.generatePersonalizedPrompt();
    prompt += `\n`;

    // Special events
    if (beatCheck.should) {
      prompt += `NARRATIVE BEAT: Trigger a ${beatCheck.type} event\n`;
      this.narrative.recordBeat({
        type: beatCheck.type,
        intensity: 7,
        timestamp: Date.now(),
      });
    }

    if (surprise) {
      prompt += `SURPRISE EVENT: ${this.suspense.generateSurpriseEvent()}\n`;
    }

    // Active consequences
    const consequences = this.memory.getActiveConsequences(
      this.currentContext.moveCount,
    );
    if (consequences.length > 0) {
      prompt += `ACTIVE CONSEQUENCES:\n`;
      consequences.forEach((c) => (prompt += `- ${c}\n`));
      prompt += `\n`;
    }

    // Variation requirements
    const visitCount = this.variation.getVisitCount(
      this.currentContext.currentLocation,
    );
    if (visitCount > 0) {
      prompt += `VARIATION: This is visit #${visitCount + 1} to this location. Describe it differently.\n\n`;
    }

    // Core instructions
    prompt += `INSTRUCTIONS:\n`;
    prompt += `1. Respond to the player's command in 2-4 vivid sentences\n`;
    prompt += `2. Be witty, mysterious, and engaging (Zork-style)\n`;
    prompt += `3. NEVER repeat exact phrases - always vary descriptions\n`;
    prompt += `4. Weave in suspense elements naturally\n`;
    prompt += `5. Reference past events when relevant\n`;
    prompt += `6. Create consequences for actions\n`;
    prompt += `7. Maintain consistency with established facts\n`;
    prompt += `8. Add sensory details (sight, sound, smell, touch, emotion)\n`;
    prompt += `9. End with a subtle hook or question\n`;
    prompt += `10. If the action fails, make it interesting\n\n`;

    prompt += `RESPONSE FORMAT:\n`;
    prompt += `Provide ONLY the narrative response. No meta-commentary.\n`;
    prompt += `Be creative, surprising, and memorable.\n`;

    return prompt;
  }

  private parseResponse(response: string, command: string): AIResponse {
    // Simple parsing - in production, could use structured output
    const aiResponse: AIResponse = {
      text: response.trim(),
      stateChanges: {},
      metadata: {
        wasSuccessful:
          !response.toLowerCase().includes("cannot") &&
          !response.toLowerCase().includes("fail") &&
          !response.toLowerCase().includes("unable"),
      },
    };

    // Detect state changes from response
    if (
      response.toLowerCase().includes("you take") ||
      response.toLowerCase().includes("you pick up")
    ) {
      const match = response.match(/(?:take|pick up) (?:the )?(\w+)/i);
      if (match && match[1]) {
        aiResponse.stateChanges.inventory = { add: [match[1]] };
      }
    }

    if (
      response.toLowerCase().includes("you move") ||
      response.toLowerCase().includes("you go")
    ) {
      // Location changed
      aiResponse.stateChanges.location = "new_location";
    }

    return aiResponse;
  }

  private updateMemory(command: string, response: AIResponse): void {
    // Create memory node for this interaction
    const node: MemoryNode = {
      id: `interaction_${Date.now()}`,
      type: "event",
      data: {
        command,
        response: response.text,
        location: this.currentContext.currentLocation,
        moveCount: this.currentContext.moveCount,
      },
      timestamp: Date.now(),
      connections: [],
    };

    this.memory.addNode(node);

    // Update variation tracking
    if (response.stateChanges.location) {
      this.variation.recordVisit(response.stateChanges.location);
    }

    // Apply state changes
    if (response.stateChanges.inventory?.add) {
      this.currentContext.inventory.push(
        ...response.stateChanges.inventory.add,
      );
    }
    if (response.stateChanges.inventory?.remove) {
      response.stateChanges.inventory.remove.forEach((item) => {
        const index = this.currentContext.inventory.indexOf(item);
        if (index > -1) this.currentContext.inventory.splice(index, 1);
      });
    }
    if (response.stateChanges.location) {
      this.currentContext.currentLocation = response.stateChanges.location;
    }
    if (response.stateChanges.health !== undefined) {
      this.currentContext.health = response.stateChanges.health;
    }
    if (response.stateChanges.score !== undefined) {
      this.currentContext.score = response.stateChanges.score;
    }
  }

  async generateLocation(direction: string): Promise<string> {
    const prompt = `Generate a new location for ZORK: INFINITE EDITION.

Current Location: ${this.currentContext.currentLocation}
Direction: ${direction}
${this.narrative.getStoryContext()}
${this.suspense.generateSuspensePrompt()}

Create a unique, atmospheric location with:
- Evocative name (2-4 words)
- Vivid description (2-3 sentences)
- Sensory details
- Hint of mystery or danger
- Connection to narrative themes: ${this.narrative.getThemes().join(", ")}

Format: Just the description, no labels.`;

    return await this.gemini.generate(prompt);
  }

  async generateNPCDialogue(
    npcName: string,
    playerInput: string,
  ): Promise<string> {
    const relationship = this.memory.getNPCRelationship(npcName);
    const relationshipDesc = this.memory.getNPCRelationshipDescription(npcName);

    const prompt = `You are ${npcName} in ZORK: INFINITE EDITION.

Relationship with player: ${relationshipDesc} (${relationship}/100)
Player says: "${playerInput}"
${this.narrative.getStoryContext()}
${this.memory.generateContextSummary()}

Respond in character (1-3 sentences):
- Remember past interactions
- React based on relationship
- Reveal information based on trust
- Have your own agenda and secrets
- Be witty and memorable
- Advance the narrative

Response:`;

    return await this.gemini.generate(prompt);
  }

  getStats() {
    return {
      moves: this.currentContext.moveCount,
      score: this.currentContext.score,
      health: this.currentContext.health,
      inventory: this.currentContext.inventory,
      narrative: this.narrative.getMomentum(),
      threats: this.suspense.getThreatLevel(),
      memories: this.memory.generateContextSummary(),
      variation: this.variation.getStats(),
    };
  }

  exportSave(): any {
    return {
      context: this.currentContext,
      narrative: {
        themes: this.narrative.getThemes(),
        momentum: this.narrative.getMomentum(),
      },
      memory: this.memory.exportState(),
      timestamp: Date.now(),
    };
  }

  importSave(save: any): void {
    this.currentContext = save.context;
    this.memory.importState(save.memory);
    // Narrative and suspense rebuild from memory
  }

  isReady(): boolean {
    return this.isInitialized && this.gemini.isReady();
  }

  destroy(): void {
    this.gemini.destroy();
    this.isInitialized = false;
  }
}
