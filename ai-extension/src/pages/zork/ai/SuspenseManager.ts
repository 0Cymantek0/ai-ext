/**
 * Suspense Manager - Builds and maintains dramatic tension
 * Creates foreshadowing, red herrings, and unexpected twists
 */

export interface SuspenseElement {
  type: 'foreshadowing' | 'red_herring' | 'hidden_threat' | 'mystery_clue' | 'ominous_sign';
  content: string;
  intensity: number;
  planted: number;
  revealed: boolean;
}

export interface ThreatLevel {
  ambient: number; // Background danger (0-100)
  immediate: number; // Current danger (0-100)
  existential: number; // World-ending danger (0-100)
}

export class SuspenseManager {
  private elements: SuspenseElement[] = [];
  private threatLevel: ThreatLevel = {
    ambient: 20,
    immediate: 0,
    existential: 10
  };
  private mysterySeeds: string[] = [];
  private unresolvedMysteries: Map<string, number> = new Map();
  private plotTwists: Array<{ twist: string; triggerCondition: string; used: boolean }> = [];

  constructor() {
    this.initializePlotTwists();
  }

  private initializePlotTwists(): void {
    this.plotTwists = [
      {
        twist: 'The dungeon is actually inside your own mind',
        triggerCondition: 'visited_10_locations',
        used: false
      },
      {
        twist: 'NPCs are other players trapped in the game',
        triggerCondition: 'talked_to_5_npcs',
        used: false
      },
      {
        twist: 'Time is looping - you\'ve been here before',
        triggerCondition: 'revisited_same_location_5_times',
        used: false
      },
      {
        twist: 'The AI narrator is lying to you',
        triggerCondition: 'found_3_contradictions',
        used: false
      },
      {
        twist: 'You are the villain in someone else\'s story',
        triggerCondition: 'killed_3_creatures',
        used: false
      },
      {
        twist: 'The exit was always there, you just couldn\'t see it',
        triggerCondition: 'examined_starting_location_3_times',
        used: false
      },
      {
        twist: 'Every choice you made was predetermined',
        triggerCondition: 'made_20_decisions',
        used: false
      },
      {
        twist: 'The dungeon is generating itself from your fears',
        triggerCondition: 'encountered_3_dangerous_situations',
        used: false
      }
    ];
  }

  plantForeshadowing(content: string, intensity: number = 5): void {
    this.elements.push({
      type: 'foreshadowing',
      content,
      intensity,
      planted: Date.now(),
      revealed: false
    });
  }

  plantRedHerring(content: string): void {
    this.elements.push({
      type: 'red_herring',
      content,
      intensity: 3,
      planted: Date.now(),
      revealed: false
    });
  }

  plantHiddenThreat(content: string, intensity: number = 7): void {
    this.elements.push({
      type: 'hidden_threat',
      content,
      intensity,
      planted: Date.now(),
      revealed: false
    });
    
    // Increase ambient threat
    this.threatLevel.ambient = Math.min(100, this.threatLevel.ambient + 5);
  }

  addMystery(mysteryId: string, description: string): void {
    this.mysterySeeds.push(description);
    this.unresolvedMysteries.set(mysteryId, Date.now());
  }

  resolveMystery(mysteryId: string): boolean {
    return this.unresolvedMysteries.delete(mysteryId);
  }

  getUnresolvedMysteries(): string[] {
    return Array.from(this.unresolvedMysteries.keys());
  }

  generateSuspensePrompt(): string {
    const activeElements = this.elements.filter(e => !e.revealed);
    const oldestElement = activeElements.sort((a, b) => a.planted - b.planted)[0];
    
    let prompt = `SUSPENSE ELEMENTS TO WEAVE IN:\n\n`;
    
    // Threat levels
    prompt += `Threat Levels:\n`;
    prompt += `- Ambient Danger: ${this.threatLevel.ambient}/100\n`;
    prompt += `- Immediate Danger: ${this.threatLevel.immediate}/100\n`;
    prompt += `- Existential Threat: ${this.threatLevel.existential}/100\n\n`;
    
    // Active suspense elements
    if (activeElements.length > 0) {
      prompt += `Active Suspense Elements (subtly hint at these):\n`;
      activeElements.slice(0, 3).forEach(e => {
        prompt += `- [${e.type.toUpperCase()}] ${e.content}\n`;
      });
      prompt += `\n`;
    }
    
    // Unresolved mysteries
    if (this.unresolvedMysteries.size > 0) {
      prompt += `Unresolved Mysteries (keep these alive):\n`;
      Array.from(this.unresolvedMysteries.keys()).slice(0, 3).forEach(m => {
        prompt += `- ${m}\n`;
      });
      prompt += `\n`;
    }
    
    // Oldest element should be revealed soon
    if (oldestElement && Date.now() - oldestElement.planted > 300000) { // 5 minutes
      prompt += `IMPORTANT: Consider revealing or advancing: ${oldestElement.content}\n\n`;
    }
    
    return prompt;
  }

