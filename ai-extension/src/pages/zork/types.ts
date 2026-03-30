/**
 * Type definitions for ZORK: INFINITE EDITION
 */

export interface Item {
  id: string;
  name: string;
  description: string;
  takeable: boolean;
  useable: boolean;
  weight: number;
}

export interface Exit {
  direction: string;
  destination: string;
  locked: boolean;
  keyRequired?: string;
}

export interface NPC {
  id: string;
  name: string;
  description: string;
  personality: string;
  relationship: number; // -100 to 100
  conversationHistory: string[];
  inventory: Item[];
  hostile: boolean;
}

export interface Location {
  id: string;
  name: string;
  description: string;
  exits: Exit[];
  items: Item[];
  npcs: string[]; // NPC IDs
  visited: boolean;
  atmosphere: string;
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  objectives: string[];
}

export interface Player {
  location: string;
  inventory: Item[];
  health: number;
  maxHealth: number;
  score: number;
  moves: number;
  maxInventoryWeight: number;
}

export interface GameState {
  player: Player;
  world: {
    locations: Map<string, Location>;
    npcs: Map<string, NPC>;
    quests: Quest[];
    currentTheme: string;
  };
  history: {
    visitedLocations: string[];
    completedPuzzles: string[];
    npcInteractions: Map<string, string[]>;
    commands: string[];
  };
  meta: {
    startTime: number;
    lastSave: number;
    difficulty: "easy" | "medium" | "hard";
    achievements: string[];
  };
}

export interface CommandResult {
  success: boolean;
  message: string;
  stateChanges?: Partial<GameState>;
}

export interface AIGenerationContext {
  previousLocation?: Location;
  direction: string;
  theme: string;
  playerLevel: number;
  visitedCount: number;
}

export type ColorScheme = "green" | "amber" | "white" | "blue" | "apple";

export interface TerminalSettings {
  colorScheme: ColorScheme;
  fontSize: number;
  textSpeed: number;
  scanlines: boolean;
  crtEffect: boolean;
  soundEnabled: boolean;
}
