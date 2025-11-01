/**
 * Variation Engine - Ensures no two descriptions are ever the same
 * Uses semantic variation, perspective shifts, and detail layering
 */

export interface VariationContext {
  visitCount: number;
  timeOfDay: 'dawn' | 'morning' | 'noon' | 'afternoon' | 'dusk' | 'night' | 'midnight';
  weather: 'clear' | 'cloudy' | 'rainy' | 'stormy' | 'foggy' | 'snowy';
  playerMood: string;
  recentEvents: string[];
}

export class VariationEngine {
  private locationVisits: Map<string, number> = new Map();
  private usedPhrases: Set<string> = new Set();
  private sensoryFocus: Array<'visual' | 'auditory' | 'olfactory' | 'tactile' | 'emotional'> = 
    ['visual', 'auditory', 'olfactory', 'tactile', 'emotional'];

  recordVisit(locationId: string): number {
    const count = (this.locationVisits.get(locationId) || 0) + 1;
    this.locationVisits.set(locationId, count);
    return count;
  }

  getVisitCount(locationId: string): number {
    return this.locationVisits.get(locationId) || 0;
  }

  generateVariationPrompt(baseDescription: string, context: VariationContext): string {
    const visitCount = context.visitCount;
    const sensory = this.selectSensoryFocus(visitCount);
    const perspective = this.selectPerspective(visitCount);
    const detail = this.selectDetailLevel(visitCount);
    
    let prompt = `Rewrite this location description with these requirements:\n\n`;
    prompt += `Original: ${baseDescription}\n\n`;
    prompt += `VARIATION REQUIREMENTS:\n`;
    prompt += `- Visit #${visitCount}: ${this.getVisitGuidance(visitCount)}\n`;
    prompt += `- Sensory Focus: ${sensory.toUpperCase()}\n`;
    prompt += `- Perspective: ${perspective}\n`;
    prompt += `- Detail Level: ${detail}\n`;
    prompt += `- Time: ${context.timeOfDay}\n`;
    prompt += `- Weather: ${context.weather}\n`;
    
    if (context.recentEvents.length > 0) {
      prompt += `- Recent Events: ${context.recentEvents.join(', ')}\n`;
    }
    
    prompt += `\nRULES:\n`;
    prompt += `- NEVER repeat exact phrases from previous descriptions\n`;
    prompt += `- Show how the location has changed or reveal new details\n`;
    prompt += `- Maintain consistency but add fresh perspective\n`;
    prompt += `- Use vivid, specific language\n`;
    prompt += `- Keep it 2-4 sentences\n`;
    
    return prompt;
  }

  private getVisitGuidance(visitCount: number): string {
    if (visitCount === 1) {
      return 'First impression - focus on immediate, striking details';
    } else if (visitCount === 2) {
      return 'Second look - notice things missed before, subtle changes';
    } else if (visitCount === 3) {
      return 'Growing familiarity - deeper understanding, hidden aspects';
    } else if (visitCount <= 5) {
      return 'Intimate knowledge - see beyond surface, notice evolution';
    } else {
      return 'Deep connection - philosophical reflection, meta-awareness';
    }
  }

  private selectSensoryFocus(visitCount: number): string {
    // Rotate through senses to keep descriptions fresh
    const index = (visitCount - 1) % this.sensoryFocus.length;
    return this.sensoryFocus[index] || 'visual';
  }

  private selectPerspective(visitCount: number): string {
    const perspectives = [
      'Objective observer',
      'Subjective experience',
      'Historical context',
      'Future implications',
      'Emotional resonance',
      'Metaphorical interpretation'
    ];
    
    const index = (visitCount - 1) % perspectives.length;
    return perspectives[index] || 'Objective observer';
  }

  private selectDetailLevel(visitCount: number): string {
    if (visitCount === 1) return 'Broad strokes, immediate impact';
    if (visitCount === 2) return 'Medium detail, specific elements';
    if (visitCount === 3) return 'Fine detail, subtle nuances';
    if (visitCount <= 5) return 'Microscopic detail, hidden layers';
    return 'Abstract patterns, deeper meaning';
  }

