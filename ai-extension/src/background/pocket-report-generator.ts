/**
 * Pocket Report Generator
 * Generates comprehensive reports for pocket data using Gemini Flash API
 * Requirements: Generate reports with AI insights, statistics, and summaries
 */

import { CloudAIManager, GeminiModel } from "./cloud-ai-manager";
import { IndexedDBManager, StoreName, type Pocket, type CapturedContent } from "./indexeddb-manager";
import { logger } from "./monitoring";

export interface ReportData {
  // Component-based structure
  hero: {
    backgroundImage?: string;
    pocketName?: string;
    title: string;
    subtitle: string;
  };
  sidebar: {
    showTextSize: boolean;
    index: Array<{
      title: string;
      id?: string;
      children?: Array<{ title: string; id: string }>;
    }>;
  };
  sections: Array<{
    title: string;
    content: Array<{
      type: string;
      data: any;
    }>;
  }>;
  footer: {
    sources: Array<{
      title: string;
      url: string;
      type: string;
      icon: string;
    }>;
  };
  // Legacy metadata for compatibility
  metadata?: {
    generatedAt: number;
    pocketId?: string;
    pocketName?: string;
    totalItems: number;
  };
}

export class PocketReportGenerator {
  private cloudAI: CloudAIManager;
  private dbManager: IndexedDBManager;

  constructor(apiKey?: string) {
    this.cloudAI = new CloudAIManager(apiKey);
    this.dbManager = new IndexedDBManager();
  }

  /**
   * Generate a comprehensive report for a specific pocket or all pockets
   * Uses two-phase generation: planning then content creation
   */
  async generateReport(pocketId?: string): Promise<ReportData> {
    try {
      logger.info("PocketReport", "Starting report generation", pocketId || "all");

      // Check if Cloud AI is available
      if (!this.cloudAI.isAvailable()) {
        throw new Error("Cloud AI not available. Please check API key configuration.");
      }

      // Fetch pocket data
      logger.info("PocketReport", "Fetching pockets", "");
      const pockets = await this.fetchPockets(pocketId);
      logger.info("PocketReport", "Pockets fetched", `${pockets.length} pockets`);

      // Fetch contents
      logger.info("PocketReport", "Fetching contents", "");
      const contents = await this.fetchContents(pocketId);
      logger.info("PocketReport", "Contents fetched", `${contents.length} items`);

      // Prepare data for AI analysis
      logger.info("PocketReport", "Preparing analysis data", "");
      const analysisData = this.prepareAnalysisData(pockets, contents);

      // PHASE 1: Generate report structure/plan
      logger.info("PocketReport", "Phase 1: Planning report structure", "");
      const reportPlan = await this.generateReportPlan(analysisData, pockets[0]?.name);
      logger.info("PocketReport", "Report plan generated", "");

      // PHASE 2: Generate detailed content following the plan
      logger.info("PocketReport", "Phase 2: Generating report content", "");
      const reportData = await this.generateReportContent(reportPlan, analysisData, contents, pockets[0]?.name);
      logger.info("PocketReport", "Report content generated", "");

      // Generate hero background image (optional - gracefully handle failures)
      try {
        logger.info("PocketReport", "Generating hero image", "");
        const heroImage = await this.generateHeroImage(reportData.hero.title, pockets[0]?.name);
        if (heroImage) {
          reportData.hero.backgroundImage = heroImage;
          logger.info("PocketReport", "Hero image generated successfully", "");
        } else {
          logger.info("PocketReport", "Hero image generation skipped", "");
        }
      } catch (imageError) {
        // Image generation is optional - don't fail the entire report
        logger.warn("PocketReport", "Hero image generation failed, continuing without image", imageError);
      }

      logger.info("PocketReport", "Report generation completed", `${contents.length} items`);

      return reportData;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("PocketReport", "Report generation failed", errorMessage);
      throw new Error(`Report generation failed: ${errorMessage}`);
    }
  }

  /**
   * Fetch pockets from IndexedDB
   */
  private async fetchPockets(pocketId?: string): Promise<Pocket[]> {
    if (pocketId) {
      const pocket = await this.dbManager.getPocket(pocketId);
      return pocket ? [pocket] : [];
    } else {
      return await this.dbManager.listPockets();
    }
  }

  /**
   * Fetch contents from IndexedDB
   */
  private async fetchContents(pocketId?: string): Promise<CapturedContent[]> {
    if (pocketId) {
      return await this.dbManager.getContentByPocket(pocketId);
    } else {
      // Get all pockets and fetch their content
      const pockets = await this.dbManager.listPockets();
      const allContents: CapturedContent[] = [];
      
      for (const pocket of pockets) {
        const contents = await this.dbManager.getContentByPocket(pocket.id);
        allContents.push(...contents);
      }
      
      return allContents;
    }
  }

