# Vector Indexing Regression Tests

This directory contains comprehensive end-to-end regression tests for the vector indexing workflow used in the RAG (Retrieval-Augmented Generation) pipeline.

## Overview

The vector indexing system consists of several components that work together:

1. **Text Chunker** (`text-chunker.ts`) - Splits large text into manageable chunks
2. **Embedding Engine** - Generates vector embeddings for text (via Gemini API)
3. **Vector Store** - Stores and retrieves embeddings (IndexedDB)
4. **Indexing Queue** (`vector-indexing-queue.ts`) - Manages background indexing jobs

## Test Files

### `vector-indexing-e2e.test.ts`

Comprehensive end-to-end regression test suite covering:

#### Text Chunker Tests

- Basic chunking of small and large text
- Sentence and word boundary respect
- Chunk overlap handling
- Unicode and special character support
- Edge cases (empty text, very long words, etc.)

#### Vector Indexing Queue Tests

- **Create Flow**: New content indexing
- **Update Flow**: Re-indexing modified content
- **Delete Flow**: Removing embeddings
- **Batch Processing**: Parallel job processing
- **Priority Handling**: High/normal/low priority queues
- **Rate Limit Handling**: Exponential backoff and retry logic
- **Error Handling**: Retry with max attempts
- **UI Event Emission**: Progress notifications
- **Queue Statistics**: Tracking metrics

#### End-to-End Integration Tests

- Complete indexing workflow from text → chunks → embeddings
- Full lifecycle: create → update → delete

### `vector-indexing-fixtures.ts`

Reusable test utilities and fixtures:

#### Mock Factories

- `createMockContent()` - Generate test content
- `createLargeContent()` - Generate large text for chunking tests
- `createMockEmbedding()` - Generate mock embeddings
- `createNormalizedEmbedding()` - Generate normalized vectors
- `createSimilarEmbeddings()` - Generate similar vectors for similarity testing

#### Test Utilities

- `MockEmbeddingGenerator` - Controllable embedding generation with latency/failure simulation
- `MockMessageRouter` - Track UI event emissions
- `MockIndexedDBManager` - In-memory storage for testing
- `waitFor()` - Async condition waiting helper
- `cosineSimilarity()` - Vector similarity calculation
- `assertValidEmbedding()` - Embedding validation

## Running Tests

```bash
# Run all vector indexing tests
npm test -- vector-indexing-e2e.test.ts

# Run with verbose output
npm test -- vector-indexing-e2e.test.ts --reporter=verbose

# Run specific test suite
npm test -- vector-indexing-e2e.test.ts -t "Text Chunker"

# Run with coverage
npm test -- vector-indexing-e2e.test.ts --coverage
```

## Test Coverage

The test suite provides comprehensive coverage of:

### Edge Cases

- ✅ Empty and whitespace-only text
- ✅ Very large text requiring multiple chunks
- ✅ Unicode characters and special symbols
- ✅ Extremely long words
- ✅ Missing or invalid content
- ✅ Concurrent job processing
- ✅ Network failures and retries

### Rate Limiting

- ✅ Exponential backoff on 429 errors
- ✅ Configurable retry delays
- ✅ Max retry limits
- ✅ Mixed success/failure scenarios

### UI Events

- ✅ Pending status emission
- ✅ Processing progress updates
- ✅ Completion notifications
- ✅ Error details in failure events
- ✅ Chunk progress tracking

### Performance

- ✅ Batch size configuration
- ✅ Processing interval tuning
- ✅ Queue statistics tracking
- ✅ Average processing time metrics

## Adding New Tests

When adding new tests:

1. Use the fixtures from `vector-indexing-fixtures.ts` for consistency
2. Clear mock state in `beforeEach`
3. Clean up resources in `afterEach`
4. Use `waitFor()` for async assertions
5. Set appropriate timeouts for long-running tests
6. Mock external dependencies (chrome APIs, embedding generation)

Example:

```typescript
it("should handle new edge case", async () => {
  const content = createMockContent({
    /* custom props */
  });
  await mockDB.saveContent(content);

  await queue.enqueueContent(content.id, IndexingOperation.CREATE);
  await waitFor(() => queue.getStats().isProcessing === false, 5000);

  // Assertions
  expect(queue.getStats().jobsProcessed).toBe(1);
});
```

## Architecture Notes

### Text Chunking Strategy

- Default chunk size: 1000 characters
- Default overlap: 100 characters
- Respects sentence boundaries when possible
- Falls back to word boundaries
- Maintains chunk metadata (indices, position)

### Queue Processing

- Priority-based job ordering (high > normal > low)
- Batch processing for efficiency
- Automatic retry with exponential backoff
- Separate retry counters for rate-limit vs. general failures
- Rate limit detection and handling with configurable backoff
- Progress tracking with accurate chunk counts
- UI notifications for all stages (pending, processing, completed, failed)

### Embedding Generation

- Uses Gemini embedding model (text-embedding-004)
- Handles rate limiting (429 errors)
- Caches embeddings in IndexedDB
- Supports chunked content (multiple embeddings per content item)

## Recent Improvements

- ✅ Separate retry counters for rate-limit vs. general failures to ensure proper retry limits
- ✅ Accurate chunk count tracking in progress events
- ✅ Enhanced error handling for rate-limit scenarios
- ✅ Added TODO notes for potential migration to established libraries (LangChain, BullMQ)

## Future Enhancements

Potential areas for expansion:

- [ ] Migration to LangChain.js for text splitting (RecursiveCharacterTextSplitter)
- [ ] Migration to BullMQ or similar for robust queue management
- [ ] Performance benchmarks for large datasets
- [ ] Memory usage profiling
- [ ] Incremental indexing tests
- [ ] Search relevance scoring tests
- [ ] Multi-modal content support
- [ ] Distributed queue processing
- [ ] Embedding model versioning
- [ ] Index optimization strategies

## Troubleshooting

### Common Issues

**Tests timing out**

- Increase timeout values for slower environments
- Check mock latency settings
- Verify async cleanup in `afterEach`

**Flaky tests**

- Ensure proper mock reset in `beforeEach`
- Use `waitFor()` instead of fixed delays
- Avoid race conditions with proper synchronization

**Memory leaks**

- Clear queues after tests
- Reset mock state
- Clean up event listeners

## Related Documentation

- [Vector Search Service](../src/background/vector-search-service.ts)
- [Hybrid AI Engine](../src/background/hybrid-ai-engine.ts)
- [IndexedDB Manager](../src/background/indexeddb-manager.ts)
- [Text Chunker](../src/background/text-chunker.ts)
