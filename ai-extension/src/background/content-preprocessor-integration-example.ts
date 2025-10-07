/**
 * Content Preprocessor Integration Examples
 * 
 * This file demonstrates how to use the ContentPreprocessor module
 * in various scenarios within the AI Pocket extension.
 */

import { contentPreprocessor, ContentPreprocessor, type ProcessedContent } from './content-preprocessor';

/**
 * Example 1: Basic text preprocessing
 */
async function example1_BasicTextPreprocessing() {
  console.log('=== Example 1: Basic Text Preprocessing ===');

  const rawText = `
    This is   some    text with    irregular    spacing.
    
    
    
    It has multiple   newlines and   extra spaces.
    
    It also has some\u200Bzero-width\u200Bcharacters.
  `;

  const processed = await contentPreprocessor.preprocessContent(rawText, 'text');

  console.log('Original length:', rawText.length);
  console.log('Cleaned length:', processed.cleanedText.length);
  console.log('Word count:', processed.wordCount);
  console.log('Estimated tokens:', processed.estimatedTokens);
  console.log('Cleaned text:', processed.cleanedText);
}

/**
 * Example 2: HTML content extraction
 */
async function example2_HtmlContentExtraction() {
  console.log('=== Example 2: HTML Content Extraction ===');

  const htmlContent = `
    <html>
      <head>
        <title>Article Title</title>
        <script>console.log('This should be removed');</script>
        <style>.hidden { display: none; }</style>
      </head>
      <body>
        <h1>Main Heading</h1>
        <p>This is the first paragraph with <strong>bold text</strong>.</p>
        <p>This is the second paragraph with a <a href="#">link</a>.</p>
        <div>
          <ul>
            <li>Item 1</li>
            <li>Item 2</li>
          </ul>
        </div>
      </body>
    </html>
  `;

  const processed = await contentPreprocessor.preprocessContent(htmlContent, 'html');

  console.log('Extracted text:', processed.cleanedText);
  console.log('Word count:', processed.wordCount);
}

/**
 * Example 3: Content preprocessing with summary generation
 */
async function example3_WithSummaryGeneration() {
  console.log('=== Example 3: With Summary Generation ===');

  const article = `
    Artificial Intelligence has transformed the way we interact with technology.
    Machine learning algorithms can now process vast amounts of data and identify
    patterns that humans might miss. Deep learning, a subset of machine learning,
    uses neural networks with multiple layers to learn hierarchical representations
    of data. This has led to breakthroughs in computer vision, natural language
    processing, and speech recognition. Companies across industries are adopting
    AI to improve efficiency, reduce costs, and create new products and services.
    However, the rapid advancement of AI also raises important ethical questions
    about privacy, bias, and the future of work.
  `;

  const processed = await contentPreprocessor.preprocessContent(article, 'text', {
    generateSummary: true,
    summaryLength: 'short',
  });

  console.log('Original text length:', article.length);
  console.log('Word count:', processed.wordCount);
  console.log('Estimated tokens:', processed.estimatedTokens);
  console.log('Summary:', processed.summary);
  console.log('Processing time:', processed.processingMetadata.processingTime.toFixed(2), 'ms');
}

/**
 * Example 4: Integration with content capture system
 */
async function example4_ContentCaptureIntegration() {
  console.log('=== Example 4: Content Capture Integration ===');

  // Simulated captured content from a web page
  interface CapturedContent {
    id: string;
    pocketId: string;
    type: 'text' | 'html' | 'page';
    content: string;
    metadata: {
      url: string;
      title?: string;
      capturedAt: number;
    };
  }

  const capturedContent: CapturedContent = {
    id: 'content_123',
    pocketId: 'pocket_456',
    type: 'html',
    content: '<h1>Article Title</h1><p>Article content goes here...</p>',
    metadata: {
      url: 'https://example.com/article',
      title: 'Example Article',
      capturedAt: Date.now(),
    },
  };

  // Preprocess the captured content
  const processed = await contentPreprocessor.preprocessContent(
    capturedContent.content,
    capturedContent.type === 'html' ? 'html' : 'text',
    {
      generateSummary: true,
      summaryLength: 'medium',
    }
  );

  // Create enriched content for storage
  const enrichedContent = {
    ...capturedContent,
    processedText: processed.cleanedText,
    summary: processed.summary,
    wordCount: processed.wordCount,
    estimatedTokens: processed.estimatedTokens,
    processingMetadata: processed.processingMetadata,
  };

  console.log('Enriched content ready for storage:', enrichedContent);
}

