/**
 * World Evolution Engine - Makes the world dynamic and responsive
 * Locations change based on time, player actions, and narrative progression
 */

export interface WorldEvent {
  id: string;
  type:
    | "environmental"
    | "npc_action"
    | "consequence"
    | "time_based"
    | "reality_shift";
  description: string;
  affectedLocations: string[];
  timestamp: number;
  permanent: boolean;
}

export interface LocationState {
  id: string;
  baseDescription: string;
  modifications: string[];
  lastVisit: number;
  visitCount: number;
  hasChanged: boolean;
}

export class WorldEvolutionEngine {
  private locations: Map<string, LocationState> = new Map();
  private worldEvents: WorldEvent[] = [];
  private timeElapsed: number = 0; // In-game time in minutes
  private realityStability: number = 100; // 0-100, affects how much world changes

  recordLocationVisit(locationId: string, description: string): void {
    const existing = this.locations.get(locationId);

    if (existing) {
      existing.visitCount++;
      existing.lastVisit = Date.now();
      existing.hasChanged = false;
    } else {
      this.locations.set(locationId, {
        id: locationId,
        baseDescription: description,
        modifications: [],
        lastVisit: Date.now(),
        visitCount: 1,
        hasChanged: false,
      });
    }
  }

  advanceTime(minutes: number): WorldEvent[] {
    this.timeElapsed += minutes;
    const triggeredEvents: WorldEvent[] = [];

    // Check for time-based events
    if (this.timeElapsed % 30 === 0) {
      // Every 30 minutes
      const event = this.generateTimeBasedEvent();
      if (event) {
        this.worldEvents.push(event);
        triggeredEvents.push(event);
        this.applyEvent(event);
      }
    }

    return triggeredEvents;
  }

  private generateTimeBasedEvent(): WorldEvent | null {
    const eventTypes = [
      {
        type: "environmental" as const,
        descriptions: [
          "A strange fog rolls in, obscuring familiar landmarks",
          "The temperature drops suddenly and unnaturally",
          "Distant thunder echoes through the corridors",
          "An eerie silence falls over everything",
          "The air shimmers with an otherworldly energy",
        ],
      },
      {
        type: "reality_shift" as const,
        descriptions: [
          "Reality flickers - some locations have subtly changed",
          "The geometry of space feels wrong somehow",
          "Paths that were there before have vanished",
          "New passages have appeared where none existed",
          "The world rearranges itself when you're not looking",
        ],
      },
    ];

    const category = eventTypes[Math.floor(Math.random() * eventTypes.length)];
    if (!category) return null;

    const description =
      category.descriptions[
        Math.floor(Math.random() * category.descriptions.length)
      ];
    if (!description) return null;

    return {
      id: `event_${Date.now()}`,
      type: category.type,
      description,
      affectedLocations: this.getRandomLocations(3),
      timestamp: Date.now(),
      permanent: Math.random() < 0.3, // 30% chance of permanent change
    };
  }

  private getRandomLocations(count: number): string[] {
    const allLocations = Array.from(this.locations.keys());
    const selected: string[] = [];

    for (let i = 0; i < Math.min(count, allLocations.length); i++) {
      const index = Math.floor(Math.random() * allLocations.length);
      const location = allLocations[index];
      if (location) selected.push(location);
    }

    return selected;
  }

  private applyEvent(event: WorldEvent): void {
    event.affectedLocations.forEach((locId) => {
      const location = this.locations.get(locId);
      if (location) {
        location.modifications.push(event.description);
        location.hasChanged = true;

        // Reduce reality stability
        this.realityStability = Math.max(0, this.realityStability - 2);
      }
    });
  }

  triggerConsequenceEvent(
    action: string,
    affectedLocations: string[],
  ): WorldEvent {
    const event: WorldEvent = {
      id: `consequence_${Date.now()}`,
      type: "consequence",
      description: `The consequences of ${action} ripple through the world`,
      affectedLocations,
      timestamp: Date.now(),
      permanent: true,
    };

    this.worldEvents.push(event);
    this.applyEvent(event);

    return event;
  }

  hasLocationChanged(locationId: string): boolean {
    const location = this.locations.get(locationId);
    return location?.hasChanged || false;
  }

  getLocationModifications(locationId: string): string[] {
    const location = this.locations.get(locationId);
    return location?.modifications || [];
  }

  generateEvolutionPrompt(locationId: string): string {
    const location = this.locations.get(locationId);
    if (!location) return "";

    const timeSinceLastVisit = Date.now() - location.lastVisit;
    const minutesSince = Math.floor(timeSinceLastVisit / 60000);

    let prompt = `WORLD EVOLUTION:\n`;

    if (location.hasChanged) {
      prompt += `This location has changed since last visit:\n`;
      location.modifications.slice(-3).forEach((mod) => {
        prompt += `- ${mod}\n`;
      });
    }

    if (minutesSince > 5) {
      prompt += `Time has passed (${minutesSince} minutes). Show subtle changes.\n`;
    }

    if (this.realityStability < 70) {
      prompt += `Reality is unstable (${this.realityStability}/100). Things may not be as they were.\n`;
    }

    return prompt;
  }

  destabilizeReality(amount: number): void {
    this.realityStability = Math.max(0, this.realityStability - amount);

    if (this.realityStability < 50) {
      // Trigger reality shift event
      const event: WorldEvent = {
        id: `reality_shift_${Date.now()}`,
        type: "reality_shift",
        description: "Reality fractures - the world is no longer stable",
        affectedLocations: this.getRandomLocations(5),
        timestamp: Date.now(),
        permanent: false,
      };

      this.worldEvents.push(event);
      this.applyEvent(event);
    }
  }

  stabilizeReality(amount: number): void {
    this.realityStability = Math.min(100, this.realityStability + amount);
  }

  getRealityStability(): number {
    return this.realityStability;
  }

  getRecentEvents(count: number = 5): WorldEvent[] {
    return this.worldEvents.slice(-count);
  }

  clearLocationChanges(locationId: string): void {
    const location = this.locations.get(locationId);
    if (location) {
      location.hasChanged = false;
    }
  }

  generateWorldStateDescription(): string {
    let desc = `World State:\n`;
    desc += `- Time Elapsed: ${this.timeElapsed} minutes\n`;
    desc += `- Reality Stability: ${this.realityStability}/100\n`;
    desc += `- Locations Tracked: ${this.locations.size}\n`;
    desc += `- World Events: ${this.worldEvents.length}\n`;

    if (this.realityStability < 70) {
      desc += `- WARNING: Reality is becoming unstable\n`;
    }

    if (this.realityStability < 30) {
      desc += `- CRITICAL: Reality is fracturing\n`;
    }

    return desc;
  }

  shouldTriggerEvolution(): boolean {
    // Random chance based on reality stability
    const instability = 100 - this.realityStability;
    const chance = instability / 200; // 0-0.5 probability
    return Math.random() < chance;
  }

  exportState(): any {
    return {
      locations: Array.from(this.locations.entries()),
      worldEvents: this.worldEvents,
      timeElapsed: this.timeElapsed,
      realityStability: this.realityStability,
    };
  }

  importState(state: any): void {
    this.locations = new Map(state.locations);
    this.worldEvents = state.worldEvents;
    this.timeElapsed = state.timeElapsed;
    this.realityStability = state.realityStability;
  }
}
