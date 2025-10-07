/**
 * Hybrid AI Engine Integration Example
 * 
 * This file demonstrates how to use the Hybrid AI Engine in various scenarios.
 * It shows task classification, device capability detection, and intelligent
 * processing location selection.
 */

import { aiManager } from './ai-manager';
import {
  createHybridAIEngine,
  TaskOperation,
  TaskComplexity,
  ProcessingLocation,
  type Task,
  type ProcessingDecision
} from './hybrid-ai-engine';

/**
 * Example 1: Basic Content Processing
 * Process content with automatic location selection
 */
async function example1_BasicProcessing() {
  console.log('=== Example 1: Basic Content Processing ===\n');

  const hybridEngine = createHybridAIEngine(aiManager);

  // Simple summarization task
  const task: Task = {
    content: {
      text: 'Artificial intelligence is transforming how we interact with technology. ' +
            'From voice assistants to recommendation systems, AI is becoming increasingly ' +
            'integrated into our daily lives.'
    },
    operation: TaskOperation.SUMMARIZE
  };

  try {
    const response = await hybridEngine.processContent(task);
    
    console.log('✓ Processing completed');
    console.log('Source:', response.source);
    console.log('Result:', response.result);
    console.log('Processing time:', response.processingTime.toFixed(2), 'ms');
    console.log('Tokens used:', response.tokensUsed);
  } catch (error) {
    console.error('✗ Processing failed:', error);
  }
}

/**
 * Example 2: Processing with Consent Handling
 * Handle cloud processing consent requests
 */
async function example2_ConsentHandling() {
  console.log('\n=== Example 2: Processing with Consent Handling ===\n');

  const hybridEngine = createHybridAIEngine(aiManager);

  // Complex analysis task that may require cloud
  const task: Task = {
    content: {
      text: 'Lorem ipsum dolor sit amet...'.repeat(200) // Large content
    },
    operation: TaskOperation.ANALYZE,
    context: 'Analyze the sentiment and key themes in this document'
  };

  try {
    const response = await hybridEngine.processContent(
      task,
      { preferLocal: true },
      async (decision: ProcessingDecision) => {
        // This callback is called when cloud processing is required
        console.log('\n📋 Cloud Processing Required:');
        console.log('  Model:', decision.location);
        console.log('  Reason:', decision.reason);
        console.log('  Complexity:', decision.complexity);
        console.log('  Estimated tokens:', decision.estimatedTokens);
        
        // In a real application, show a consent dialog to the user
        // For this example, we'll automatically grant consent
        console.log('  User consent: GRANTED\n');
        return true;
      }
    );

    console.log('✓ Processing completed with consent');
    console.log('Source:', response.source);
  } catch (error) {
    console.error('✗ Processing failed:', error);
  }
}

/**
 * Example 3: Manual Decision Making
 * Get processing decision without executing
 */
async function example3_ManualDecision() {
  console.log('\n=== Example 3: Manual Decision Making ===\n');

  const hybridEngine = createHybridAIEngine(aiManager);

  const tasks: Task[] = [
    {
      content: { text: 'Short text' },
      operation: TaskOperation.SUMMARIZE
    },
    {
      content: { text: 'Medium length text...'.repeat(50) },
      operation: TaskOperation.TRANSLATE
    },
    {
      content: { text: 'Very long document...'.repeat(200) },
      operation: TaskOperation.ANALYZE
    }
  ];

  for (const task of tasks) {
    const decision = await hybridEngine.determineProcessingLocation(task);
    
    console.log('Task:', task.operation);
    console.log('  Complexity:', decision.complexity);
    console.log('  Location:', decision.location);
    console.log('  Reason:', decision.reason);
    console.log('  Requires consent:', decision.requiresConsent);
    console.log('  Estimated tokens:', decision.estimatedTokens);
    console.log('');
  }
}

/**
 * Example 4: Device Capability Detection
 * Check and display device capabilities
 */