/**
 * Example 5: Batch preprocessing
 */
async function example5_BatchPreprocessing() {
  console.log('=== Example 5: Batch Preprocessing ===');

  const contents = [
    'First piece of content to process.',
    'Second piece of content with more text to analyze.',
    '<p>Third piece with <strong>HTML</strong> content.</p>',
  ];

  const results = await contentPreprocessor.batchPreprocess(contents, 'text', {
    generateSummary: false, // Skip summaries for batch processing
  });

  console.log(`Processed ${results.length} content items`);
  results.forEach((result, index) => {
    console.log(`Item ${index + 1}:`, {
      wordCount: result.wordCount,
      tokens: result.estimatedTokens,
      processingTime: result.processingMetadata.processingTime.toFixed(2) + 'ms',
    });
  });
}

/**
 * Example 6: Error handling
 */
async function example6_ErrorHandling() {
  console.log('=== Example 6: Error Handling ===');

  try {
    // Try to process very long content that exceeds token limit
    const longContent = 'word '.repeat(10000); // ~10k words, ~40k characters, ~10k tokens

    const processed = await contentPreprocessor.preprocessContent(longContent, 'text', {
      generateSummary: true,
      maxTokensForSummary: 5000, // Will skip summary generation
    });

    console.log('Content processed successfully');
    console.log('Summary generated:', !!processed.summary);
    console.log('Estimated tokens:', processed.estimatedTokens);
  } catch (error) {
    console.error('Error during preprocessing:', error);
  }
}

/**
 * Example 7: Custom preprocessing with different summary lengths
 */
async function example7_DifferentSummaryLengths() {
  console.log('=== Example 7: Different Summary Lengths ===');

  const content = `
    The Internet of Things (IoT) refers to the network of physical devices
    embedded with sensors, software, and connectivity that enables them to
    collect and exchange data. IoT devices range from simple sensors to
    complex industrial machines. They are used in smart homes, healthcare,
    agriculture, manufacturing, and transportation. The data collected by
    IoT devices can be analyzed to improve efficiency, reduce costs, and
    create new services. However, IoT also presents challenges related to
    security, privacy, and data management.
  `;

  // Generate different summary lengths
  for (const length of ['short', 'medium', 'long'] as const) {
    const processed = await contentPreprocessor.preprocessContent(content, 'text', {
      generateSummary: true,
      summaryLength: length,
    });

    console.log(`\n${length.toUpperCase()} summary:`);
    console.log(processed.summary);
  }
}

/**
 * Run all examples
 */
export async function runAllExamples() {
  try {
    await example1_BasicTextPreprocessing();
    console.log('\n');
    
    await example2_HtmlContentExtraction();
    console.log('\n');
    
    await example3_WithSummaryGeneration();
    console.log('\n');
    
    await example4_ContentCaptureIntegration();
    console.log('\n');
    
    await example5_BatchPreprocessing();
    console.log('\n');
    
    await example6_ErrorHandling();
    console.log('\n');
    
    await example7_DifferentSummaryLengths();
  } catch (error) {
    console.error('Error running examples:', error);
  }
}

// Export individual examples for selective testing
export {
  example1_BasicTextPreprocessing,
  example2_HtmlContentExtraction,
  example3_WithSummaryGeneration,
  example4_ContentCaptureIntegration,
  example5_BatchPreprocessing,
  example6_ErrorHandling,
  example7_DifferentSummaryLengths,
};
