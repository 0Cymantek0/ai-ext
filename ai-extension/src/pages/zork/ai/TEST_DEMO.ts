/**
 * TEST DEMO - Demonstrates the AI Engine's Capabilities
 * Run this to see how the engine creates unique, suspenseful content
 */

import { ZorkAIOrchestrator } from "./ZorkAIOrchestrator";
import { NarrativeDirector } from "./NarrativeDirector";
import { VariationEngine } from "./VariationEngine";
import { SuspenseManager } from "./SuspenseManager";
import { MemoryGraph } from "./MemoryGraph";
import { DiscoverySystem } from "./DiscoverySystem";

// ============================================================================
// DEMO 1: Narrative Director - Story Beats and Pacing
// ============================================================================

function demoNarrativeDirector() {
  console.log("=== NARRATIVE DIRECTOR DEMO ===\n");

  const director = new NarrativeDirector();

  console.log("Initial State:");
  console.log(director.getStoryContext());
  console.log("\nThemes:", director.getThemes());
  console.log("\nMomentum:", director.getMomentum());

  // Simulate 10 moves
  console.log("\n--- Simulating 10 moves ---\n");
  for (let i = 0; i < 10; i++) {
    director.incrementMove();

    const beatCheck = director.shouldTriggerBeat();
    if (beatCheck.should) {
      console.log(
        `Move ${i + 1}: STORY BEAT - ${beatCheck.type.toUpperCase()}`,
      );
      director.recordBeat({
        type: beatCheck.type,
        intensity: 7,
        timestamp: Date.now(),
      });
    } else {
      console.log(`Move ${i + 1}: Normal progression`);
    }
  }

  console.log("\nFinal Momentum:", director.getMomentum());
  console.log("\nNarrative Guidance:");
  console.log(director.generateNarrativeGuidance());
}

// ============================================================================
// DEMO 2: Variation Engine - Zero Repetition
// ============================================================================

function demoVariationEngine() {
  console.log("\n=== VARIATION ENGINE DEMO ===\n");

  const variation = new VariationEngine();
  const locationId = "dark_forest";

  console.log("Visiting the same location 5 times:\n");

  for (let i = 1; i <= 5; i++) {
    const visitCount = variation.recordVisit(locationId);

    const context = {
      visitCount,
      timeOfDay: ["dawn", "morning", "noon", "afternoon", "dusk"][i - 1] as any,
      weather: ["clear", "cloudy", "rainy", "foggy", "stormy"][i - 1] as any,
      playerMood: "curious",
      recentEvents: [],
    };

    console.log(`Visit #${visitCount}:`);
    console.log("Context:", context.timeOfDay, context.weather);
    console.log("Variation Prompt:");
    console.log(
      variation.generateVariationPrompt(
        "A dark forest with twisted trees",
        context,
      ),
    );
    console.log("\n---\n");
  }

  console.log("Stats:", variation.getStats());
}

// ============================================================================
// DEMO 3: Suspense Manager - Building Tension
// ============================================================================

function demoSuspenseManager() {
  console.log("\n=== SUSPENSE MANAGER DEMO ===\n");

  const suspense = new SuspenseManager();

  // Plant suspense elements
  console.log("Planting suspense elements...\n");
  suspense.plantForeshadowing("An ancient evil stirs in the depths", 8);
  suspense.plantForeshadowing("The walls remember your sins", 6);
  suspense.plantRedHerring("A mysterious figure watches from afar");
  suspense.plantHiddenThreat("Something follows you in the darkness", 9);

  // Add mysteries
  suspense.addMystery("origin", "How did you get here?");
  suspense.addMystery("purpose", "What is this place?");
  suspense.addMystery("escape", "Is there a way out?");

  console.log("Initial Threat Levels:", suspense.getThreatLevel());
  console.log("\nSuspense Prompt:");
  console.log(suspense.generateSuspensePrompt());

  // Escalate tension
  console.log("\n--- Escalating Tension ---\n");
  suspense.escalateThreat("ambient", 20);
  suspense.escalateThreat("immediate", 30);

  console.log("Updated Threat Levels:", suspense.getThreatLevel());
  console.log("Tension Modifier:", suspense.generateTensionModifier());

  // Generate atmospheric details
  console.log("\n--- Atmospheric Details ---\n");
  for (let i = 0; i < 5; i++) {
    console.log(`- ${suspense.generateOminousDetail()}`);
  }

  // Check for plot twist
  console.log("\n--- Plot Twist Check ---\n");
  const twist = suspense.shouldRevealTwist("visited_10_locations");
  if (twist.should) {
    console.log("PLOT TWIST:", twist.twist);
  }
}

