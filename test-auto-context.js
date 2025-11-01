// Test script to verify auto context functionality
async function testAutoContext() {
  console.log('🧪 Testing Auto Context Engine...');
  
  try {
    // Test page context request
    console.log('📄 Testing page context request...');
    const pageResponse = await chrome.runtime.sendMessage({
      kind: "PAGE_CONTEXT_REQUEST",
      requestId: crypto.randomUUID(),
      payload: {},
    });
    
    console.log('Page context response:', pageResponse);
    
    // Test tabs context request
    console.log('📑 Testing tabs context request...');
    const tabsResponse = await chrome.runtime.sendMessage({
      kind: "TAB_CONTEXT_REQUEST", 
      requestId: crypto.randomUUID(),
      payload: { maxTabs: 3 },
    });
    
    console.log('Tabs context response:', tabsResponse);
    
    // Test selection context request
    console.log('📝 Testing selection context request...');
    const selectionResponse = await chrome.runtime.sendMessage({
      kind: "SELECTION_CONTEXT_REQUEST",
      requestId: crypto.randomUUID(),
      payload: {},
    });
    
    console.log('Selection context response:', selectionResponse);
    
    // Test input context request
    console.log('⌨️ Testing input context request...');
    const inputResponse = await chrome.runtime.sendMessage({
      kind: "INPUT_CONTEXT_REQUEST",
      requestId: crypto.randomUUID(),
      payload: {},
    });
    
    console.log('Input context response:', inputResponse);
    
    console.log('✅ Auto context test completed');
    
  } catch (error) {
    console.error('❌ Auto context test failed:', error);
  }
}

// Run the test
testAutoContext();
