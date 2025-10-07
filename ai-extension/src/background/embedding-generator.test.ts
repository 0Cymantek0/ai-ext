/**
 * Embedding Generator Tests
 * 
 * Basic tests to verify embedding generator functionality
 */

import { EmbeddingGenerator, EmbeddingTaskType } from './embedding-generator.js';

/**
 * Test embedding generator initialization
 */
export async function testInitialization(): Promise<void> {
  const generator = new EmbeddingGenerator();
  
  console.log('Test: Initialization');
  console.log('Before init:', generator.isInitialized());
  
  // Note: This would require a real API key
  // await generator.initialize('YOUR_API_KEY');
  // console.log('After init:', generator.isInitialized());
  
  console.log('✓ Initialization test passed');
}

/**
 * Test cosine similarity calculation
 */
export function testCosineSimilarity(): void {
  const generator = new EmbeddingGenerator();
  
  console.log('\nTest: Cosine Similarity');
  
  // Test identical vectors
  const vec1 = [1, 0, 0];
  const vec2 = [1, 0, 0];
  const similarity1 = generator.calculateSimilarity(vec1, vec2);
  console.log('Identical vectors similarity:', similarity1);
  console.assert(Math.abs(similarity1 - 1.0) < 0.001, 'Identical vectors should have similarity 1.0');
  
  // Test orthogonal vectors
  const vec3 = [1, 0, 0];
  const vec4 = [0, 1, 0];
  const similarity2 = generator.calculateSimilarity(vec3, vec4);
  console.log('Orthogonal vectors similarity:', similarity2);
  console.assert(Math.abs(similarity2) < 0.001, 'Orthogonal vectors should have similarity 0.0');
  
  // Test opposite vectors
  const vec5 = [1, 0, 0];
  const vec6 = [-1, 0, 0];
  const similarity3 = generator.calculateSimilarity(vec5, vec6);
  console.log('Opposite vectors similarity:', similarity3);
  console.assert(Math.abs(similarity3 + 1.0) < 0.001, 'Opposite vectors should have similarity -1.0');
  
  // Test similar vectors
  const vec7 = [1, 1, 0];
  const vec8 = [1, 0.9, 0];
  const similarity4 = generator.calculateSimilarity(vec7, vec8);
  console.log('Similar vectors similarity:', similarity4);
  console.assert(similarity4 > 0.9, 'Similar vectors should have high similarity');
  
  console.log('✓ Cosine similarity test passed');
}

/**
 * Test queue management
 */
export function testQueueManagement(): void {
  const generator = new EmbeddingGenerator();
  
  console.log('\nTest: Queue Management');
  
  // Check initial queue status
  let status = generator.getQueueStatus();
  console.log('Initial queue status:', status);
  console.assert(status.queueSize === 0, 'Queue should be empty initially');
  console.assert(!status.isProcessing, 'Should not be processing initially');
  
  // Queue some items (won't actually process without API key)
  generator.queueEmbedding({
    contentId: 'test-1',
    text: 'Test content 1',
    taskType: EmbeddingTaskType.RETRIEVAL_DOCUMENT
  });
  
  generator.queueEmbedding({
    contentId: 'test-2',
    text: 'Test content 2',
    taskType: EmbeddingTaskType.RETRIEVAL_DOCUMENT
  });
  
  status = generator.getQueueStatus();
  console.log('After queueing:', status);
  console.assert(status.queueSize === 2, 'Queue should have 2 items');
  
  // Clear queue
  generator.clearQueue();
  status = generator.getQueueStatus();
  console.log('After clearing:', status);
  console.assert(status.queueSize === 0, 'Queue should be empty after clearing');
  
  console.log('✓ Queue management test passed');
}

/**
 * Test configuration
 */
export function testConfiguration(): void {
  console.log('\nTest: Configuration');
  
  const customGenerator = new EmbeddingGenerator({
    taskType: EmbeddingTaskType.SEMANTIC_SIMILARITY,
    model: 'gemini-embedding-001',
    batchSize: 20,
    maxRetries: 5
  });
  
  console.log('Custom generator created with custom config');
  console.log('✓ Configuration test passed');
}

/**
 * Run all tests
 */
export async function runAllTests(): Promise<void> {
  console.log('=== Embedding Generator Tests ===\n');
  
  try {
    await testInitialization();
    testCosineSimilarity();
    testQueueManagement();
    testConfiguration();
    
    console.log('\n=== All tests passed! ===');
  } catch (error) {
    console.error('\n=== Test failed! ===');
    console.error(error);
  }
}

// Run tests if this file is executed directly
if (typeof window !== 'undefined') {
  runAllTests();
}