// ============================================================================
// DEMO 4: Memory Graph - Consequences and Relationships
// ============================================================================

function demoMemoryGraph() {
  console.log("\n=== MEMORY GRAPH DEMO ===\n");

  const memory = new MemoryGraph();

  // Add locations
  console.log("Recording locations...\n");
  memory.addNode({
    id: "forest_entrance",
    type: "location",
    data: {
      name: "Forest Entrance",
      description: "A dark path leads into the woods",
    },
    timestamp: Date.now(),
    connections: [],
  });

  memory.addNode({
    id: "ancient_ruins",
    type: "location",
    data: {
      name: "Ancient Ruins",
      description: "Crumbling stones tell forgotten stories",
    },
    timestamp: Date.now(),
    connections: [],
  });

  // Connect locations
  memory.connectNodes("forest_entrance", "ancient_ruins");

  // Add NPCs
  console.log("Adding NPCs...\n");
  memory.addNode({
    id: "mysterious_wizard",
    type: "npc",
    data: { name: "Mysterious Wizard", personality: "cryptic and wise" },
    timestamp: Date.now(),
    connections: ["ancient_ruins"],
  });

  // Track relationships
  console.log("--- NPC Relationships ---\n");
  memory.updateNPCRelationship("mysterious_wizard", 20);
  console.log(
    "After helping wizard:",
    memory.getNPCRelationshipDescription("mysterious_wizard"),
  );

  memory.updateNPCRelationship("mysterious_wizard", 30);
  console.log(
    "After more help:",
    memory.getNPCRelationshipDescription("mysterious_wizard"),
  );

  memory.updateNPCRelationship("mysterious_wizard", -60);
  console.log(
    "After betrayal:",
    memory.getNPCRelationshipDescription("mysterious_wizard"),
  );

  // Record consequences
  console.log("\n--- Consequences ---\n");
  memory.recordConsequence({
    action: "stole ancient artifact",
    immediate: ["wizard becomes hostile"],
    delayed: [
      { effect: "guards are alerted", triggersAfter: 5 },
      { effect: "curse activates", triggersAfter: 10 },
    ],
    permanent: ["marked as thief"],
  });

  console.log(
    "Active consequences at move 5:",
    memory.getActiveConsequences(5),
  );
  console.log(
    "Active consequences at move 10:",
    memory.getActiveConsequences(10),
  );

  // Track player choices
  console.log("\n--- Player Choices ---\n");
  memory.trackPlayerChoice("attack guard", "castle_entrance");
  memory.trackPlayerChoice("attack dragon", "dragon_lair");
  memory.trackPlayerChoice("attack merchant", "town_square");

  console.log("Play style:", memory.getPlayerChoicePattern());

  // Summary
  console.log("\n--- Memory Summary ---\n");
  console.log(memory.generateContextSummary());
}

// ============================================================================
// DEMO 5: Discovery System - Secrets and Achievements
// ============================================================================