  /**
   * Calculate statistics from content
   */
  private calculateStatistics(contents: CapturedContent[]) {
    const byType: Record<string, number> = {};
    const byTag: Record<string, number> = {};
    let totalSize = 0;

    contents.forEach(content => {
      // Count by type
      byType[content.type] = (byType[content.type] || 0) + 1;

      // Count by tags
      content.metadata.tags?.forEach(tag => {
        byTag[tag] = (byTag[tag] || 0) + 1;
      });

      // Calculate size
      if (typeof content.content === "string") {
        totalSize += content.content.length;
      } else if (content.content instanceof ArrayBuffer) {
        totalSize += content.content.byteLength;
      }
    });

    return {
      totalContent: contents.length,
      byType,
      byTag,
      totalSize,
      averageSize: contents.length > 0 ? totalSize / contents.length : 0,
    };
  }

  /**
   * Get date range from contents
   */
  private getDateRange(contents: CapturedContent[]) {
    if (contents.length === 0) {
      return { start: Date.now(), end: Date.now() };
    }

    const timestamps = contents.map(c => c.capturedAt);
    return {
      start: Math.min(...timestamps),
      end: Math.max(...timestamps),
    };
  }

  /**
   * Prepare data for AI analysis
   */
  private prepareAnalysisData(pockets: Pocket[], contents: CapturedContent[]): string {
    const summary = {
      pockets: pockets.map(p => ({
        name: p.name,
        description: p.description,
        tags: p.tags,
        itemCount: contents.filter(c => c.pocketId === p.id).length,
      })),
      contents: contents.slice(0, 50).map(c => ({ // Limit to 50 for token efficiency
        type: c.type,
        title: c.metadata.title || "Untitled",
        tags: c.metadata.tags || [],
        preview: this.getContentPreview(c),
        timestamp: c.capturedAt,
      })),
      totalItems: contents.length,
    };

    return JSON.stringify(summary, null, 2);
  }

  /**
   * Get content preview (first 200 chars)
   * Note: This is used for AI analysis, so we don't include full image data URLs
   */
  private getContentPreview(content: CapturedContent): string {
    // For images, return metadata instead of the full data URL
    if (content.type === "image") {
      try {
        if (typeof content.content === "string") {
          const parsedContent = JSON.parse(content.content);
          const width = parsedContent.image?.width || content.metadata.dimensions?.width || 0;
          const height = parsedContent.image?.height || content.metadata.dimensions?.height || 0;
          const alt = parsedContent.image?.alt || parsedContent.alt || "";
          return `Image: ${width}x${height}${alt ? ` - ${alt}` : ""}`;
        }
      } catch (error) {
        // If parsing fails, return generic description
      }
      return `[Image content]`;
    }
    
    if (typeof content.content === "string") {
      return content.content.substring(0, 200);
    }
    return `[${content.type} content]`;
  }

  /**
   * PHASE 1: Generate report structure and plan
   */
  private async generateReportPlan(analysisData: string, pocketName?: string) {
    const prompt = `You are creating a comprehensive, professional report about a collection of saved content.

Data to analyze:
${analysisData}

Create a detailed report structure plan. Include:
1. A compelling title that captures the essence of the content
2. A subtitle/description (2-3 sentences)
3. Main sections to cover (4-8 sections with descriptive titles)
4. For each section, list the key topics and what visualizations would be helpful (charts, diagrams, etc.)

CRITICAL RULES:
- Return ONLY valid JSON
- NO markdown formatting, NO code blocks, NO extra text
- NO trailing commas in arrays or objects
- Use proper JSON syntax

Example format:
{
  "title": "Report Title Here",
  "subtitle": "Brief description here",
  "sections": [
    {
      "title": "Section Title",
      "topics": ["topic1", "topic2"],
      "visualizations": ["chart type"]
    }
  ]
}`;

    try {
      const response = await this.cloudAI.processWithFlash(prompt, {
        temperature: 0.7,
        maxOutputTokens: 2000,
      });

      // Clean the response - remove markdown code blocks if present
      let cleanedResponse = response.result.trim();
      cleanedResponse = cleanedResponse.replace(/```json\s*/g, '');
      cleanedResponse = cleanedResponse.replace(/```\s*/g, '');
      
      // Extract JSON object
      const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          logger.info("PocketReport", "Report plan parsed successfully", "");
          return parsed;
        } catch (parseError) {
          logger.error("PocketReport", "JSON parse error", parseError);
          // Try to fix common JSON issues
          let fixedJson = jsonMatch[0];
          
          // Fix 1: Remove trailing commas before closing brackets
          fixedJson = fixedJson.replace(/,(\s*[}\]])/g, '$1');
          
