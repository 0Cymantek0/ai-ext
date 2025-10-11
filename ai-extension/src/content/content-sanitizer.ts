/**
 * Content Sanitization Module
 * Implements PII detection and removal for privacy protection
 * Requirements: 5.3, 5.4
 */

/**
 * Types of PII that can be detected and redacted
 */
export enum PIIType {
  EMAIL = "EMAIL",
  PHONE = "PHONE",
  SSN = "SSN",
  CREDIT_CARD = "CREDIT_CARD",
  IP_ADDRESS = "IP_ADDRESS",
  URL_WITH_PARAMS = "URL_WITH_PARAMS",
  API_KEY = "API_KEY",
  PASSWORD = "PASSWORD",
}

/**
 * Detected PII instance
 */
export interface DetectedPII {
  type: PIIType;
  value: string;
  startIndex: number;
  endIndex: number;
  confidence: number;
}

/**
 * Sanitization options
 */
export interface SanitizationOptions {
  redactEmails?: boolean;
  redactPhones?: boolean;
  redactSSN?: boolean;
  redactCreditCards?: boolean;
  redactIPAddresses?: boolean;
  redactURLParams?: boolean;
  redactAPIKeys?: boolean;
  redactPasswords?: boolean;
  customRedactionText?: string;
  preserveFormat?: boolean;
}

/**
 * Sanitization result
 */
export interface SanitizationResult {
  sanitizedContent: string;
  detectedPII: DetectedPII[];
  originalLength: number;
  sanitizedLength: number;
  redactionCount: number;
}

/**
 * Content Sanitizer class for detecting and removing PII
 */
export class ContentSanitizer {
  // PII detection patterns
  private readonly patterns = {
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    phone:
      /\b(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g,
    ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
    creditCard: /\b(?:\d{4}[-\s]?){3}\d{4}(?:\d{3})?\b/g,
    ipAddress:
      /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
    apiKey:
      /\b(?:AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z\-_]{35}|sk-[a-zA-Z0-9]{48})\b/g,
    password: /(?:password|passwd|pwd)[\s]*[=:]\s*[^\s&]+/gi,
  };

  private readonly defaultOptions: Required<SanitizationOptions> = {
    redactEmails: true,
    redactPhones: true,
    redactSSN: true,
    redactCreditCards: true,
    redactIPAddresses: true,
    redactURLParams: true,
    redactAPIKeys: true,
    redactPasswords: true,
    customRedactionText: "",
    preserveFormat: false,
  };

  /**
   * Sanitize content by detecting and removing PII
   * Requirements: 5.3, 5.4
   */
  sanitize(
    content: string,
    options: SanitizationOptions = {},
  ): SanitizationResult {
    const opts = { ...this.defaultOptions, ...options };
    const detectedPII: DetectedPII[] = [];
    let sanitizedContent = content;
    const originalLength = content.length;

    if (opts.redactEmails) {
      const result = this.detectAndRedact(
        sanitizedContent,
        this.patterns.email,
        PIIType.EMAIL,
        opts,
      );
      sanitizedContent = result.content;
      detectedPII.push(...result.detected);
    }

    if (opts.redactPhones) {
      const result = this.detectAndRedact(
        sanitizedContent,
        this.patterns.phone,
        PIIType.PHONE,
        opts,
      );
      sanitizedContent = result.content;
      detectedPII.push(...result.detected);
    }

    if (opts.redactSSN) {
      const result = this.detectAndRedact(
        sanitizedContent,
        this.patterns.ssn,
        PIIType.SSN,
        opts,
      );
      sanitizedContent = result.content;
      detectedPII.push(...result.detected);
    }

    if (opts.redactCreditCards) {
      const result = this.detectAndRedactCreditCards(sanitizedContent, opts);
      sanitizedContent = result.content;
      detectedPII.push(...result.detected);
    }

    if (opts.redactIPAddresses) {
      const result = this.detectAndRedact(
        sanitizedContent,
        this.patterns.ipAddress,
        PIIType.IP_ADDRESS,
        opts,
      );
      sanitizedContent = result.content;
      detectedPII.push(...result.detected);
    }

    if (opts.redactAPIKeys) {
      const result = this.detectAndRedact(
        sanitizedContent,
        this.patterns.apiKey,
        PIIType.API_KEY,
        opts,
      );
      sanitizedContent = result.content;
      detectedPII.push(...result.detected);
    }

    if (opts.redactPasswords) {
      const result = this.detectAndRedact(
        sanitizedContent,
        this.patterns.password,
        PIIType.PASSWORD,
        opts,
      );
      sanitizedContent = result.content;
      detectedPII.push(...result.detected);
    }

    if (opts.redactURLParams) {
      const result = this.redactURLParameters(sanitizedContent, opts);
      sanitizedContent = result.content;
      detectedPII.push(...result.detected);
    }

    return {
      sanitizedContent,
      detectedPII,
      originalLength,
      sanitizedLength: sanitizedContent.length,
      redactionCount: detectedPII.length,
    };
  }

