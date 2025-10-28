/**
 * Pocket Report Generator
 * Generates comprehensive reports for pocket data using Gemini Flash API
 * Requirements: Generate reports with AI insights, statistics, and summaries
 */

import { CloudAIManager, GeminiModel } from "./cloud-ai-manager";
import { IndexedDBManager, StoreName, type Pocket, type CapturedContent } from "./indexeddb-manager";
import { logger } from "./monitoring";

export interface ReportData {
  metadata: {
    generatedAt: number;
    pocketId?: string;
    pocketName?: string;
    totalItems: number;
    dateRange: {
      start: number;
      end: number;
    };
  };
  statistics: {
    totalContent: number;
    byType: Record<string, number>;
    byTag: Record<string, number>;
    totalSize: number;
    averageSize: number;
  };
  aiInsights: {
    summary: string;
    themes: string[];
    recommendations: string[];
    keyFindings: string[];
  };
  content: Array<{
    id: string;
    type: string;
    title: string;
    preview: string;
    timestamp: number;
    tags: string[];
    url: string;
  }>;
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

      // Calculate statistics
      logger.info("PocketReport", "Calculating statistics", "");
      const statistics = this.calculateStatistics(contents);

      // Prepare data for AI analysis
      logger.info("PocketReport", "Preparing analysis data", "");
      const analysisData = this.prepareAnalysisData(pockets, contents);

      // Get AI insights using Gemini Flash
      logger.info("PocketReport", "Generating AI insights", "");
      const aiInsights = await this.generateAIInsights(analysisData);
      logger.info("PocketReport", "AI insights generated", "");

      // Build report data
      const reportData: ReportData = {
        metadata: {
          generatedAt: Date.now(),
          ...(pocketId ? { pocketId } : {}),
          ...(pockets[0]?.name ? { pocketName: pockets[0].name } : {}),
          totalItems: contents.length,
          dateRange: this.getDateRange(contents),
        },
        statistics,
        aiInsights,
        content: this.formatContentList(contents),
      };

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
   * Generate AI insights using Gemini Flash
   */
  private async generateAIInsights(analysisData: string) {
    const prompt = `Analyze the following pocket data and provide comprehensive insights:

${analysisData}

Please provide:
1. A brief executive summary (2-3 sentences)
2. Main themes and topics (3-5 themes)
3. Key findings or patterns (3-5 findings)
4. Recommendations for organization or next steps (3-5 recommendations)

Format your response as JSON with this structure:
{
  "summary": "...",
  "themes": ["...", "..."],
  "keyFindings": ["...", "..."],
  "recommendations": ["...", "..."]
}`;

    try {
      const response = await this.cloudAI.processWithFlash(prompt, {
        temperature: 0.7,
        maxOutputTokens: 2000,
      });

      // Parse JSON response
      const jsonMatch = response.result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const insights = JSON.parse(jsonMatch[0]);
        return {
          summary: insights.summary || "",
          themes: insights.themes || [],
          keyFindings: insights.keyFindings || [],
          recommendations: insights.recommendations || [],
        };
      }

      // Fallback if JSON parsing fails
      return {
        summary: response.result.substring(0, 500),
        themes: [],
        keyFindings: [],
        recommendations: [],
      };
    } catch (error) {
      logger.error("PocketReport", "AI insights generation failed", error);
      return {
        summary: "AI insights generation failed. Please try again.",
        themes: [],
        keyFindings: [],
        recommendations: [],
      };
    }
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
