# Chunk-Level RAG Implementation for Ask Mode

## Overview
This document describes the implementation of chunk-level Retrieval-Augmented Generation (RAG) in the Ask mode pipeline, enabling Ask mode to leverage pocket content through semantic search when a `pocketId` is provided.

## Changes Made

### 1. Mode-Aware Processor (`src/background/mode-aware-processor.ts`)

#### Updated `buildAskPipeline` method:
- **Added RAG support**: Ask mode now supports `pocketId` parameter to enable RAG retrieval
- **Dynamic token budgets**:
  - 6000 tokens when `pocketId` is provided (RAG enabled)
  - 4000 tokens when no `pocketId` (standard Ask mode)
- **Graceful fallback**: Adds a user-friendly message when no relevant content is found in the specified pocket
- **Enhanced logging**: Added detailed logging for pocket presence and RAG status

#### Key Features:
```typescript
// If pocketId is provided, include RAG context in Ask mode
const maxTokens = request.pocketId ? 6000 : 4000;

contextBundle = await contextBundleBuilder.buildContextBundle({
  mode: "ask",
  query: request.prompt,
  pocketId: request.pocketId, // Enable RAG if pocketId provided
  conversationId: request.conversationId,
  maxTokens,
});
```

### 2. Context Bundle Builder (`src/background/context-bundle.ts`)

#### Updated `buildContextBundle` method:
- **Ask mode RAG support**: Added pocket context retrieval when `pocketId` is provided in Ask mode
- **Priority ordering**: In Ask mode, pockets are now retrieved after history but before page context

#### Enhanced `addPocketsContext` method:
- **Improved logging**: Added detailed logging for RAG search operations
- **Pocket scoping enforcement**: Properly passes `pocketId` to vector search service
- **Budget management**: Enhanced token budget tracking with warnings when content is truncated
- **Graceful error handling**: Better error messages and fallback behavior
- **Relevance tracking**: Logs average relevance scores for retrieved chunks

#### Key Features:
```typescript
// Support RAG in Ask mode when pocketId is provided
if (options.pocketId) {
  remainingTokens = await this.addPocketsContext(bundle, options, remainingTokens);
}
```

### 3. Test Coverage

#### New Test File: `src/background/context-bundle-rag.test.ts`
Comprehensive test suite with 19 tests covering:

**Ask Mode RAG Integration (3 tests)**
- RAG results inclusion when pocketId is provided
- RAG skipping when no pocketId
- Correct priority ordering (history before pockets)

**Pocket Scoping (2 tests)**
- Scoped search when specific pocketId provided
- All-pocket search when no pocketId in AI Pocket mode

**Empty Pocket Fallback (3 tests)**
- Graceful handling of empty search results
- Continued processing of other signals when RAG returns empty
- Error handling for RAG service failures

**Context Window Budget (6 tests)**
- Token budget enforcement with large content
- Correct budget allocation (6000 vs 4000 tokens)
- Accurate token usage tracking
- Content truncation when budget exhausted

**Context Assembly (3 tests)**
- Multi-signal assembly (pockets, history, page)
- Relevance score inclusion
- Correct ordering by relevance

**Cache Behavior (3 tests)**
- Result caching including pocket content
- Cache invalidation on query changes
- Cache invalidation on pocketId changes

#### Enhanced Test File: `src/background/mode-aware-processor.test.ts`
Added 7 new tests for Ask mode with RAG:

**Ask Mode with Chunk-Level RAG**
- RAG enablement when pocketId provided
- Budget allocation (6000 vs 4000 tokens)
- Empty pocket handling
- Fallback messaging
- Pocket scoping enforcement
- Budget respect with RAG
- Truncated context handling

#### Enhanced Test File: `src/background/streaming-handler.test.ts`
Added 13 new tests for streaming with RAG:

**Streaming with Chunk-Level RAG**
- Ask mode RAG context in streaming requests
- Context window budget tracking
- Empty pocket handling in streams
- Context assembly tracking with signals
- Pocket scoping in streaming