  /**
   * Detect PII without redacting (for analysis)
   * Requirements: 5.3
   */
  detectPII(content: string, options: SanitizationOptions = {}): DetectedPII[] {
    const opts = { ...this.defaultOptions, ...options };
    const detected: DetectedPII[] = [];

    if (opts.redactEmails) {
      detected.push(
        ...this.detectPattern(content, this.patterns.email, PIIType.EMAIL),
      );
    }
    if (opts.redactPhones) {
      detected.push(
        ...this.detectPattern(content, this.patterns.phone, PIIType.PHONE),
      );
    }
    if (opts.redactSSN) {
      detected.push(
        ...this.detectPattern(content, this.patterns.ssn, PIIType.SSN),
      );
    }
    if (opts.redactCreditCards) {
      detected.push(...this.detectCreditCards(content));
    }
    if (opts.redactIPAddresses) {
      detected.push(
        ...this.detectPattern(
          content,
          this.patterns.ipAddress,
          PIIType.IP_ADDRESS,
        ),
      );
    }
    if (opts.redactAPIKeys) {
      detected.push(
        ...this.detectPattern(content, this.patterns.apiKey, PIIType.API_KEY),
      );
    }
    if (opts.redactPasswords) {
      detected.push(
        ...this.detectPattern(
          content,
          this.patterns.password,
          PIIType.PASSWORD,
        ),
      );
    }

    return detected;
  }

  /**
   * Check if content contains any PII
   * Requirements: 5.3
   */
  containsPII(content: string, options: SanitizationOptions = {}): boolean {
    const detected = this.detectPII(content, options);
    return detected.length > 0;
  }

  /**
   * Get sanitization statistics
   */
  getStatistics(result: SanitizationResult): {
    totalPII: number;
    byType: Record<PIIType, number>;
    reductionPercentage: number;
  } {
    const byType: Record<PIIType, number> = {} as Record<PIIType, number>;

    result.detectedPII.forEach((pii) => {
      byType[pii.type] = (byType[pii.type] || 0) + 1;
    });

    const reductionPercentage =
      result.originalLength > 0
        ? ((result.originalLength - result.sanitizedLength) /
            result.originalLength) *
          100
        : 0;

    return {
      totalPII: result.detectedPII.length,
      byType,
      reductionPercentage,
    };
  }

  private detectPattern(
    content: string,
    pattern: RegExp,
    type: PIIType,
  ): DetectedPII[] {
    const detected: DetectedPII[] = [];
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;

    while ((match = regex.exec(content)) !== null) {
      detected.push({
        type,
        value: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        confidence: 1.0,
      });
    }

    return detected;
  }

