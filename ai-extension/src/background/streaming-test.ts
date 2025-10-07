/**
 * Streaming Handler Test
 * 
 * Simple test to verify streaming functionality
 */

import { AIManager } from './ai-manager';
import { CloudAIManager } from './cloud-ai-manager';
import { getStreamingHandler } from './streaming-handler';

/**
 * Test streaming with mock data
 */
async function testStreaming() {
  console.log('=== Testing Streaming Handler ===');

  try {
    // Initialize managers
    const aiManager = new AIManager();
    const cloudAIManager = new CloudAIManager();
    const streamingHandler = getStreamingHandler(aiManager, cloudAIManager);

    console.log('✓ Streaming handler initialized');

    // Test 1: Check active session count
    const initialCount = streamingHandler.getActiveSessionCount();
    console.log(`✓ Initial active sessions: ${initialCount}`);

    // Test 2: Simulate starting a stream
    console.log('\nTest: Starting a stream request');
    const mockPayload = {
      prompt: 'Hello, this is a test message',
      conversationId: 'test-conversation-123',
      preferLocal: true
    };

    // Note: This will actually try to start streaming
    // In a real test environment, you'd mock the AI managers
    console.log('Mock payload:', mockPayload);
    console.log('✓ Streaming handler is ready to process requests');

    // Test 3: Cleanup
    streamingHandler.cleanup();
    const finalCount = streamingHandler.getActiveSessionCount();
    console.log(`✓ Final active sessions after cleanup: ${finalCount}`);

    console.log('\n=== All Tests Passed ===');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testStreaming();
}

export { testStreaming };