## Implementation Details

### Pocket Scoping
When a `pocketId` is provided:
- Vector search is scoped to only search within that specific pocket
- Ensures users get relevant content from the intended source
- Improves search performance by reducing search space

### Context Window Budgets
The implementation enforces strict token budgets:
- **Ask mode without RAG**: 4000 tokens (standard conversational budget)
- **Ask mode with RAG**: 6000 tokens (expanded for content context)
- **AI Pocket mode**: 6000 tokens (full RAG mode)

Budget allocation priority in Ask mode with RAG:
1. Conversation history (highest priority)
2. Pocket content via RAG
3. Page context
4. Other signals (selection, input)

### Graceful Fallback
The system handles empty or missing content gracefully:
- Logs warnings when no relevant content is found
- Adds user-friendly messages to context
- Continues processing with available signals
- Never throws errors that interrupt the conversation flow

### Error Handling
- Vector search failures fall back to keyword search (in vector-search-service)
- RAG service errors are logged but don't break the pipeline
- Empty results are handled without errors
- Token budget overruns trigger truncation with logging

## Usage Example

### Ask Mode with RAG
```typescript
const request: ModeAwareRequest = {
  prompt: "What does my research say about AI?",
  mode: "ask",
  pocketId: "research-pocket-123", // Enable RAG for this pocket
  autoContext: true,
  conversationId: "conv-456",
};

// This will:
// 1. Load conversation history
// 2. Perform semantic search in pocket-123
// 3. Retrieve top 5 relevant chunks
// 4. Assemble context with 6000 token budget
// 5. Generate response with full context
```

### Ask Mode without RAG (Standard)
```typescript
const request: ModeAwareRequest = {
  prompt: "General question about AI",
  mode: "ask",
  autoContext: true,
  conversationId: "conv-456",
};

// This will:
// 1. Load conversation history
// 2. Skip RAG retrieval (no pocketId)
// 3. Use 4000 token budget
// 4. Generate response with conversation context only
```

## Performance Considerations

### Token Usage
- Token estimation uses 4 characters ≈ 1 token approximation
- Actual token usage tracked per signal type
- Budget enforcement prevents context overflow

### Caching
- Context bundles are cached for 5 minutes
- Cache key includes: mode, query, pocketId, conversationId
- Automatic cache cleanup on TTL expiration
- Cache invalidation on parameter changes

### Search Optimization
- Top 5 chunks retrieved by default (configurable)
- Relevance threshold of 0.3 for semantic matches
- Keyword fallback when embeddings unavailable
- Efficient pocket scoping reduces search overhead

## Testing Results

All tests passing:
- **mode-aware-processor.test.ts**: 18 tests ✓
- **context-bundle-rag.test.ts**: 19 tests ✓
- **streaming-handler.test.ts**: 25 tests ✓

Total: 62 tests covering RAG functionality ✓

## Future Enhancements

1. **Adaptive Chunk Retrieval**: Dynamically adjust number of chunks based on relevance scores
2. **Cross-Pocket Search**: Enable searching across multiple pockets with proper ranking
3. **Chunk Highlighting**: Provide UI feedback showing which chunks were used
4. **Relevance Feedback**: Allow users to rate relevance of retrieved content
5. **Budget Optimization**: Intelligently allocate tokens based on query complexity

## Related Requirements

- **Requirement 8.2.5**: Ask mode pipeline implementation ✓
- **Requirement 8.3.1, 8.3.2, 8.3.3**: Vector similarity search and content retrieval ✓
- **Requirement 36, 37, 38**: Context bundle and signal integration ✓

## Conclusion

The chunk-level RAG implementation successfully integrates semantic search capabilities into Ask mode, providing users with a flexible conversational experience that can optionally leverage their saved pocket content. The implementation maintains strict budget controls, handles errors gracefully, and provides comprehensive test coverage.
