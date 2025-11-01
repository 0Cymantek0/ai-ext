/**
 * Memory Graph - Tracks all relationships, consequences, and callbacks
 * Ensures player actions have lasting impact and create emergent narratives
 */

export interface MemoryNode {
  id: string;
  type: 'location' | 'npc' | 'item' | 'event' | 'decision';
  data: any;
  timestamp: number;
  connections: string[];
}

export interface Consequence {
  action: string;
  immediate: string[];
  delayed: Array<{ effect: string; triggersAfter: number }>;
  permanent: string[];
}

export class MemoryGraph {
  private nodes: Map<string, MemoryNode> = new Map();
  private consequences: Consequence[] = [];
  private npcRelationships: Map<string, number> = new Map(); // -100 to 100
  private worldState: Map<string, any> = new Map();
  private callbacks: Array<{ reference: string; context: string; used: boolean }> = [];

  addNode(node: MemoryNode): void {
    this.nodes.set(node.id, node);
  }

  connectNodes(nodeId1: string, nodeId2: string): void {
    const node1 = this.nodes.get(nodeId1);
    const node2 = this.nodes.get(nodeId2);
    
    if (node1 && node2) {
      if (!node1.connections.includes(nodeId2)) {
        node1.connections.push(nodeId2);
      }
      if (!node2.connections.includes(nodeId1)) {
        node2.connections.push(nodeId1);
      }
    }
  }

  getConnectedNodes(nodeId: string, depth: number = 1): MemoryNode[] {
    const node = this.nodes.get(nodeId);
    if (!node) return [];
    
    const connected: MemoryNode[] = [];
    const visited = new Set<string>();
    const queue: Array<{ id: string; currentDepth: number }> = [
      { id: nodeId, currentDepth: 0 }
    ];
    
    while (queue.length > 0) {
      const { id, currentDepth } = queue.shift()!;
      
      if (visited.has(id) || currentDepth > depth) continue;
      visited.add(id);
      
      const currentNode = this.nodes.get(id);
      if (currentNode && id !== nodeId) {
        connected.push(currentNode);
      }
      
      if (currentNode && currentDepth < depth) {
        currentNode.connections.forEach(connId => {
          queue.push({ id: connId, currentDepth: currentDepth + 1 });
        });
      }
    }
    
    return connected;
  }

  recordConsequence(consequence: Consequence): void {
    this.consequences.push(consequence);
  }

  getActiveConsequences(moveCount: number): string[] {
    const active: string[] = [];
    
    this.consequences.forEach(c => {
      c.delayed.forEach(d => {
        if (d.triggersAfter <= moveCount) {
          active.push(d.effect);
        }
      });
    });
    
    return active;
  }

  updateNPCRelationship(npcId: string, change: number): number {
    const current = this.npcRelationships.get(npcId) || 0;
    const newValue = Math.max(-100, Math.min(100, current + change));
    this.npcRelationships.set(npcId, newValue);
    return newValue;
  }

  getNPCRelationship(npcId: string): number {
    return this.npcRelationships.get(npcId) || 0;
  }

  getNPCRelationshipDescription(npcId: string): string {
    const value = this.getNPCRelationship(npcId);
    
    if (value >= 80) return 'devoted ally';
    if (value >= 60) return 'trusted friend';
    if (value >= 40) return 'friendly acquaintance';
    if (value >= 20) return 'cordial';
    if (value >= -20) return 'neutral';
    if (value >= -40) return 'suspicious';
    if (value >= -60) return 'hostile';
    if (value >= -80) return 'enemy';
    return 'sworn nemesis';
  }

  setWorldState(key: string, value: any): void {
    this.worldState.set(key, value);
  }

  getWorldState(key: string): any {
    return this.worldState.get(key);
  }

  getAllWorldState(): Record<string, any> {
    return Object.fromEntries(this.worldState);
  }

  addCallback(reference: string, context: string): void {
    this.callbacks.push({ reference, context, used: false });
  }

  getUnusedCallback(): { reference: string; context: string } | null {
    const unused = this.callbacks.filter(c => !c.used);
    if (unused.length === 0) return null;
    
    // Prefer older callbacks
    const callback = unused[0];
    if (!callback) return null;
    
    callback.used = true;
    return { reference: callback.reference, context: callback.context };
  }