  generateOminousDetail(): string {
    const details = [
      'A distant sound echoes through the darkness',
      'The air grows noticeably colder',
      'You feel watched, though you see no one',
      'A shadow moves at the edge of your vision',
      'The silence here is unnatural',
      'Something feels wrong about this place',
      'You hear whispers, but can\'t make out the words',
      'The walls seem to pulse with hidden life',
      'Time feels strange here, distorted somehow',
      'You smell something ancient and forgotten',
      'The light flickers for no apparent reason',
      'Your instincts scream danger',
      'Reality feels thin here, fragile',
      'You sense a presence, malevolent and patient',
      'The darkness seems alive, hungry'
    ];
    
    return details[Math.floor(Math.random() * details.length)] || 'Something feels wrong about this place';
  }

  generateMysteryClue(): string {
    const clues = [
      'Strange symbols are carved into the surface',
      'You notice something that doesn\'t belong here',
      'A pattern emerges, but its meaning eludes you',
      'This connects to something you saw before',
      'The pieces don\'t quite fit together',
      'There\'s more to this than meets the eye',
      'A contradiction catches your attention',
      'This raises more questions than answers',
      'You\'re missing something important',
      'The truth is hidden in plain sight'
    ];
    
    return clues[Math.floor(Math.random() * clues.length)] || 'There\'s more to this than meets the eye';
  }

  shouldRevealTwist(condition: string): { should: boolean; twist: string | null } {
    const availableTwist = this.plotTwists.find(
      t => !t.used && t.triggerCondition === condition
    );
    
    if (availableTwist && Math.random() < 0.3) { // 30% chance when condition met
      availableTwist.used = true;
      return { should: true, twist: availableTwist.twist };
    }
    
    return { should: false, twist: null };
  }

  escalateThreat(type: 'ambient' | 'immediate' | 'existential', amount: number): void {
    this.threatLevel[type] = Math.min(100, this.threatLevel[type] + amount);
  }

  reduceThreat(type: 'ambient' | 'immediate' | 'existential', amount: number): void {
    this.threatLevel[type] = Math.max(0, this.threatLevel[type] - amount);
  }

  getThreatLevel(): ThreatLevel {
    return { ...this.threatLevel };
  }

  generateTensionModifier(): string {
    const total = this.threatLevel.ambient + this.threatLevel.immediate + this.threatLevel.existential;
    const average = total / 3;
    
    if (average > 70) {
      return 'MAXIMUM TENSION: Danger is imminent, every moment counts';
    } else if (average > 50) {
      return 'HIGH TENSION: Threat is real and growing';
    } else if (average > 30) {
      return 'MODERATE TENSION: Unease and uncertainty';
    } else {
      return 'LOW TENSION: Calm before the storm';
    }
  }

  revealElement(content: string): void {
    const element = this.elements.find(e => e.content === content);
    if (element) {
      element.revealed = true;
    }
  }

  getActiveElementCount(): number {
    return this.elements.filter(e => !e.revealed).length;
  }

  generatePartialInformation(): string {
    const partials = [
      'You sense something, but can\'t quite grasp it',
      'A fragment of understanding, incomplete',
      'Part of the picture, but not the whole',
      'You know there\'s more, just out of reach',
      'The full truth remains hidden',
      'You\'re close to understanding, but not quite there',
      'A piece of the puzzle, but which piece?',
      'You feel you\'re missing the obvious',
      'The answer is there, if only you could see it',
      'Something important, just beyond comprehension'
    ];
    
    return partials[Math.floor(Math.random() * partials.length)] || 'You sense something, but can\'t quite grasp it';
  }

  shouldInjectSurprise(): boolean {
    // Random surprise events to keep player on edge
    return Math.random() < 0.05; // 5% chance per action
  }

  generateSurpriseEvent(): string {
    const surprises = [
      'Suddenly, the environment shifts around you',
      'Without warning, something changes',
      'In an instant, everything is different',
      'The unexpected happens',
      'Reality hiccups',
      'Time skips forward',
      'You blink, and the world has changed',
      'A moment of vertigo, and nothing is the same',
      'The rules just changed',
      'Something impossible just happened'
    ];
    
    return surprises[Math.floor(Math.random() * surprises.length)] || 'The unexpected happens';
  }
}
