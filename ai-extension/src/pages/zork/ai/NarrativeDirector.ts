/**
 * Narrative Director - Orchestrates story beats, pacing, and dramatic tension
 * Ensures the story always escalates and never becomes boring
 */

export interface StoryBeat {
  type:
    | "discovery"
    | "conflict"
    | "mystery"
    | "revelation"
    | "twist"
    | "calm"
    | "climax";
  intensity: number; // 0-10
  timestamp: number;
}

export interface NarrativeMomentum {
  tension: number; // 0-100
  mysteryLevel: number; // 0-100
  dangerLevel: number; // 0-100
  emotionalTone:
    | "wonder"
    | "dread"
    | "excitement"
    | "melancholy"
    | "triumph"
    | "confusion";
}

export class NarrativeDirector {
  private storyBeats: StoryBeat[] = [];
  private momentum: NarrativeMomentum = {
    tension: 30,
    mysteryLevel: 70,
    dangerLevel: 20,
    emotionalTone: "wonder",
  };
  private movesSinceLastBeat = 0;
  private narrativeThemes: string[] = [];
  private foreshadowingQueue: Array<{ event: string; triggersIn: number }> = [];

  constructor(initialThemes: string[] = []) {
    this.narrativeThemes =
      initialThemes.length > 0 ? initialThemes : this.generateRandomThemes();
  }

  private generateRandomThemes(): string[] {
    const themePool = [
      "ancient_prophecy",
      "forgotten_civilization",
      "reality_manipulation",
      "time_paradox",
      "cosmic_horror",
      "hidden_conspiracy",
      "magical_corruption",
      "technological_singularity",
      "dimensional_breach",
      "cursed_artifact",
      "lost_memories",
      "parallel_worlds",
      "sentient_dungeon",
      "dream_logic",
    ];

    // Pick 2-3 themes for this playthrough
    const count = 2 + Math.floor(Math.random() * 2);
    const themes: string[] = [];
    const pool = [...themePool];

    for (let i = 0; i < count; i++) {
      const index = Math.floor(Math.random() * pool.length);
      const theme = pool.splice(index, 1)[0];
      if (theme) themes.push(theme);
    }

    return themes;
  }

  recordBeat(beat: StoryBeat): void {
    this.storyBeats.push(beat);
    this.movesSinceLastBeat = 0;
    this.updateMomentum(beat);
  }

  private updateMomentum(beat: StoryBeat): void {
    // Adjust momentum based on beat type
    switch (beat.type) {
      case "conflict":
        this.momentum.tension = Math.min(100, this.momentum.tension + 15);
        this.momentum.dangerLevel = Math.min(
          100,
          this.momentum.dangerLevel + 10,
        );
        break;
      case "mystery":
        this.momentum.mysteryLevel = Math.min(
          100,
          this.momentum.mysteryLevel + 20,
        );
        this.momentum.tension = Math.min(100, this.momentum.tension + 5);
        break;
      case "revelation":
        this.momentum.mysteryLevel = Math.max(
          0,
          this.momentum.mysteryLevel - 15,
        );
        this.momentum.tension = Math.min(100, this.momentum.tension + 10);
        break;
      case "twist":
        this.momentum.tension = Math.min(100, this.momentum.tension + 25);
        break;
      case "calm":
        this.momentum.tension = Math.max(0, this.momentum.tension - 20);
        break;
      case "climax":
        this.momentum.tension = 100;
        this.momentum.dangerLevel = Math.min(
          100,
          this.momentum.dangerLevel + 20,
        );
        break;
    }

    // Update emotional tone based on current momentum
    this.updateEmotionalTone();
  }

  private updateEmotionalTone(): void {
    const { tension, mysteryLevel, dangerLevel } = this.momentum;

    if (dangerLevel > 70) {
      this.momentum.emotionalTone = "dread";
    } else if (tension > 70) {
      this.momentum.emotionalTone = "excitement";
    } else if (mysteryLevel > 70) {
      this.momentum.emotionalTone = "confusion";
    } else if (tension < 30) {
      this.momentum.emotionalTone = "wonder";
    } else {
      this.momentum.emotionalTone = "wonder";
    }
  }

  incrementMove(): void {
    this.movesSinceLastBeat++;

    // Natural tension decay over time (prevents staying at max)
    this.momentum.tension = Math.max(0, this.momentum.tension - 1);

    // Process foreshadowing queue
    this.foreshadowingQueue = this.foreshadowingQueue.map((f) => ({
      ...f,
      triggersIn: f.triggersIn - 1,
    }));
  }