  private detectAndRedact(
    content: string,
    pattern: RegExp,
    type: PIIType,
    options: SanitizationOptions,
  ): { content: string; detected: DetectedPII[] } {
    const detected: DetectedPII[] = [];
    const regex = new RegExp(pattern.source, pattern.flags);
    let result = content;
    const matches: RegExpExecArray[] = [];
    let match;

    regex.lastIndex = 0;

    while ((match = regex.exec(content)) !== null) {
      matches.push(match);
    }

    for (let i = matches.length - 1; i >= 0; i--) {
      const match = matches[i];
      if (!match) continue;

      const redactionText = this.getRedactionText(type, match[0], options);
      const before = result.substring(0, match.index);
      const after = result.substring(match.index + match[0].length);
      result = before + redactionText + after;

      detected.push({
        type,
        value: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        confidence: 1.0,
      });
    }

    return { content: result, detected };
  }

  private detectCreditCards(content: string): DetectedPII[] {
    const detected: DetectedPII[] = [];
    const regex = new RegExp(
      this.patterns.creditCard.source,
      this.patterns.creditCard.flags,
    );
    let match;

    while ((match = regex.exec(content)) !== null) {
      const cardNumber = match[0].replace(/[-\s]/g, "");

      if (this.isValidCreditCard(cardNumber)) {
        detected.push({
          type: PIIType.CREDIT_CARD,
          value: match[0],
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          confidence: 1.0,
        });
      }
    }

    return detected;
  }

  private detectAndRedactCreditCards(
    content: string,
    options: SanitizationOptions,
  ): { content: string; detected: DetectedPII[] } {
    const detected: DetectedPII[] = [];
    const regex = new RegExp(
      this.patterns.creditCard.source,
      this.patterns.creditCard.flags,
    );
    let result = content;
    const matches: RegExpExecArray[] = [];
    let match;

    while ((match = regex.exec(content)) !== null) {
      const cardNumber = match[0].replace(/[-\s]/g, "");
      if (this.isValidCreditCard(cardNumber)) {
        matches.push(match);
      }
    }

    for (let i = matches.length - 1; i >= 0; i--) {
      const match = matches[i];
      if (!match) continue;

      const redactionText = this.getRedactionText(
        PIIType.CREDIT_CARD,
        match[0],
        options,
      );
      const before = result.substring(0, match.index);
      const after = result.substring(match.index + match[0].length);
      result = before + redactionText + after;

      detected.push({
        type: PIIType.CREDIT_CARD,
        value: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        confidence: 1.0,
      });
    }

    return { content: result, detected };
  }

  private isValidCreditCard(cardNumber: string): boolean {
    const digits = cardNumber.replace(/\D/g, "");

    if (digits.length < 13 || digits.length > 19) {
      return false;
    }

    let sum = 0;
    let isEven = false;

    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = parseInt(digits.charAt(i), 10);

      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }

      sum += digit;
      isEven = !isEven;
    }

    return sum % 10 === 0;
  }

  private redactURLParameters(
    content: string,
    options: SanitizationOptions,
  ): { content: string; detected: DetectedPII[] } {
    const detected: DetectedPII[] = [];
    const urlPattern = /https?:\/\/[^\s]+\?[^\s]+/g;
    let result = content;
    const matches: RegExpExecArray[] = [];
    let match;

    while ((match = urlPattern.exec(content)) !== null) {
      matches.push(match);
    }

    for (let i = matches.length - 1; i >= 0; i--) {
      const match = matches[i];
      if (!match) continue;

      const url = match[0];
      const [baseUrl] = url.split("?");
      const redactedUrl = `${baseUrl}?[PARAMS_REDACTED]`;
      const before = result.substring(0, match.index);
      const after = result.substring(match.index + match[0].length);
      result = before + redactedUrl + after;

      detected.push({
        type: PIIType.URL_WITH_PARAMS,
        value: url,
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        confidence: 0.8,
      });
    }

    return { content: result, detected };
  }

  private getRedactionText(
    type: PIIType,
    originalValue: string,
    options: SanitizationOptions,
  ): string {
    if (options.customRedactionText && options.customRedactionText.length > 0) {
      return options.customRedactionText;
    }

    if (options.preserveFormat) {
      return originalValue.replace(/[a-zA-Z0-9]/g, "X");
    }

    return `[${type}_REDACTED]`;
  }
}

export const contentSanitizer = new ContentSanitizer();
