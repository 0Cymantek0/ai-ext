/**
 * Game Engine
 * Core game logic and command processing
 */

import { GameStateManager } from "./GameState";
import { GeminiNanoClient } from "../ai/GeminiNanoClient";
import { AICache } from "../ai/AICache";
import type { CommandResult, Location, Item, NPC } from "../types";

export class GameEngine {
  private stateManager: GameStateManager;
  private aiClient: GeminiNanoClient;
  private cache: AICache;
  private isInitialized = false;

  constructor() {
    this.stateManager = new GameStateManager();
    this.aiClient = new GeminiNanoClient();
    this.cache = new AICache();
  }

  async initialize(): Promise<boolean> {
    const success = await this.aiClient.initialize();
    this.isInitialized = success;
    return success;
  }

  isReady(): boolean {
    return this.isInitialized && this.aiClient.isReady();
  }

  async processCommand(command: string): Promise<CommandResult> {
    this.stateManager.addCommand(command);

    // Handle meta commands first
    const metaResult = this.handleMetaCommands(command.toLowerCase());
    if (metaResult) {
      return metaResult;
    }

    // Parse command with AI
    const gameState = this.stateManager.getState();
    const currentLocation = this.stateManager.getCurrentLocation();

    const parsedCommand = await this.aiClient.parseCommand(command, {
      currentLocation: currentLocation?.name || "Unknown",
      inventory: gameState.player.inventory.map((i) => i.name),
    });

    if (!parsedCommand.understood) {
      return {
        success: false,
        message:
          "I don't understand that command. Try 'help' for a list of commands.",
      };
    }

    // Route to appropriate handler
    switch (parsedCommand.verb) {
      case "go":
      case "move":
        return await this.handleMovement(parsedCommand.direction);
      case "take":
      case "get":
        return this.handleTake(parsedCommand.object);
      case "drop":
        return this.handleDrop(parsedCommand.object);
      case "examine":
      case "look":
        return await this.handleExamine(parsedCommand.object);
      case "inventory":
        return this.handleInventory();
      case "talk":
        return await this.handleTalk(
          parsedCommand.object,
          parsedCommand.target,
        );
      case "use":
        return await this.handleUse(parsedCommand.object, parsedCommand.target);
      case "attack":
        return await this.handleAttack(
          parsedCommand.object,
          parsedCommand.target,
        );
      default:
        return await this.handleGenericAction(parsedCommand);
    }
  }

  private handleMetaCommands(command: string): CommandResult | null {
    const state = this.stateManager.getState();

    switch (command) {
      case "help":
        return {
          success: true,
          message: `Available commands:
- Movement: north, south, east, west, up, down (or n, s, e, w, u, d)
- Actions: take [item], drop [item], examine [object], use [item]
- Social: talk to [npc], ask [npc] about [topic]
- Combat: attack [target] with [weapon]
- System: inventory (i), score, save, load, quit
- Meta: xyzzy, plugh, frotz, diagnose, version

You can also try natural language commands!`,
        };

      case "inventory":
      case "i":
        return this.handleInventory();

      case "score":
        return {
          success: true,
          message: `Score: ${state.player.score} | Moves: ${state.player.moves} | Health: ${state.player.health}/${state.player.maxHealth}`,
        };

      case "diagnose":
        return {
          success: true,
          message: `Health: ${state.player.health}/${state.player.maxHealth}
Inventory: ${state.player.inventory.length} items (${state.player.inventory.reduce((sum, i) => sum + i.weight, 0)}/${state.player.maxInventoryWeight} weight)
Locations visited: ${state.history.visitedLocations.length}
Achievements: ${state.meta.achievements.length}`,
        };

      case "version":
        return {
          success: true,
          message: "ZORK: INFINITE EDITION v1.0.0 - Powered by Gemini Nano AI",
        };

      case "xyzzy":
        return {
          success: true,
          message: 'A hollow voice says "Fool."',
        };

      case "plugh":
        return {
          success: true,
          message: 'A hollow voice says "Plugh."',
        };

      case "frotz":
        return {
          success: true,
          message: "The air shimmers briefly, but nothing happens.",
        };

      default:
        return null;
    }
  }

