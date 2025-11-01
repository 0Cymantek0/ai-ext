/**
 * Game State Manager
 * Manages the complete state of the game
 */

import type { GameState, Player, Location, NPC, Item } from '../types';

export class GameStateManager {
  private state: GameState;

  constructor() {
    this.state = this.createInitialState();
  }

  private createInitialState(): GameState {
    const startingLocation: Location = {
      id: 'start',
      name: 'Open Field',
      description:
        'You are standing in an open field west of a white house, with a boarded front door. But this is no ordinary house... The world beyond is infinite, shaped by your choices and powered by artificial intelligence.',
      exits: [
        { direction: 'north', destination: '', locked: false },
        { direction: 'east', destination: '', locked: false },
        { direction: 'south', destination: '', locked: false },
      ],
      items: [
        {
          id: 'lamp',
          name: 'brass lamp',
          description: 'A shiny brass lamp. It appears to be magical.',
          takeable: true,
          useable: true,
          weight: 2,
        },
      ],
      npcs: [],
      visited: true,
      atmosphere: 'mysterious and inviting',
    };

    return {
      player: {
        location: 'start',
        inventory: [],
        health: 100,
        maxHealth: 100,
        score: 0,
        moves: 0,
        maxInventoryWeight: 20,
      },
      world: {
        locations: new Map([['start', startingLocation]]),
        npcs: new Map(),
        quests: [],
        currentTheme: 'fantasy-adventure',
      },
      history: {
        visitedLocations: ['start'],
        completedPuzzles: [],
        npcInteractions: new Map(),
        commands: [],
      },
      meta: {
        startTime: Date.now(),
        lastSave: Date.now(),
        difficulty: 'medium',
        achievements: [],
      },
    };
  }

  getState(): GameState {
    return this.state;
  }

  getPlayer(): Player {
    return this.state.player;
  }

  getCurrentLocation(): Location | undefined {
    return this.state.world.locations.get(this.state.player.location);
  }

  addLocation(location: Location): void {
    this.state.world.locations.set(location.id, location);
  }

  movePlayer(locationId: string): boolean {
    const location = this.state.world.locations.get(locationId);
    if (!location) {
      return false;
    }

    this.state.player.location = locationId;
    this.state.player.moves++;

    if (!location.visited) {
      location.visited = true;
      this.state.history.visitedLocations.push(locationId);
      this.state.player.score += 5; // Points for exploring
    }

    return true;
  }

  addItemToInventory(item: Item): boolean {
    const currentWeight = this.state.player.inventory.reduce((sum, i) => sum + i.weight, 0);
    if (currentWeight + item.weight > this.state.player.maxInventoryWeight) {
      return false;
    }

    this.state.player.inventory.push(item);
    return true;
  }

  removeItemFromInventory(itemId: string): Item | null {
    const index = this.state.player.inventory.findIndex((i) => i.id === itemId);
    if (index === -1) {
      return null;
    }

    const [item] = this.state.player.inventory.splice(index, 1);
    return item || null;
  }

  hasItem(itemId: string): boolean {
    return this.state.player.inventory.some((i) => i.id === itemId);
  }

  addNPC(npc: NPC): void {
    this.state.world.npcs.set(npc.id, npc);
  }

  getNPC(npcId: string): NPC | undefined {
    return this.state.world.npcs.get(npcId);
  }

  updateNPCRelationship(npcId: string, change: number): void {
    const npc = this.state.world.npcs.get(npcId);
    if (npc) {
      npc.relationship = Math.max(-100, Math.min(100, npc.relationship + change));
    }
  }

  addNPCInteraction(npcId: string, interaction: string): void {
    const interactions = this.state.history.npcInteractions.get(npcId) || [];
    interactions.push(interaction);
    this.state.history.npcInteractions.set(npcId, interactions);
  }

  addCommand(command: string): void {
    this.state.history.commands.push(command);
    // Keep only last 100 commands
    if (this.state.history.commands.length > 100) {
      this.state.history.commands.shift();
    }
  }

  addAchievement(achievement: string): void {
    if (!this.state.meta.achievements.includes(achievement)) {
      this.state.meta.achievements.push(achievement);
    }
  }

  updateScore(points: number): void {
    this.state.player.score += points;
  }

  updateHealth(change: number): void {
    this.state.player.health = Math.max(0, Math.min(this.state.player.maxHealth, this.state.player.health + change));
  }

  isDead(): boolean {
    return this.state.player.health <= 0;
  }

  serialize(): string {
    // Convert Maps to objects for JSON serialization
    const serializable = {
      ...this.state,
      world: {
        ...this.state.world,
        locations: Array.from(this.state.world.locations.entries()),
        npcs: Array.from(this.state.world.npcs.entries()),
      },
      history: {
        ...this.state.history,
        npcInteractions: Array.from(this.state.history.npcInteractions.entries()),
      },
    };

    return JSON.stringify(serializable);
  }

  deserialize(data: string): void {
    const parsed = JSON.parse(data);

    // Convert arrays back to Maps
    this.state = {
      ...parsed,
      world: {
        ...parsed.world,
        locations: new Map(parsed.world.locations),
        npcs: new Map(parsed.world.npcs),
      },
      history: {
        ...parsed.history,
        npcInteractions: new Map(parsed.history.npcInteractions),
      },
    };
  }

  reset(): void {
    this.state = this.createInitialState();
  }
}