  getRecentHistory(count: number = 10): MemoryNode[] {
    const sorted = Array.from(this.nodes.values())
      .sort((a, b) => b.timestamp - a.timestamp);
    return sorted.slice(0, count);
  }

  findNodesByType(type: MemoryNode['type']): MemoryNode[] {
    return Array.from(this.nodes.values()).filter(n => n.type === type);
  }

  generateContextSummary(): string {
    const locations = this.findNodesByType('location').length;
    const npcs = this.findNodesByType('npc').length;
    const events = this.findNodesByType('event').length;
    const decisions = this.findNodesByType('decision').length;
    
    let summary = `Memory Graph Summary:\n`;
    summary += `- Locations Visited: ${locations}\n`;
    summary += `- NPCs Encountered: ${npcs}\n`;
    summary += `- Events Experienced: ${events}\n`;
    summary += `- Decisions Made: ${decisions}\n`;
    summary += `- Active Consequences: ${this.consequences.length}\n`;
    summary += `- Relationships: ${this.npcRelationships.size}\n`;
    
    // Add significant relationships
    const significantRelationships = Array.from(this.npcRelationships.entries())
      .filter(([_, value]) => Math.abs(value) > 30)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    
    if (significantRelationships.length > 0) {
      summary += `\nSignificant Relationships:\n`;
      significantRelationships.slice(0, 3).forEach(([npc, value]) => {
        summary += `- ${npc}: ${this.getNPCRelationshipDescription(npc)} (${value})\n`;
      });
    }
    
    return summary;
  }

  generateCallbackPrompt(): string {
    const callback = this.getUnusedCallback();
    if (!callback) return '';
    
    return `\nCALLBACK OPPORTUNITY:\nReference this past event: "${callback.reference}"\nContext: ${callback.context}\n`;
  }

  trackPlayerChoice(choice: string, context: string): void {
    const node: MemoryNode = {
      id: `decision_${Date.now()}`,
      type: 'decision',
      data: { choice, context },
      timestamp: Date.now(),
      connections: []
    };
    
    this.addNode(node);
    
    // Create callback opportunity
    this.addCallback(choice, context);
  }

  getPlayerChoicePattern(): string {
    const decisions = this.findNodesByType('decision');
    if (decisions.length < 3) return 'Not enough data';
    
    // Analyze recent decisions for patterns
    const recent = decisions.slice(-5);
    const choices = recent.map(d => d.data.choice);
    
    // Simple pattern detection
    const aggressive = choices.filter(c => 
      c.includes('attack') || c.includes('fight') || c.includes('kill')
    ).length;
    
    const peaceful = choices.filter(c =>
      c.includes('talk') || c.includes('help') || c.includes('give')
    ).length;
    
    const cautious = choices.filter(c =>
      c.includes('examine') || c.includes('look') || c.includes('wait')
    ).length;
    
    if (aggressive > peaceful && aggressive > cautious) {
      return 'aggressive';
    } else if (peaceful > aggressive && peaceful > cautious) {
      return 'diplomatic';
    } else if (cautious > aggressive && cautious > peaceful) {
      return 'cautious';
    }
    
    return 'balanced';
  }

  generatePersonalizedPrompt(): string {
    const pattern = this.getPlayerChoicePattern();
    const recentHistory = this.getRecentHistory(5);
    
    let prompt = `PLAYER PROFILE:\n`;
    prompt += `- Play Style: ${pattern}\n`;
    prompt += `- Total Memories: ${this.nodes.size}\n`;
    
    if (recentHistory.length > 0) {
      prompt += `\nRecent Events:\n`;
      recentHistory.forEach(node => {
        prompt += `- [${node.type}] ${JSON.stringify(node.data).slice(0, 50)}...\n`;
      });
    }
    
    prompt += `\nTailor responses to match player's style and reference their history.\n`;
    
    return prompt;
  }

  exportState(): any {
    return {
      nodes: Array.from(this.nodes.entries()),
      consequences: this.consequences,
      relationships: Array.from(this.npcRelationships.entries()),
      worldState: Array.from(this.worldState.entries()),
      callbacks: this.callbacks
    };
  }

  importState(state: any): void {
    this.nodes = new Map(state.nodes);
    this.consequences = state.consequences;
    this.npcRelationships = new Map(state.relationships);
    this.worldState = new Map(state.worldState);
    this.callbacks = state.callbacks;
  }
}
