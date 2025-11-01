/**
 * Page Context Detector
 * Analyzes the current page to determine its context type
 * Requirements: 9.5, 9.6
 */

export enum PageContextType {
  EMAIL = "email",
  SOCIAL_MEDIA = "social_media",
  DOCUMENTATION = "documentation",
  BLOG = "blog",
  FORUM = "forum",
  ECOMMERCE = "ecommerce",
  NEWS = "news",
  PRODUCTIVITY = "productivity",
  MESSAGING = "messaging",
  CODE_REPOSITORY = "code_repository",
  UNKNOWN = "unknown",
}

export interface PageContext {
  type: PageContextType;
  domain: string;
  url: string;
  title: string;
  description?: string;
  keywords?: string[];
  metadata: {
    siteName?: string;
    author?: string;
    publishedDate?: string;
    category?: string;
  };
}

/**
 * Page Context Detector
 * Analyzes the current page and determines its context
 */
export class PageContextDetector {
  private static readonly DOMAIN_PATTERNS: Record<PageContextType, RegExp[]> = {
    [PageContextType.EMAIL]: [
      /gmail\.com/i,
      /outlook\.(live|office|com)/i,
      /mail\.yahoo\.com/i,
      /mail\.google\.com/i,
      /protonmail\.com/i,
      /mail\./i,
    ],
    [PageContextType.SOCIAL_MEDIA]: [
      /twitter\.com|x\.com/i,
      /facebook\.com/i,
      /linkedin\.com/i,
      /instagram\.com/i,
      /reddit\.com/i,
      /tiktok\.com/i,
      /pinterest\.com/i,
      /snapchat\.com/i,
      /mastodon\./i,
      /threads\.net/i,
    ],
    [PageContextType.DOCUMENTATION]: [
      /docs\./i,
      /documentation\./i,
      /developer\./i,
      /api\./i,
      /readthedocs\.io/i,
      /gitbook\.io/i,
      /confluence\./i,
      /notion\.so/i,
    ],
    [PageContextType.BLOG]: [
      /medium\.com/i,
      /substack\.com/i,
      /wordpress\.com/i,
      /blogger\.com/i,
      /tumblr\.com/i,
      /dev\.to/i,
      /hashnode\./i,
    ],
    [PageContextType.FORUM]: [
      /stackoverflow\.com/i,
      /stackexchange\.com/i,
      /discourse\./i,
      /forum\./i,
      /community\./i,
      /discuss\./i,
    ],
    [PageContextType.ECOMMERCE]: [
      /amazon\./i,
      /ebay\./i,
      /etsy\.com/i,
      /shopify\.com/i,
      /shop\./i,
      /store\./i,
      /cart\./i,
    ],
    [PageContextType.NEWS]: [
      /news\./i,
      /cnn\.com/i,
      /bbc\./i,
      /nytimes\.com/i,
      /reuters\.com/i,
      /theguardian\.com/i,
      /washingtonpost\.com/i,
    ],
    [PageContextType.PRODUCTIVITY]: [
      /notion\.so/i,
      /trello\.com/i,
      /asana\.com/i,
      /monday\.com/i,
      /clickup\.com/i,
      /airtable\.com/i,
      /docs\.google\.com/i,
      /sheets\.google\.com/i,
    ],
    [PageContextType.MESSAGING]: [
      /slack\.com/i,
      /discord\.com/i,
      /telegram\./i,
      /whatsapp\.com/i,
      /messenger\.com/i,
      /chat\./i,
    ],
    [PageContextType.CODE_REPOSITORY]: [
      /github\.com/i,
      /gitlab\.com/i,
      /bitbucket\.org/i,
      /codeberg\.org/i,
      /sourceforge\.net/i,
    ],
    [PageContextType.UNKNOWN]: [],
  };

  /**
   * Detect the context of the current page
   */
  public static detectContext(): PageContext {
    const url = window.location.href;
    const domain = window.location.hostname;
    const title = document.title;

    // Detect page type
    const type = this.detectPageType(domain, url);

    // Extract metadata
    const metadata = this.extractMetadata();

    // Extract description
    const description = this.extractDescription();

    // Extract keywords
    const keywords = this.extractKeywords();

    const context: PageContext = {
      type,
      domain,
      url,
      title,
      keywords,
      metadata,
    };

    // Only add description if it exists
    if (description !== undefined) {
      context.description = description;
    }

    return context;
  }

  /**
   * Detect page type based on domain and URL patterns
   */
  private static detectPageType(domain: string, url: string): PageContextType {
    const fullUrl = `${domain}${url}`;

    for (const [type, patterns] of Object.entries(this.DOMAIN_PATTERNS)) {
      if (type === PageContextType.UNKNOWN) continue;

      for (const pattern of patterns) {
        if (pattern.test(fullUrl)) {
          return type as PageContextType;
        }
      }
    }

    // Fallback: analyze page structure
    return this.detectByPageStructure();
  }

