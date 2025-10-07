/**
 * Simple test to verify cloud AI manager can be imported and initialized
 */

import { CloudAIManager, GeminiModel } from './cloud-ai-manager';

// Test that the module exports work correctly
export function testCloudAIImports() {
  console.log('Testing Cloud AI Manager imports...');
  
  // Test CloudAIManager class exists
  const manager = new CloudAIManager();
  console.log('✓ CloudAIManager instantiated');
  
  // Test GeminiModel enum exists
  console.log('✓ GeminiModel enum:', {
    FLASH: GeminiModel.FLASH,
    PRO: GeminiModel.PRO,
    FLASH_LITE: GeminiModel.FLASH_LITE
  });
  
  // Test availability check
  const isAvailable = manager.isAvailable();
  console.log('✓ isAvailable() method works:', isAvailable);
  
  console.log('All imports working correctly!');
}