  shouldTriggerBeat(): { should: boolean; type: StoryBeat["type"] } {
    // Force a beat if too many moves without one
    if (this.movesSinceLastBeat > 8) {
      return { should: true, type: this.selectBeatType() };
    }

    // Random chance based on current tension
    const chance = this.momentum.tension / 200; // 0-0.5 probability
    if (Math.random() < chance) {
      return { should: true, type: this.selectBeatType() };
    }

    return { should: false, type: "calm" };
  }

  private selectBeatType(): StoryBeat["type"] {
    const { tension, mysteryLevel, dangerLevel } = this.momentum;

    // High tension -> climax or conflict
    if (tension > 80) {
      return Math.random() < 0.3 ? "climax" : "conflict";
    }

    // High mystery -> revelation or more mystery
    if (mysteryLevel > 70) {
      return Math.random() < 0.4 ? "revelation" : "mystery";
    }

    // High danger -> conflict
    if (dangerLevel > 60) {
      return "conflict";
    }

    // Low tension -> build it up
    if (tension < 30) {
      const options: StoryBeat["type"][] = ["mystery", "discovery", "conflict"];
      return options[Math.floor(Math.random() * options.length)] || "discovery";
    }

    // Random twist occasionally
    if (Math.random() < 0.1) {
      return "twist";
    }

    // Default distribution
    const weights = {
      discovery: 25,
      conflict: 20,
      mystery: 25,
      revelation: 15,
      twist: 10,
      calm: 5,
    };

    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let random = Math.random() * total;

    for (const [type, weight] of Object.entries(weights)) {
      random -= weight;
      if (random <= 0) {
        return type as StoryBeat["type"];
      }
    }

    return "discovery";
  }

  addForeshadowing(event: string, movesUntilTrigger: number): void {
    this.foreshadowingQueue.push({
      event,
      triggersIn: movesUntilTrigger,
    });
  }

  getReadyForeshadowing(): string[] {
    const ready = this.foreshadowingQueue
      .filter((f) => f.triggersIn <= 0)
      .map((f) => f.event);

    this.foreshadowingQueue = this.foreshadowingQueue.filter(
      (f) => f.triggersIn > 0,
    );

    return ready;
  }

  getMomentum(): NarrativeMomentum {
    return { ...this.momentum };
  }

  getThemes(): string[] {
    return [...this.narrativeThemes];
  }

  getStoryContext(): string {
    const recentBeats = this.storyBeats.slice(-5);
    const beatSummary = recentBeats.map((b) => b.type).join(" → ");

    return `
Narrative Themes: ${this.narrativeThemes.join(", ")}
Recent Story Beats: ${beatSummary || "Beginning"}
Current Tension: ${this.momentum.tension}/100
Mystery Level: ${this.momentum.mysteryLevel}/100
Danger Level: ${this.momentum.dangerLevel}/100
Emotional Tone: ${this.momentum.emotionalTone}
Moves Since Last Beat: ${this.movesSinceLastBeat}
    `.trim();
  }

  generateNarrativeGuidance(): string {
    const { tension, mysteryLevel, dangerLevel, emotionalTone } = this.momentum;
    const foreshadowing = this.getReadyForeshadowing();

    let guidance = `Narrative Guidance:\n`;

    // Tension guidance
    if (tension > 70) {
      guidance += `- HIGH TENSION: Create urgency, danger, or difficult choices\n`;
    } else if (tension < 30) {
      guidance += `- LOW TENSION: Build suspense, introduce mysteries, hint at danger\n`;
    }

    // Mystery guidance
    if (mysteryLevel > 70) {
      guidance += `- HIGH MYSTERY: Consider revealing something, but create new questions\n`;
    } else if (mysteryLevel < 30) {
      guidance += `- LOW MYSTERY: Introduce new enigmas, strange occurrences, unexplained phenomena\n`;
    }

    // Danger guidance
    if (dangerLevel > 60) {
      guidance += `- HIGH DANGER: Threats are real and present, consequences matter\n`;
    }

    // Emotional tone
    guidance += `- EMOTIONAL TONE: ${emotionalTone.toUpperCase()}\n`;

    // Foreshadowing
    if (foreshadowing.length > 0) {
      guidance += `- FORESHADOWED EVENTS READY: ${foreshadowing.join(", ")}\n`;
    }

    // Themes
    guidance += `- WEAVE IN THEMES: ${this.narrativeThemes.join(", ")}\n`;

    return guidance;
  }
}