  /**
   * Detect page type by analyzing page structure
   */
  private static detectByPageStructure(): PageContextType {
    // Check for blog indicators
    if (this.hasElement("article") || this.hasElement('[role="article"]')) {
      if (this.hasElement(".post, .blog-post, article.entry")) {
        return PageContextType.BLOG;
      }
    }

    // Check for documentation indicators
    if (this.hasElement(".documentation, .docs, .api-docs, nav.sidebar")) {
      return PageContextType.DOCUMENTATION;
    }

    // Check for forum indicators
    if (this.hasElement(".thread, .post-list, .forum-post, .discussion")) {
      return PageContextType.FORUM;
    }

    // Check for e-commerce indicators
    if (
      this.hasElement(".product, .cart, .checkout, .price, [data-product-id]")
    ) {
      return PageContextType.ECOMMERCE;
    }

    return PageContextType.UNKNOWN;
  }

  /**
   * Check if element exists on page
   */
  private static hasElement(selector: string): boolean {
    return document.querySelector(selector) !== null;
  }

  /**
   * Extract metadata from page
   */
  private static extractMetadata(): PageContext["metadata"] {
    const metadata: PageContext["metadata"] = {};

    // Site name
    const siteName =
      this.getMetaContent("og:site_name") ||
      this.getMetaContent("application-name");
    if (siteName) metadata.siteName = siteName;

    // Author
    const author =
      this.getMetaContent("author") || this.getMetaContent("article:author");
    if (author) metadata.author = author;

    // Published date
    const publishedDate =
      this.getMetaContent("article:published_time") ||
      this.getMetaContent("datePublished");
    if (publishedDate) metadata.publishedDate = publishedDate;

    // Category
    const category =
      this.getMetaContent("article:section") || this.getMetaContent("category");
    if (category) metadata.category = category;

    return metadata;
  }

  /**
   * Extract description from page
   */
  private static extractDescription(): string | undefined {
    return (
      this.getMetaContent("description") ||
      this.getMetaContent("og:description") ||
      this.getMetaContent("twitter:description")
    );
  }

  /**
   * Extract keywords from page
   */
  private static extractKeywords(): string[] {
    const keywordsStr = this.getMetaContent("keywords");
    if (keywordsStr) {
      return keywordsStr
        .split(",")
        .map((k) => k.trim())
        .filter((k) => k.length > 0);
    }

    // Fallback: extract from Open Graph tags
    const tags: string[] = [];
    const ogTags = document.querySelectorAll('meta[property^="article:tag"]');
    ogTags.forEach((tag) => {
      const content = tag.getAttribute("content");
      if (content) tags.push(content);
    });

    return tags;
  }

  /**
   * Get meta tag content
   */
  private static getMetaContent(name: string): string | undefined {
    // Try name attribute
    let meta = document.querySelector(`meta[name="${name}"]`);
    if (meta) {
      return meta.getAttribute("content") || undefined;
    }

    // Try property attribute (for Open Graph)
    meta = document.querySelector(`meta[property="${name}"]`);
    if (meta) {
      return meta.getAttribute("content") || undefined;
    }

    return undefined;
  }

  /**
   * Get context-specific suggestions for enhancement styles
   */
  public static getContextualSuggestions(context: PageContext): string[] {
    const suggestions: string[] = [];

    switch (context.type) {
      case PageContextType.EMAIL:
        suggestions.push(
          "Consider professional tone for business emails",
          "Keep it concise and clear",
          "Use empathetic language for sensitive topics",
        );
        break;

      case PageContextType.SOCIAL_MEDIA:
        suggestions.push(
          "Engage your audience with compelling language",
          "Consider adding humor or personality",
          "Keep it brief and impactful",
        );
        break;

      case PageContextType.DOCUMENTATION:
        suggestions.push(
          "Use clear, technical language",
          "Be precise and accurate",
          "Include relevant examples",
        );
        break;

      case PageContextType.BLOG:
        suggestions.push(
          "Engage readers with storytelling",
          "Use conversational tone",
          "Make it informative and interesting",
        );
        break;

      case PageContextType.FORUM:
        suggestions.push(
          "Be helpful and respectful",
          "Provide clear explanations",
          "Stay on topic",
        );
        break;

      case PageContextType.ECOMMERCE:
        suggestions.push(
          "Be persuasive but honest",
          "Highlight key benefits",
          "Address customer concerns",
        );
        break;

      case PageContextType.MESSAGING:
        suggestions.push(
          "Keep it casual and friendly",
          "Be clear and direct",
          "Match the conversation tone",
        );
        break;

      default:
        suggestions.push(
          "Improve clarity and readability",
          "Enhance tone and style",
          "Fix grammar and spelling",
        );
    }

    return suggestions;
  }
}
