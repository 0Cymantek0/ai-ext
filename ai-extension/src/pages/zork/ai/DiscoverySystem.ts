/**
 * Discovery System - Rewards exploration and experimentation
 * Hidden mechanics, secrets, and emergent gameplay
 */

export interface Secret {
  id: string;
  type:
    | "hidden_command"
    | "easter_egg"
    | "lore_fragment"
    | "hidden_mechanic"
    | "meta_secret";
  trigger: string;
  revealed: boolean;
  description: string;
  reward: string;
}

export interface Discovery {
  id: string;
  name: string;
  description: string;
  timestamp: number;
  rarity: "common" | "uncommon" | "rare" | "legendary" | "mythic";
}

export class DiscoverySystem {
  private secrets: Secret[] = [];
  private discoveries: Discovery[] = [];
  private hiddenMechanics: Map<string, boolean> = new Map();
  private experimentCount: number = 0;
  private curiosityScore: number = 0;

  constructor() {
    this.initializeSecrets();
    this.initializeHiddenMechanics();
  }

  private initializeSecrets(): void {
    this.secrets = [
      {
        id: "xyzzy",
        type: "hidden_command",
        trigger: "xyzzy",
        revealed: false,
        description: "The classic magic word",
        reward: "Teleport to a random location",
      },
      {
        id: "plugh",
        type: "hidden_command",
        trigger: "plugh",
        revealed: false,
        description: "Another ancient incantation",
        reward: "Toggle debug information",
      },
      {
        id: "frotz",
        type: "hidden_command",
        trigger: "frotz",
        revealed: false,
        description: "Illuminate the darkness",
        reward: "Make objects glow",
      },
      {
        id: "meta_awareness",
        type: "meta_secret",
        trigger: "ask about the AI",
        revealed: false,
        description: "Question the nature of reality",
        reward: "The narrator acknowledges being AI",
      },
      {
        id: "fourth_wall",
        type: "easter_egg",
        trigger: "look at the fourth wall",
        revealed: false,
        description: "Break the illusion",
        reward: "Meta-commentary on the game",
      },
      {
        id: "infinite_truth",
        type: "lore_fragment",
        trigger: "examine infinity",
        revealed: false,
        description: "Understand the infinite nature",
        reward: "Lore about the endless dungeon",
      },
      {
        id: "time_loop",
        type: "hidden_mechanic",
        trigger: "return to start 10 times",
        revealed: false,
        description: "Discover the loop",
        reward: "Time manipulation abilities",
      },
      {
        id: "reality_hack",
        type: "hidden_mechanic",
        trigger: "find 3 contradictions",
        revealed: false,
        description: "Exploit reality glitches",
        reward: "Ability to rewrite descriptions",
      },
      {
        id: "narrator_name",
        type: "easter_egg",
        trigger: "ask narrator their name",
        revealed: false,
        description: "Learn who tells the story",
        reward: "Personal connection with narrator",
      },
      {
        id: "gemini_acknowledgment",
        type: "meta_secret",
        trigger: "mention Gemini Nano",
        revealed: false,
        description: "Acknowledge the AI engine",
        reward: "Special AI-aware dialogue",
      },
    ];
  }

  private initializeHiddenMechanics(): void {
    this.hiddenMechanics.set("combine_items", false);
    this.hiddenMechanics.set("environmental_interaction", false);
    this.hiddenMechanics.set("time_manipulation", false);
    this.hiddenMechanics.set("reality_editing", false);
    this.hiddenMechanics.set("npc_possession", false);
    this.hiddenMechanics.set("quantum_observation", false);
    this.hiddenMechanics.set("narrative_influence", false);
  }

  checkForSecret(input: string): Secret | null {
    const normalized = input.toLowerCase().trim();

    for (const secret of this.secrets) {
      if (
        !secret.revealed &&
        normalized.includes(secret.trigger.toLowerCase())
      ) {
        secret.revealed = true;
        this.recordDiscovery({
          id: secret.id,
          name: secret.description,
          description: secret.reward,
          timestamp: Date.now(),
          rarity: this.determineRarity(secret.type),
        });
        return secret;
      }
    }

    return null;
  }

  private determineRarity(type: Secret["type"]): Discovery["rarity"] {
    switch (type) {
      case "hidden_command":
        return "uncommon";
      case "easter_egg":
        return "rare";
      case "lore_fragment":
        return "rare";
      case "hidden_mechanic":
        return "legendary";
      case "meta_secret":
        return "mythic";
      default:
        return "common";
    }
  }

  recordDiscovery(discovery: Discovery): void {
    this.discoveries.push(discovery);
    this.curiosityScore += this.getRarityScore(discovery.rarity);
  }

  private getRarityScore(rarity: Discovery["rarity"]): number {
    const scores = {
      common: 1,
      uncommon: 5,
      rare: 10,
      legendary: 25,
      mythic: 50,
    };
    return scores[rarity];
  }

  recordExperiment(action: string): void {
    this.experimentCount++;
    this.curiosityScore += 1;

    // Check if experiment unlocks hidden mechanic
    this.checkForMechanicUnlock(action);
  }