          // Fix 2: Remove trailing commas in arrays (more aggressive)
          fixedJson = fixedJson.replace(/,(\s*\])/g, '$1');
          
          // Fix 3: Remove trailing commas in objects
          fixedJson = fixedJson.replace(/,(\s*\})/g, '$1');
          
          // Fix 4: Fix double commas
          fixedJson = fixedJson.replace(/,,+/g, ',');
          
          // Fix 5: Remove comments if any
          fixedJson = fixedJson.replace(/\/\/.*/g, '');
          fixedJson = fixedJson.replace(/\/\*[\s\S]*?\*\//g, '');
          
          // Try parsing again
          try {
            const parsed = JSON.parse(fixedJson);
            logger.info("PocketReport", "JSON fixed and parsed successfully", "");
            return parsed;
          } catch (secondError) {
            logger.error("PocketReport", "Failed to fix JSON", secondError);
            // Log the problematic JSON for debugging
            logger.error("PocketReport", "Problematic JSON snippet", fixedJson.substring(0, 500));
          }
        }
      }

      // Fallback plan
      logger.warn("PocketReport", "Using fallback plan", "");
      return {
        title: `${pocketName || "Content"} Analysis Report`,
        subtitle: "A comprehensive overview of your saved content and insights.",
        sections: [
          { title: "Overview", topics: ["Summary"], visualizations: [] },
          { title: "Key Findings", topics: ["Insights"], visualizations: [] }
        ]
      };
    } catch (error) {
      logger.error("PocketReport", "Report plan generation failed", error);
      return {
        title: `${pocketName || "Content"} Report`,
        subtitle: "Analysis of your saved content.",
        sections: [{ title: "Overview", topics: [], visualizations: [] }]
      };
    }
  }

  /**
   * PHASE 2: Generate detailed report content following the plan
   */
  private async generateReportContent(plan: any, analysisData: string, contents: CapturedContent[], pocketName?: string): Promise<ReportData> {
    // Extract images from content
    const imageContents = contents.filter(c => c.type === 'image');
    const imageData = imageContents.map((img, idx) => ({
      index: idx,
      title: img.metadata.title || `Image ${idx + 1}`,
      tags: img.metadata.tags || [],
      content: this.getContentPreview(img)
    }));

    const prompt = `You are writing the ACTUAL CONTENT for a professional research report. Analyze the data provided and write real, substantive content - NOT descriptions of what should be written.

PLAN:
${JSON.stringify(plan, null, 2)}

DATA TO ANALYZE:
${analysisData}

AVAILABLE IMAGES (${imageContents.length} images):
${JSON.stringify(imageData, null, 2)}

CRITICAL INSTRUCTIONS:
1. Write ACTUAL analysis, insights, and findings based on the data
2. DO NOT write meta-descriptions like "Report purpose and scope..." or "Overview of the collection..."
3. Instead, write the actual content: "This collection contains X items focused on Y topics..."
4. Use specific numbers, statistics, and examples from the data
5. Each text paragraph should be 2-4 sentences of actual analysis
6. **INTEGRATE IMAGES** throughout the report where relevant:
   - Use the "image" type to place images in appropriate sections
   - Add a caption explaining what the image shows and its relevance
   - Distribute images across different sections (not all together)
   - Only use images that are contextually relevant to the section

WRONG (meta-description):
"Report purpose and scope. Overview of the collection's primary focus (LSTM networks). Key findings regarding content types and themes."

RIGHT (actual content):
"This collection contains 47 items primarily focused on LSTM neural networks and deep learning architectures. The content spans from foundational tutorials to advanced research papers, with 65% being technical articles and 35% code examples. Key themes include sequence modeling, natural language processing, and time series prediction."

For each section in the plan, generate:
- Text paragraphs with ACTUAL analysis and insights (not descriptions)
- Lists with SPECIFIC findings from the data
- Images where contextually relevant with descriptive captions
- Use real numbers and statistics from the provided data

CRITICAL RULES:
- Return ONLY valid JSON
- NO markdown formatting, NO code blocks, NO extra text
- NO trailing commas in arrays or objects
- Use proper JSON syntax

Example format with images:
{
  "sections": [
    {
      "title": "Section Title",
      "content": [
        { "type": "text", "data": { "content": "This collection contains 47 items with a primary focus on machine learning. The content was captured over a 3-month period, showing consistent interest in neural network architectures." } },
        { "type": "image", "data": { "imageIndex": 0, "caption": "The above diagram illustrates the LSTM architecture discussed in the collected resources, showing the flow of information through memory cells." } },
        { "type": "text", "data": { "content": "The visual representation helps clarify the complex interactions between input gates, forget gates, and output gates in LSTM networks." } },
        { "type": "list", "data": { "items": ["65% of content is technical documentation", "Most common tags: python, tensorflow, keras", "Average content length: 2,500 words"] } }
      ]
    }
  ]
}`;

    try {
      const response = await this.cloudAI.processWithFlash(prompt, {
        temperature: 0.7,
        maxOutputTokens: 4000,
      });

      // Clean the response - remove markdown code blocks if present
      let cleanedResponse = response.result.trim();
      cleanedResponse = cleanedResponse.replace(/```json\s*/g, '');
      cleanedResponse = cleanedResponse.replace(/```\s*/g, '');

      const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
      let sections: any[] = [];
      
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          sections = parsed.sections || [];
          logger.info("PocketReport", "Report content parsed successfully", `${sections.length} sections`);
        } catch (parseError) {
          logger.error("PocketReport", "Content JSON parse error", parseError);
          // Try to fix common JSON issues
          let fixedJson = jsonMatch[0];
          
          // Apply all JSON fixes
          fixedJson = fixedJson.replace(/,(\s*[}\]])/g, '$1');
          fixedJson = fixedJson.replace(/,(\s*\])/g, '$1');
          fixedJson = fixedJson.replace(/,(\s*\})/g, '$1');
          fixedJson = fixedJson.replace(/,,+/g, ',');
          fixedJson = fixedJson.replace(/\/\/.*/g, '');
          fixedJson = fixedJson.replace(/\/\*[\s\S]*?\*\//g, '');
          
          try {
            const parsed = JSON.parse(fixedJson);
            sections = parsed.sections || [];
            logger.info("PocketReport", "Content JSON fixed and parsed", `${sections.length} sections`);
          } catch (secondError) {
            logger.error("PocketReport", "Failed to fix content JSON", secondError);
            logger.error("PocketReport", "Problematic JSON snippet", fixedJson.substring(0, 500));
            // Use fallback sections
            sections = this.createFallbackSections(plan);
          }
        }
      } else {
        logger.warn("PocketReport", "No JSON found in response, using fallback", "");
        sections = this.createFallbackSections(plan);
      }

      // Process sections to replace image indices with actual image data
      sections = this.integrateImages(sections, imageContents);

      // Build complete report structure
      const reportData: ReportData = {
        hero: {
          ...(pocketName && { pocketName: pocketName }),
          title: plan.title || "Content Analysis Report",
          subtitle: plan.subtitle || "Comprehensive insights from your saved content"
        },
        sidebar: {
          showTextSize: true,
          index: sections.map((s: any, i: number) => ({
            title: s.title,
            id: `section-${i}`
          }))
        },
        sections: sections,
        footer: {
          sources: this.extractSources(contents)
        },
        metadata: {
          generatedAt: Date.now(),
          totalItems: contents.length
        }
      };

      return reportData;
    } catch (error) {
      logger.error("PocketReport", "Report content generation failed", error);
      
      // Fallback report
      return {
        hero: {
          title: plan.title || "Content Report",
          subtitle: plan.subtitle || "Analysis of your content"
        },
        sidebar: {
          showTextSize: true,
          index: [{ title: "Overview", id: "section-0" }]
        },
        sections: [{
          title: "Overview",
          content: [
            { 
              type: "text", 
              data: { 
                content: "Report generation encountered an issue. Please try again." 
              } 
            }
          ]
        }],
        footer: {
          sources: this.extractSources(contents)
        },
        metadata: {
          generatedAt: Date.now(),
          totalItems: contents.length
        }
      };
    }
  }               

  /**
   * Generate hero background image using Gemini image generation
   * Returns null if generation fails or quota is exceeded
   */
  private async generateHeroImage(title: string, pocketName?: string): Promise<string | null> {
    try {
      const prompt = `Create a professional, artistic hero background image for a report titled "${title}". 
The image should be:
- Abstract and professional
- Suitable as a background (not too busy)
- Related to the theme: ${pocketName || "knowledge and information"}
- Modern and clean aesthetic
- Wide aspect ratio suitable for a hero banner
- Photorealistic with soft lighting and depth`;

      const imageData = await this.cloudAI.generateImage(prompt, {
        temperature: 0.9,
        maxOutputTokens: 1000,
        aspectRatio: "16:9"
      });

      return imageData;
    } catch (error: any) {
      // Check if it's a quota error
      if (error?.message?.includes('quota') || error?.message?.includes('429')) {
        logger.warn("PocketReport", "Image generation quota exceeded, skipping image", "");
      } else {
        logger.error("PocketReport", "Hero image generation failed", error);
      }
      return null;
    }
  }

  /**
   * Extract sources from content for footer
   */
  private extractSources(contents: CapturedContent[]) {
    const sources = new Map();
    
    contents.slice(0, 20).forEach(content => {
      if (content.sourceUrl && !sources.has(content.sourceUrl)) {
        sources.set(content.sourceUrl, {
          title: content.metadata.title || "Untitled",
          url: content.sourceUrl,
          type: content.type,
          icon: this.getIconForType(content.type)
        });
      }
    });

    return Array.from(sources.values());
  }

  /**
   * Get icon emoji for content type
   */
  private getIconForType(type: string): string {
    const icons: Record<string, string> = {
      'text': '📄',
      'image': '🖼️',
      'link': '🔗',
      'video': '🎥',
      'audio': '🎵',
      'pdf': '📕',
      'code': '💻'
    };
    return icons[type] || '📄';
  }

  /**
   * Create fallback sections when AI generation fails
   */
  private createFallbackSections(plan: any): any[] {
    const sections: any[] = [];
    
    // Create basic sections from plan
    if (plan.sections && Array.isArray(plan.sections)) {
      for (const planSection of plan.sections) {
        sections.push({
          title: planSection.title || "Section",
          content: [
            {
              type: "text",
              data: {
                content: `This section covers ${planSection.topics?.join(', ') || 'content analysis and insights'}. The AI content generation encountered an issue. Please try regenerating the report for detailed analysis.`
              }
            }
          ]
        });
      }
    }

    // If no sections, create a default one
    if (sections.length === 0) {
      sections.push({
        title: "Overview",
        content: [
          {
            type: "text",
            data: {
              content: "Report content generation encountered an issue. Please try generating the report again to see detailed analysis and insights."
            }
          }
        ]
      });
    }

    return sections;
  }

  /**
   * Integrate actual image data into sections
   */
  private integrateImages(sections: any[], imageContents: CapturedContent[]): any[] {
    return sections.map(section => {
      const updatedContent = section.content?.map((item: any) => {
        if (item.type === 'image' && item.data?.imageIndex !== undefined) {
          const imageIndex = item.data.imageIndex;
          const imageContent = imageContents[imageIndex];
          
          if (imageContent) {
            // Extract image data
            let imageSrc = '';
            try {
              if (typeof imageContent.content === 'string') {
                const parsedContent = JSON.parse(imageContent.content);
                imageSrc = parsedContent.image?.src || parsedContent.src || '';
              }
            } catch (error) {
              // If parsing fails, try to use the content directly if it's a data URL
              if (typeof imageContent.content === 'string' && imageContent.content.startsWith('data:image/')) {
                imageSrc = imageContent.content;
              }
            }

            if (imageSrc) {
              return {
                type: 'diagram',
                data: {
                  src: imageSrc,
                  alt: imageContent.metadata.title || 'Image',
                  caption: item.data.caption || 'The above image provides visual context for the discussed concepts.'
                }
              };
            }
          }
        }
        return item;
      }) || [];

      return {
        ...section,
        content: updatedContent
      };
    });
  }

  /**
   * Format content list for report
   */
  private formatContentList(contents: CapturedContent[]) {
    return contents.map(content => {
      const formatted: any = {
        id: content.id,
        type: content.type,
        title: content.metadata.title || "Untitled",
        preview: this.getContentPreview(content),
        timestamp: content.capturedAt,
        tags: content.metadata.tags || [],
        url: content.sourceUrl,
      };

      // For images, parse the JSON content and extract the image src
      if (content.type === "image" && typeof content.content === "string") {
        try {
          const parsedContent = JSON.parse(content.content);
          // Extract the image src from the parsed content
          const imageSrc = parsedContent.image?.src || parsedContent.src;
          if (imageSrc) {
            formatted.imageData = imageSrc;
          }
        } catch (error) {
          // If parsing fails, try to use the content directly if it's a data URL
          if (content.content.startsWith('data:image/')) {
            formatted.imageData = content.content;
          }
        }
      }

      return formatted;
    });
  }
}