  private async handleMovement(direction: string): Promise<CommandResult> {
    const currentLocation = this.stateManager.getCurrentLocation();
    if (!currentLocation) {
      return {
        success: false,
        message: "You are nowhere. This should not happen.",
      };
    }

    // Check if exit exists
    const exit = currentLocation.exits.find((e) => e.direction === direction);
    if (!exit) {
      return {
        success: false,
        message: `You can't go ${direction} from here.`,
      };
    }

    // Check if exit is locked
    if (exit.locked) {
      return {
        success: false,
        message: `The way ${direction} is locked. You need a key.`,
      };
    }

    // Generate new location if destination is empty
    if (!exit.destination) {
      const newLocation = await this.generateLocation(
        direction,
        currentLocation,
      );
      exit.destination = newLocation.id;
      this.stateManager.addLocation(newLocation);
    }

    // Move player
    this.stateManager.movePlayer(exit.destination);
    const newLocation = this.stateManager.getCurrentLocation();

    return {
      success: true,
      message: newLocation
        ? newLocation.description
        : "You move to a new location.",
    };
  }

  private async generateLocation(
    direction: string,
    fromLocation: Location,
  ): Promise<Location> {
    const state = this.stateManager.getState();
    const cacheKey = `${fromLocation.id}-${direction}`;

    // Check cache first
    const cached = this.cache.getLocation(cacheKey);
    if (cached) {
      return cached;
    }

    // Generate with AI
    const generated = await this.aiClient.generateLocation({
      previousLocation: fromLocation.name,
      direction,
      theme: state.world.currentTheme,
      playerLevel: Math.floor(state.player.score / 100),
      visitedCount: state.history.visitedLocations.length,
    });

    const location: Location = {
      id: `loc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: generated.name,
      description: generated.description,
      exits: generated.exits.map((dir: string) => ({
        direction: dir,
        destination: "",
        locked: false,
      })),
      items: generated.items.map((item: any, index: number) => ({
        id: `item_${Date.now()}_${index}`,
        name: item.name,
        description: item.description,
        takeable: item.takeable !== false,
        useable: true,
        weight: 1,
      })),
      npcs: generated.npcs.map((npc: any) => {
        const npcId = `npc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const npcObj: NPC = {
          id: npcId,
          name: npc.name,
          description: npc.description,
          personality: npc.personality,
          relationship: 0,
          conversationHistory: [],
          inventory: [],
          hostile: false,
        };
        this.stateManager.addNPC(npcObj);
        return npcId;
      }),
      visited: false,
      atmosphere: generated.atmosphere,
    };

    // Cache the location
    this.cache.cacheLocation(cacheKey, location);

    return location;
  }

  private handleTake(itemName: string): CommandResult {
    const location = this.stateManager.getCurrentLocation();
    if (!location) {
      return { success: false, message: "You are nowhere." };
    }

    const item = location.items.find((i) =>
      i.name.toLowerCase().includes(itemName.toLowerCase()),
    );
    if (!item) {
      return { success: false, message: `There is no ${itemName} here.` };
    }

    if (!item.takeable) {
      return { success: false, message: `You can't take the ${item.name}.` };
    }

    if (!this.stateManager.addItemToInventory(item)) {
      return { success: false, message: "You're carrying too much weight." };
    }

    // Remove from location
    location.items = location.items.filter((i) => i.id !== item.id);
    this.stateManager.updateScore(5);

    return { success: true, message: `Taken: ${item.name}` };
  }

  private handleDrop(itemName: string): CommandResult {
    const item = this.stateManager
      .getState()
      .player.inventory.find((i) =>
        i.name.toLowerCase().includes(itemName.toLowerCase()),
      );

    if (!item) {
      return { success: false, message: `You don't have a ${itemName}.` };
    }

    const removed = this.stateManager.removeItemFromInventory(item.id);
    if (!removed) {
      return { success: false, message: "Failed to drop item." };
    }

    const location = this.stateManager.getCurrentLocation();
    if (location) {
      location.items.push(item);
    }

    return { success: true, message: `Dropped: ${item.name}` };
  }

  private async handleExamine(
    objectName: string | null,
  ): Promise<CommandResult> {
    if (!objectName) {
      const location = this.stateManager.getCurrentLocation();
      return {
        success: true,
        message: location ? location.description : "You see nothing special.",
      };
    }

    // Check inventory
    const inventoryItem = this.stateManager
      .getState()
      .player.inventory.find((i) =>
        i.name.toLowerCase().includes(objectName.toLowerCase()),
      );

    if (inventoryItem) {
      return { success: true, message: inventoryItem.description };
    }

    // Check location
    const location = this.stateManager.getCurrentLocation();
    if (location) {
      const locationItem = location.items.find((i) =>
        i.name.toLowerCase().includes(objectName.toLowerCase()),
      );
      if (locationItem) {
        return { success: true, message: locationItem.description };
      }
    }

    return { success: false, message: `You don't see any ${objectName} here.` };
  }

  private handleInventory(): CommandResult {
    const inventory = this.stateManager.getState().player.inventory;
    if (inventory.length === 0) {
      return { success: true, message: "You are empty-handed." };
    }

    const items = inventory.map((i) => `- ${i.name}`).join("\n");
    return { success: true, message: `You are carrying:\n${items}` };
  }

  private async handleTalk(
    npcName: string | null,
    topic: string | null,
  ): Promise<CommandResult> {
    if (!npcName) {
      return { success: false, message: "Talk to whom?" };
    }

    const location = this.stateManager.getCurrentLocation();
    if (!location) {
      return { success: false, message: "You are nowhere." };
    }

    const npcId = location.npcs.find((id) => {
      const npc = this.stateManager.getNPC(id);
      return npc && npc.name.toLowerCase().includes(npcName.toLowerCase());
    });

    if (!npcId) {
      return { success: false, message: `There is no ${npcName} here.` };
    }

    const npc = this.stateManager.getNPC(npcId);
    if (!npc) {
      return { success: false, message: "NPC not found." };
    }

    const dialogue = await this.aiClient.generateNPCDialogue(
      npc,
      topic || "hello",
      npc.conversationHistory,
    );

    this.stateManager.addNPCInteraction(npcId, dialogue);
    npc.conversationHistory.push(dialogue);

    return { success: true, message: `${npc.name} says: "${dialogue}"` };
  }

  private async handleUse(
    itemName: string | null,
    targetName: string | null,
  ): Promise<CommandResult> {
    if (!itemName) {
      return { success: false, message: "Use what?" };
    }

    const item = this.stateManager
      .getState()
      .player.inventory.find((i) =>
        i.name.toLowerCase().includes(itemName.toLowerCase()),
      );

    if (!item) {
      return { success: false, message: `You don't have a ${itemName}.` };
    }

    // Generate AI response for using the item
    const response = await this.aiClient.generateResponse(
      { verb: "use", object: itemName, target: targetName },
      {
        currentLocation: this.stateManager.getCurrentLocation()?.name,
        context: `Player uses ${itemName}${targetName ? ` on ${targetName}` : ""}`,
      },
    );

    return { success: true, message: response };
  }

  private async handleAttack(
    targetName: string | null,
    weaponName: string | null,
  ): Promise<CommandResult> {
    if (!targetName) {
      return { success: false, message: "Attack what?" };
    }

    // Simple combat system - can be expanded
    const response = await this.aiClient.generateResponse(
      { verb: "attack", object: targetName, target: weaponName },
      {
        currentLocation: this.stateManager.getCurrentLocation()?.name,
        context: `Player attacks ${targetName}${weaponName ? ` with ${weaponName}` : ""}`,
      },
    );

    return { success: true, message: response };
  }

  private async handleGenericAction(
    parsedCommand: any,
  ): Promise<CommandResult> {
    const response = await this.aiClient.generateResponse(parsedCommand, {
      currentLocation: this.stateManager.getCurrentLocation()?.name,
      context: "Generic action",
    });

    return { success: true, message: response };
  }

  getStateManager(): GameStateManager {
    return this.stateManager;
  }

  async destroy(): Promise<void> {
    await this.aiClient.destroy();
  }
}
