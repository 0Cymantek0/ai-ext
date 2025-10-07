/**
 * Embedding Generator Integration Example
 * 
 * Demonstrates how to integrate the embedding generator with the service worker
 * for automatic embedding generation when content is captured.
 * 
 * Requirements: 2.5, 7.1
 */

import { embeddingGenerator, EmbeddingTaskType } from './embedding-generator.js';
import { indexedDBManager, type CapturedContent } from './indexeddb-manager.js';
import { logger } from './monitoring.js';

/**
 * Example: Initialize embedding generator on service worker startup
 */
export async function initializeEmbeddingSystem(): Promise<void> {
  try {
    // Get API key from chrome.storage
    const { geminiApiKey } = await chrome.storage.local.get('geminiApiKey');
    
    if (!geminiApiKey) {
      logger.warn('EmbeddingIntegration', 'No API key found, embeddings disabled');
      return;
    }

    // Initialize the embedding generator
    await embeddingGenerator.initialize(geminiApiKey);
    
    logger.info('EmbeddingIntegration', 'Embedding system initialized');
  } catch (error) {
    logger.error('EmbeddingIntegration', 'Failed to initialize embedding system', { error });
  }
}

/**
 * Example: Generate embedding when content is captured
 */
export async function handleContentCaptured(content: CapturedContent): Promise<void> {
  try {
    logger.info('EmbeddingIntegration', 'Content captured, generating embedding', {
      contentId: content.id,
      type: content.type
    });

    // Queue embedding generation for background processing
    // This won't block the capture operation
    if (typeof content.content === 'string' && content.content.trim().length > 0) {
      embeddingGenerator.queueEmbedding({
        contentId: content.id,
        text: content.content,
        taskType: EmbeddingTaskType.RETRIEVAL_DOCUMENT
      });
    }
  } catch (error) {
    logger.error('EmbeddingIntegration', 'Failed to queue embedding', {
      contentId: content.id,
      error
    });
  }
}

/**
 * Example: Generate embeddings for all content in a pocket
 */
export async function generateEmbeddingsForPocket(pocketId: string): Promise<void> {
  try {
    logger.info('EmbeddingIntegration', 'Generating embeddings for pocket', { pocketId });

    // Get all content in the pocket
    const contents = await indexedDBManager.getContentByPocket(pocketId);

    if (contents.length === 0) {
      logger.info('EmbeddingIntegration', 'No content in pocket', { pocketId });
      return;
    }

    // Generate embeddings in batch
    const result = await embeddingGenerator.generateEmbeddingsForContents(contents);

    logger.info('EmbeddingIntegration', 'Pocket embeddings generated', {
      pocketId,
      successful: result.successful.length,
      failed: result.failed.length,
      processingTime: result.totalProcessingTime
    });

    // Log any failures
    if (result.failed.length > 0) {
      logger.warn('EmbeddingIntegration', 'Some embeddings failed', {
        pocketId,
        failures: result.failed
      });
    }
  } catch (error) {
    logger.error('EmbeddingIntegration', 'Failed to generate pocket embeddings', {
      pocketId,
      error
    });
  }
}

/**
 * Example: Semantic search across all pockets
 */
export async function semanticSearch(
  query: string,
  topK: number = 10
): Promise<Array<{ content: CapturedContent; similarity: number }>> {
  try {
    logger.info('EmbeddingIntegration', 'Performing semantic search', { query, topK });

    // Generate embedding for the query
    const queryResult = await embeddingGenerator.generateEmbedding(
      'query-temp-' + Date.now(),
      query,
      EmbeddingTaskType.RETRIEVAL_QUERY
    );

    // Find similar content
    const similarContent = await embeddingGenerator.findSimilarContent(
      queryResult.embedding,
      topK
    );

    // Retrieve full content for each result
    const results = await Promise.all(
      similarContent.map(async item => {
        const content = await indexedDBManager.getContent(item.contentId);
        return content ? { content, similarity: item.similarity } : null;
      })
    );

    // Filter out null results
    const validResults = results.filter(
      (r): r is { content: CapturedContent; similarity: number } => r !== null
    );

    logger.info('EmbeddingIntegration', 'Semantic search complete', {
      query,
      resultsFound: validResults.length
    });

    return validResults;
  } catch (error) {
    logger.error('EmbeddingIntegration', 'Semantic search failed', { query, error });
    throw error;
  }
}

/**
 * Example: Find related content for a given content item
 */