function demoDiscoverySystem() {
  console.log("\n=== DISCOVERY SYSTEM DEMO ===\n");

  const discovery = new DiscoverySystem();

  // Try hidden commands
  console.log("Testing hidden commands...\n");

  const commands = [
    "xyzzy",
    "plugh",
    "frotz",
    "look at the fourth wall",
    "ask about the AI",
  ];

  commands.forEach((cmd) => {
    const secret = discovery.checkForSecret(cmd);
    if (secret) {
      console.log(`✓ Discovered: ${secret.description}`);
      console.log(`  Reward: ${secret.reward}\n`);
    }
  });

  // Record experiments
  console.log("--- Recording Experiments ---\n");
  discovery.recordExperiment("combine sword and shield");
  discovery.recordExperiment("use key on door");
  discovery.recordExperiment("mix red potion with blue crystal");

  console.log("Experiment count:", discovery.getExperimentCount());
  console.log("Curiosity score:", discovery.getCuriosityScore());

  // Check for hints
  console.log("\n--- Checking for Hints ---\n");
  const hintCheck = discovery.shouldHintAtSecret();
  if (hintCheck.should) {
    console.log("Hint:", hintCheck.hint);
  }

  // Display stats
  console.log("\n--- Discovery Stats ---\n");
  console.log(discovery.getStats());

  // Show discoveries
  console.log("\n--- All Discoveries ---\n");
  discovery.getDiscoveries().forEach((d) => {
    console.log(`[${d.rarity.toUpperCase()}] ${d.name}: ${d.description}`);
  });
}

// ============================================================================
// DEMO 6: Full Orchestrator Integration
// ============================================================================

async function demoFullOrchestrator() {
  console.log("\n=== FULL ORCHESTRATOR DEMO ===\n");

  const orchestrator = new ZorkAIOrchestrator();

  console.log("Initializing AI Engine...");
  const ready = await orchestrator.initialize();

  if (!ready) {
    console.log("❌ Gemini Nano not available");
    console.log("Enable it in chrome://flags:");
    console.log("- Prompt API for Gemini Nano");
    console.log("- Enables optimization guide on device");
    return;
  }

  console.log("✓ AI Engine ready!\n");

  // Simulate game session
  const commands = [
    "look around",
    "go north",
    "examine door",
    "open door",
    "go through door",
  ];

  console.log("--- Simulating Game Session ---\n");

  for (const command of commands) {
    console.log(`> ${command}`);

    try {
      // Non-streaming for demo
      const response = await orchestrator.processCommand(command);
      console.log(response.text);
      console.log("");

      if (response.metadata.discoveredSecret) {
        console.log(
          `🎉 Secret discovered: ${response.metadata.discoveredSecret}\n`,
        );
      }
    } catch (error) {
      console.error("Error:", error.message);
    }
  }

  // Show stats
  console.log("\n--- Final Stats ---\n");
  const stats = orchestrator.getStats();
  console.log("Moves:", stats.moves);
  console.log("Score:", stats.score);
  console.log("Health:", stats.health);
  console.log("Tension:", stats.narrative.tension);
  console.log("Mystery Level:", stats.narrative.mysteryLevel);
  console.log("Unique Phrases:", stats.variation.uniquePhrases);

  // Cleanup
  orchestrator.destroy();
}

// ============================================================================
// RUN ALL DEMOS
// ============================================================================

export async function runAllDemos() {
  console.log("╔════════════════════════════════════════════════════════╗");
  console.log("║   ZORK: INFINITE EDITION - AI ENGINE DEMO             ║");
  console.log("║   Showcasing the power of the custom Gemini Nano      ║");
  console.log("╚════════════════════════════════════════════════════════╝\n");

  // Run demos that don't require AI
  demoNarrativeDirector();
  demoVariationEngine();
  demoSuspenseManager();
  demoMemoryGraph();
  demoDiscoverySystem();

  // Run full orchestrator demo (requires Gemini Nano)
  await demoFullOrchestrator();

  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log("║   DEMO COMPLETE!                                       ║");
  console.log("║   The engine is ready for integration.                 ║");
  console.log("╚════════════════════════════════════════════════════════╝");
}

// Run if executed directly
if (require.main === module) {
  runAllDemos().catch(console.error);
}