async function example4_DeviceCapabilities() {
  console.log('\n=== Example 4: Device Capability Detection ===\n');

  const hybridEngine = createHybridAIEngine(aiManager);

  const capabilities = await hybridEngine.getCurrentCapabilities();

  console.log('Device Capabilities:');
  console.log('  Memory available:', capabilities.memory.toFixed(0), 'MB');
  console.log('  CPU cores:', capabilities.cpuCores);
  console.log('  Online:', capabilities.isOnline ? 'Yes' : 'No');
  console.log('  Connection type:', capabilities.connectionType);
  console.log('  Gemini Nano available:', capabilities.geminiNanoAvailable ? 'Yes' : 'No');
  
  if (capabilities.batteryLevel !== undefined) {
    console.log('  Battery level:', capabilities.batteryLevel.toFixed(0), '%');
    console.log('  Charging:', capabilities.isCharging ? 'Yes' : 'No');
  }

  // Get performance profile
  const detector = hybridEngine.getCapabilityDetector();
  const profile = detector.getPerformanceProfile(capabilities);
  console.log('  Performance profile:', profile);
}

/**
 * Example 5: Task Classification
 * Classify different types of tasks
 */
async function example5_TaskClassification() {
  console.log('\n=== Example 5: Task Classification ===\n');

  const hybridEngine = createHybridAIEngine(aiManager);
  const classifier = hybridEngine.getTaskClassifier();

  const testCases = [
    {
      name: 'Short text',
      task: {
        content: { text: 'Hello world' },
        operation: TaskOperation.SUMMARIZE
      }
    },
    {
      name: 'Medium text',
      task: {
        content: { text: 'Lorem ipsum...'.repeat(100) },
        operation: TaskOperation.TRANSLATE
      }
    },
    {
      name: 'Long document',
      task: {
        content: { text: 'Very long content...'.repeat(500) },
        operation: TaskOperation.ANALYZE
      }
    },
    {
      name: 'Image processing',
      task: {
        content: { image: new Blob(['fake-image-data']) },
        operation: TaskOperation.ALT_TEXT
      }
    }
  ];

  for (const testCase of testCases) {
    const complexity = classifier.classifyTask(testCase.task);
    const tokens = classifier.estimateTokens(testCase.task.content);
    
    console.log(`${testCase.name}:`);
    console.log('  Complexity:', complexity);
    console.log('  Estimated tokens:', tokens);
    console.log('');
  }
}

/**
 * Example 6: Fallback Handling
 * Demonstrate automatic fallback to local processing
 */
async function example6_FallbackHandling() {
  console.log('\n=== Example 6: Fallback Handling ===\n');

  const hybridEngine = createHybridAIEngine(aiManager);

  // Task that might require cloud but can fallback to local
  const task: Task = {
    content: {
      text: 'Moderate length content that could be processed locally or in cloud...'
    },
    operation: TaskOperation.ENHANCE
  };

  try {
    const response = await hybridEngine.processContent(
      task,
      { preferLocal: true },
      async (decision: ProcessingDecision) => {
        console.log('Cloud processing requested:', decision.location);
        console.log('User denies consent - attempting fallback...\n');
        
        // User denies consent
        return false;
      }
    );

    console.log('✓ Fallback successful');
    console.log('Processed by:', response.source);
    console.log('Result:', response.result.substring(0, 100) + '...');
  } catch (error) {
    console.error('✗ Fallback failed:', error);
  }
}

/**
 * Example 7: Different Task Operations
 * Process various types of operations
 */
async function example7_DifferentOperations() {
  console.log('\n=== Example 7: Different Task Operations ===\n');

  const hybridEngine = createHybridAIEngine(aiManager);

  const operations = [
    {
      operation: TaskOperation.SUMMARIZE,
      content: 'Long article about technology trends...'
    },
    {
      operation: TaskOperation.TRANSLATE,
      content: 'Hello, how are you today?'
    },
    {
      operation: TaskOperation.ENHANCE,
      content: 'This is ok text that could be better'
    },
    {
      operation: TaskOperation.ANALYZE,
      content: 'Complex data requiring deep analysis...'
    }
  ];

  for (const op of operations) {
    const task: Task = {
      content: { text: op.content },
      operation: op.operation
    };

    const decision = await hybridEngine.determineProcessingLocation(task);
    
    console.log(`Operation: ${op.operation}`);
    console.log('  Recommended location:', decision.location);
    console.log('  Complexity:', decision.complexity);
    console.log('');
  }
}