export async function findRelatedContent(
  contentId: string,
  topK: number = 5
): Promise<Array<{ content: CapturedContent; similarity: number }>> {
  try {
    logger.info('EmbeddingIntegration', 'Finding related content', { contentId, topK });

    // Get the embedding for the content
    const embedding = await embeddingGenerator.getEmbedding(contentId);

    if (!embedding) {
      logger.warn('EmbeddingIntegration', 'No embedding found for content', { contentId });
      return [];
    }

    // Find similar content
    const similarContent = await embeddingGenerator.findSimilarContent(
      embedding.vector,
      topK + 1 // +1 to account for the content itself
    );

    // Filter out the original content and retrieve full content
    const results = await Promise.all(
      similarContent
        .filter(item => item.contentId !== contentId)
        .slice(0, topK)
        .map(async item => {
          const content = await indexedDBManager.getContent(item.contentId);
          return content ? { content, similarity: item.similarity } : null;
        })
    );

    // Filter out null results
    const validResults = results.filter(
      (r): r is { content: CapturedContent; similarity: number } => r !== null
    );

    logger.info('EmbeddingIntegration', 'Related content found', {
      contentId,
      relatedCount: validResults.length
    });

    return validResults;
  } catch (error) {
    logger.error('EmbeddingIntegration', 'Failed to find related content', {
      contentId,
      error
    });
    throw error;
  }
}

/**
 * Example: Batch process all content without embeddings
 */
export async function processUnembeddedContent(): Promise<void> {
  try {
    logger.info('EmbeddingIntegration', 'Processing unembed content');

    // Get all pockets
    const pockets = await indexedDBManager.listPockets();

    let totalProcessed = 0;
    let totalFailed = 0;

    for (const pocket of pockets) {
      // Get all content in the pocket
      const contents = await indexedDBManager.getContentByPocket(pocket.id);

      // Filter content that doesn't have embeddings
      const unembeddedContents = await Promise.all(
        contents.map(async content => {
          const embedding = await embeddingGenerator.getEmbedding(content.id);
          return embedding ? null : content;
        })
      );

      const contentsToProcess = unembeddedContents.filter(
        (c): c is CapturedContent => c !== null
      );

      if (contentsToProcess.length === 0) {
        continue;
      }

      logger.info('EmbeddingIntegration', 'Processing pocket', {
        pocketId: pocket.id,
        unembeddedCount: contentsToProcess.length
      });

      // Generate embeddings
      const result = await embeddingGenerator.generateEmbeddingsForContents(
        contentsToProcess
      );

      totalProcessed += result.successful.length;
      totalFailed += result.failed.length;
    }

    logger.info('EmbeddingIntegration', 'Unembed content processing complete', {
      totalProcessed,
      totalFailed
    });
  } catch (error) {
    logger.error('EmbeddingIntegration', 'Failed to process unembed content', { error });
    throw error;
  }
}

/**
 * Example: Message handler for embedding-related requests
 */
export async function handleEmbeddingMessage(
  message: any,
  sender: chrome.runtime.MessageSender
): Promise<any> {
  try {
    switch (message.type) {
      case 'GENERATE_EMBEDDING':
        return await handleGenerateEmbedding(message.payload);

      case 'SEMANTIC_SEARCH':
        return await handleSemanticSearch(message.payload);

      case 'FIND_RELATED':
        return await handleFindRelated(message.payload);

      case 'PROCESS_POCKET_EMBEDDINGS':
        return await handleProcessPocketEmbeddings(message.payload);

      case 'GET_QUEUE_STATUS':
        return embeddingGenerator.getQueueStatus();

      default:
        throw new Error(`Unknown embedding message type: ${message.type}`);
    }
  } catch (error) {
    logger.error('EmbeddingIntegration', 'Message handler error', {
      type: message.type,
      error
    });
    throw error;
  }
}

async function handleGenerateEmbedding(payload: {
  contentId: string;
  text: string;
  taskType?: EmbeddingTaskType;
}): Promise<any> {
  const result = await embeddingGenerator.generateEmbedding(
    payload.contentId,
    payload.text,
    payload.taskType
  );
  return { success: true, result };
}

async function handleSemanticSearch(payload: {
  query: string;
  topK?: number;
}): Promise<any> {
  const results = await semanticSearch(payload.query, payload.topK);
  return { success: true, results };
}

async function handleFindRelated(payload: {
  contentId: string;
  topK?: number;
}): Promise<any> {
  const results = await findRelatedContent(payload.contentId, payload.topK);
  return { success: true, results };
}

async function handleProcessPocketEmbeddings(payload: {
  pocketId: string;
}): Promise<any> {
  await generateEmbeddingsForPocket(payload.pocketId);
  return { success: true };
}

/**
 * Example: Setup automatic embedding generation on content capture
 */
export function setupAutomaticEmbedding(): void {
  // Listen for content saved events
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'CONTENT_SAVED') {
      handleContentCaptured(message.payload.content).catch(error => {
        logger.error('EmbeddingIntegration', 'Auto-embedding failed', { error });
      });
    }
  });

  logger.info('EmbeddingIntegration', 'Automatic embedding setup complete');
}

/**
 * Example: Periodic background processing of queued embeddings
 */
export function startBackgroundProcessing(intervalMs: number = 60000): void {
  setInterval(() => {
    const status = embeddingGenerator.getQueueStatus();
    
    if (status.queueSize > 0 && !status.isProcessing) {
      logger.info('EmbeddingIntegration', 'Background processing triggered', {
        queueSize: status.queueSize
      });
    }
  }, intervalMs);

  logger.info('EmbeddingIntegration', 'Background processing started', {
    intervalMs
  });
}