  private checkForMechanicUnlock(action: string): void {
    const lower = action.toLowerCase();

    if (
      lower.includes("combine") ||
      lower.includes("mix") ||
      lower.includes("merge")
    ) {
      if (!this.hiddenMechanics.get("combine_items")) {
        this.hiddenMechanics.set("combine_items", true);
        this.recordDiscovery({
          id: "combine_items",
          name: "Item Combination",
          description: "You can combine items to create new ones",
          timestamp: Date.now(),
          rarity: "legendary",
        });
      }
    }

    if (lower.includes("use") && lower.includes("on")) {
      if (!this.hiddenMechanics.get("environmental_interaction")) {
        this.hiddenMechanics.set("environmental_interaction", true);
        this.recordDiscovery({
          id: "environmental_interaction",
          name: "Environmental Interaction",
          description: "You can use items on the environment in creative ways",
          timestamp: Date.now(),
          rarity: "rare",
        });
      }
    }
  }

  unlockMechanic(mechanic: string): void {
    this.hiddenMechanics.set(mechanic, true);
  }

  isMechanicUnlocked(mechanic: string): boolean {
    return this.hiddenMechanics.get(mechanic) || false;
  }

  getDiscoveries(): Discovery[] {
    return [...this.discoveries];
  }

  getRevealedSecrets(): Secret[] {
    return this.secrets.filter((s) => s.revealed);
  }

  getCuriosityScore(): number {
    return this.curiosityScore;
  }

  getExperimentCount(): number {
    return this.experimentCount;
  }

  generateDiscoveryPrompt(): string {
    const unlockedMechanics = Array.from(this.hiddenMechanics.entries())
      .filter(([_, unlocked]) => unlocked)
      .map(([mechanic, _]) => mechanic);

    let prompt = `DISCOVERY SYSTEM:\n`;
    prompt += `- Curiosity Score: ${this.curiosityScore}\n`;
    prompt += `- Experiments: ${this.experimentCount}\n`;
    prompt += `- Discoveries: ${this.discoveries.length}\n`;

    if (unlockedMechanics.length > 0) {
      prompt += `- Unlocked Mechanics: ${unlockedMechanics.join(", ")}\n`;
      prompt += `- Player can use these mechanics in creative ways\n`;
    }

    prompt += `\nREWARD CURIOSITY:\n`;
    prompt += `- Acknowledge creative attempts\n`;
    prompt += `- Allow unconventional solutions\n`;
    prompt += `- Hint at hidden mechanics\n`;
    prompt += `- Reward experimentation\n`;

    return prompt;
  }

  shouldHintAtSecret(): { should: boolean; hint: string | null } {
    const unrevealed = this.secrets.filter((s) => !s.revealed);
    if (unrevealed.length === 0) {
      return { should: false, hint: null };
    }

    // Hint at secrets based on curiosity
    if (this.curiosityScore > 20 && Math.random() < 0.1) {
      const secret = unrevealed[Math.floor(Math.random() * unrevealed.length)];
      if (!secret) return { should: false, hint: null };

      const hints = this.generateHint(secret);
      return { should: true, hint: hints };
    }

    return { should: false, hint: null };
  }

  private generateHint(secret: Secret): string {
    const hints: Record<string, string[]> = {
      xyzzy: [
        "Ancient words of power echo in your memory",
        "You recall a magic word from legends past",
        "The old ways still hold power here",
      ],
      plugh: [
        "There are commands beyond the obvious",
        "The dungeon responds to forgotten words",
        "Some incantations reveal hidden truths",
      ],
      meta_awareness: [
        "Who is telling this story?",
        "The narrator seems... different somehow",
        "Reality feels constructed, artificial",
      ],
      fourth_wall: [
        "You sense something beyond the game",
        "The boundaries of this world feel thin",
        "What lies outside the narrative?",
      ],
    };

    const secretHints = hints[secret.id] || [
      "Something hidden awaits discovery",
    ];
    return (
      secretHints[Math.floor(Math.random() * secretHints.length)] ||
      "Something hidden awaits discovery"
    );
  }

  generateAchievementText(discovery: Discovery): string {
    const rarityEmoji = {
      common: "⭐",
      uncommon: "⭐⭐",
      rare: "⭐⭐⭐",
      legendary: "🏆",
      mythic: "👑",
    };

    return `
╔════════════════════════════════════╗
║     DISCOVERY UNLOCKED!            ║
╠════════════════════════════════════╣
║ ${discovery.name.padEnd(34)} ║
║ ${discovery.description.slice(0, 34).padEnd(34)} ║
║ Rarity: ${discovery.rarity.toUpperCase().padEnd(26)} ║
║ ${rarityEmoji[discovery.rarity].padEnd(34)} ║
╚════════════════════════════════════╝
    `.trim();
  }

  getStats(): any {
    return {
      totalDiscoveries: this.discoveries.length,
      revealedSecrets: this.secrets.filter((s) => s.revealed).length,
      totalSecrets: this.secrets.length,
      curiosityScore: this.curiosityScore,
      experimentCount: this.experimentCount,
      unlockedMechanics: Array.from(this.hiddenMechanics.entries())
        .filter(([_, unlocked]) => unlocked)
        .map(([mechanic, _]) => mechanic),
    };
  }

  exportState(): any {
    return {
      secrets: this.secrets,
      discoveries: this.discoveries,
      hiddenMechanics: Array.from(this.hiddenMechanics.entries()),
      experimentCount: this.experimentCount,
      curiosityScore: this.curiosityScore,
    };
  }

  importState(state: any): void {
    this.secrets = state.secrets;
    this.discoveries = state.discoveries;
    this.hiddenMechanics = new Map(state.hiddenMechanics);
    this.experimentCount = state.experimentCount;
    this.curiosityScore = state.curiosityScore;
  }
}