/**
 * Example 8: Performance Monitoring
 * Track processing performance across multiple tasks
 */
async function example8_PerformanceMonitoring() {
  console.log('\n=== Example 8: Performance Monitoring ===\n');

  const hybridEngine = createHybridAIEngine(aiManager);

  const tasks: Task[] = Array.from({ length: 5 }, (_, i) => ({
    content: { text: `Task ${i + 1}: Process this content...` },
    operation: TaskOperation.SUMMARIZE
  }));

  const results = [];

  for (const task of tasks) {
    try {
      const startTime = performance.now();
      const response = await hybridEngine.processContent(task);
      const totalTime = performance.now() - startTime;

      results.push({
        source: response.source,
        processingTime: response.processingTime,
        totalTime,
        tokensUsed: response.tokensUsed
      });
    } catch (error) {
      console.error('Task failed:', error);
    }
  }

  // Calculate statistics
  const avgProcessingTime = results.reduce((sum, r) => sum + r.processingTime, 0) / results.length;
  const avgTotalTime = results.reduce((sum, r) => sum + r.totalTime, 0) / results.length;
  const totalTokens = results.reduce((sum, r) => sum + r.tokensUsed, 0);

  console.log('Performance Statistics:');
  console.log('  Tasks processed:', results.length);
  console.log('  Avg processing time:', avgProcessingTime.toFixed(2), 'ms');
  console.log('  Avg total time:', avgTotalTime.toFixed(2), 'ms');
  console.log('  Total tokens used:', totalTokens);
  console.log('  Sources:', results.map(r => r.source).join(', '));
}

/**
 * Example 9: Capability-Based Decision Making
 * Make decisions based on current device state
 */
async function example9_CapabilityBasedDecisions() {
  console.log('\n=== Example 9: Capability-Based Decision Making ===\n');

  const hybridEngine = createHybridAIEngine(aiManager);
  const capabilities = await hybridEngine.getCurrentCapabilities();

  console.log('Current Device State:');
  console.log('  Memory:', capabilities.memory.toFixed(0), 'MB');
  console.log('  Battery:', capabilities.batteryLevel?.toFixed(0) ?? 'N/A', '%');
  console.log('  Online:', capabilities.isOnline);
  console.log('');

  // Adjust processing strategy based on capabilities
  const task: Task = {
    content: { text: 'Content to process...' },
    operation: TaskOperation.SUMMARIZE
  };

  let preferLocal = true;

  // Prefer cloud if device is low on resources
  if (capabilities.memory < 500) {
    console.log('⚠️  Low memory detected - preferring cloud processing');
    preferLocal = false;
  }

  if (capabilities.batteryLevel && capabilities.batteryLevel < 20 && !capabilities.isCharging) {
    console.log('⚠️  Low battery detected - preferring cloud processing');
    preferLocal = false;
  }

  if (!capabilities.isOnline) {
    console.log('⚠️  Offline - forcing local processing');
    preferLocal = true;
  }

  const decision = await hybridEngine.determineProcessingLocation(task, { preferLocal });
  console.log('\nDecision:', decision.location);
  console.log('Reason:', decision.reason);
}

/**
 * Run all examples
 */
export async function runAllExamples() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║     Hybrid AI Engine Integration Examples             ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  try {
    await example1_BasicProcessing();
    await example2_ConsentHandling();
    await example3_ManualDecision();
    await example4_DeviceCapabilities();
    await example5_TaskClassification();
    await example6_FallbackHandling();
    await example7_DifferentOperations();
    await example8_PerformanceMonitoring();
    await example9_CapabilityBasedDecisions();

    console.log('\n✓ All examples completed successfully!');
  } catch (error) {
    console.error('\n✗ Example execution failed:', error);
  }
}

// Export individual examples for selective testing
export {
  example1_BasicProcessing,
  example2_ConsentHandling,
  example3_ManualDecision,
  example4_DeviceCapabilities,
  example5_TaskClassification,
  example6_FallbackHandling,
  example7_DifferentOperations,
  example8_PerformanceMonitoring,
  example9_CapabilityBasedDecisions
};