  generateObjectVariation(objectName: string, context: string): string {
    const variations = this.getObjectVariations(objectName);
    const unused = variations.filter(v => !this.usedPhrases.has(v));
    
    if (unused.length === 0) {
      // All variations used, generate new one
      return this.generateNewVariation(objectName, context);
    }
    
    const selected = unused[Math.floor(Math.random() * unused.length)];
    if (!selected) {
      return this.generateNewVariation(objectName, context);
    }
    
    this.usedPhrases.add(selected);
    return selected;
  }

  private getObjectVariations(objectName: string): string[] {
    // Pre-defined variations for common objects
    const variations: Record<string, string[]> = {
      'door': [
        'weathered door',
        'ancient portal',
        'heavy wooden barrier',
        'mysterious entrance',
        'sealed doorway',
        'imposing threshold'
      ],
      'key': [
        'tarnished key',
        'ornate key',
        'ancient key',
        'mysterious key',
        'cold metal key',
        'intricate key'
      ],
      'sword': [
        'gleaming blade',
        'ancient weapon',
        'deadly steel',
        'warrior\'s tool',
        'sharp edge',
        'battle-worn sword'
      ]
    };
    
    return variations[objectName.toLowerCase()] || [objectName];
  }

  private generateNewVariation(objectName: string, context: string): string {
    // Generate a unique variation based on context
    const adjectives = [
      'mysterious', 'ancient', 'peculiar', 'weathered', 'ornate',
      'simple', 'complex', 'strange', 'familiar', 'unusual'
    ];
    
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    return `${adj} ${objectName}`;
  }

  generateActionVariation(action: string, success: boolean): string {
    const successVariations = [
      'You manage to',
      'With effort, you',
      'Successfully, you',
      'You carefully',
      'After a moment, you',
      'You skillfully'
    ];
    
    const failureVariations = [
      'You attempt to',
      'You try to',
      'You struggle to',
      'Despite your efforts, you',
      'You fail to',
      'You cannot'
    ];
    
    const variations = success ? successVariations : failureVariations;
    return variations[Math.floor(Math.random() * variations.length)] || (success ? 'You manage to' : 'You attempt to');
  }

  generateTimeVariation(timeOfDay: VariationContext['timeOfDay']): string {
    const timeDescriptions: Record<string, string[]> = {
      dawn: [
        'The first light of dawn',
        'As morning breaks',
        'In the early twilight',
        'At the edge of night'
      ],
      morning: [
        'In the morning light',
        'As the day begins',
        'Under the morning sun',
        'In the fresh morning air'
      ],
      noon: [
        'At the height of day',
        'Under the blazing sun',
        'In the midday heat',
        'As noon approaches'
      ],
      afternoon: [
        'In the afternoon warmth',
        'As the day wanes',
        'Under the afternoon sky',
        'In the lengthening shadows'
      ],
      dusk: [
        'As twilight descends',
        'In the fading light',
        'At the edge of darkness',
        'As day surrenders to night'
      ],
      night: [
        'Under the cover of darkness',
        'In the deep night',
        'Beneath the stars',
        'In the nocturnal silence'
      ],
      midnight: [
        'At the witching hour',
        'In the dead of night',
        'As midnight reigns',
        'In the deepest darkness'
      ]
    };
    
    const options = timeDescriptions[timeOfDay];
    if (!options) return 'In the present moment';
    
    return options[Math.floor(Math.random() * options.length)] || 'In the present moment';
  }

  clearUsedPhrases(): void {
    this.usedPhrases.clear();
  }

  getStats(): { visits: number; uniquePhrases: number } {
    return {
      visits: Array.from(this.locationVisits.values()).reduce((a, b) => a + b, 0),
      uniquePhrases: this.usedPhrases.size
    };
  }
}
