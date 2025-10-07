/**
 * Content Sanitizer Usage Examples
 * Demonstrates PII detection and removal capabilities
 * Requirements: 5.3, 5.4
 */

import { contentSanitizer, PIIType, type SanitizationOptions } from "./content-sanitizer.js";

/**
 * Example 1: Basic sanitization with default options
 */
export function exampleBasicSanitization() {
  const content = `
    Contact me at john.doe@example.com or call 555-123-4567.
    My SSN is 123-45-6789 and credit card is 4532-1234-5678-9010.
  `;

  const result = contentSanitizer.sanitize(content);

  console.log("Original content:", content);
  console.log("Sanitized content:", result.sanitizedContent);
  console.log("Detected PII count:", result.redactionCount);
  console.log("Detected PII:", result.detectedPII);
}

/**
 * Example 2: Selective sanitization
 */
export function exampleSelectiveSanitization() {
  const content = `
    Email: support@company.com
    Phone: 555-987-6543
    IP: 192.168.1.1
  `;

  const options: SanitizationOptions = {
    redactEmails: true,
    redactPhones: false, // Keep phone numbers
    redactIPAddresses: true,
  };

  const result = contentSanitizer.sanitize(content, options);

  console.log("Sanitized (selective):", result.sanitizedContent);
  console.log("Statistics:", contentSanitizer.getStatistics(result));
}

/**
 * Example 3: Preserve format redaction
 */
export function examplePreserveFormat() {
  const content = "My email is john.doe@example.com";

  const options: SanitizationOptions = {
    preserveFormat: true,
  };

  const result = contentSanitizer.sanitize(content, options);

  console.log("Original:", content);
  console.log("Sanitized (format preserved):", result.sanitizedContent);
}

/**
 * Example 4: Custom redaction text
 */
export function exampleCustomRedaction() {
  const content = "Contact: admin@site.com or 555-0123";

  const options: SanitizationOptions = {
    customRedactionText: "[REDACTED]",
  };

  const result = contentSanitizer.sanitize(content, options);

  console.log("Sanitized (custom text):", result.sanitizedContent);
}

/**
 * Example 5: PII detection without redaction
 */
export function exampleDetectionOnly() {
  const content = `
    User data:
    - Email: user@example.com
    - Phone: 555-1234
    - Card: 4532123456789010
  `;

  const detected = contentSanitizer.detectPII(content);

  console.log("Detected PII items:");
  detected.forEach((pii) => {
    console.log(`- ${pii.type}: ${pii.value} (confidence: ${pii.confidence})`);
  });
}

/**
 * Example 6: Check if content contains PII
 */
export function exampleContainsPII() {
  const safeContent = "This is a safe message with no sensitive data.";
  const unsafeContent = "Contact me at secret@email.com";

  console.log("Safe content has PII:", contentSanitizer.containsPII(safeContent));
  console.log("Unsafe content has PII:", contentSanitizer.containsPII(unsafeContent));
}

/**
 * Example 7: URL parameter redaction
 */
export function exampleURLRedaction() {
  const content = `
    Visit: https://example.com/page?token=abc123&user=john
    Or: https://api.site.com/data?key=secret&id=456
  `;

  const result = contentSanitizer.sanitize(content);

  console.log("Original URLs:", content);
  console.log("Sanitized URLs:", result.sanitizedContent);
}

/**
 * Example 8: API key detection
 */
export function exampleAPIKeyDetection() {
  const content = `
    AWS Key: AKIAIOSFODNN7EXAMPLE
    Google Key: AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe
  `;

  const result = contentSanitizer.sanitize(content);

  console.log("Sanitized API keys:", result.sanitizedContent);
  console.log("Detected keys:", result.detectedPII.filter(p => p.type === PIIType.API_KEY));
}

/**
 * Example 9: Credit card validation
 */
export function exampleCreditCardValidation() {
  const content = `
    Valid card: 4532-1234-5678-9010
    Invalid card: 1234-5678-9012-3456
    Another valid: 5425233430109903
  `;

  const result = contentSanitizer.sanitize(content);

  console.log("Original:", content);
  console.log("Sanitized (only valid cards):", result.sanitizedContent);
  console.log("Valid cards found:", result.detectedPII.filter(p => p.type === PIIType.CREDIT_CARD).length);
}

/**
 * Example 10: Statistics and reporting
 */
export function exampleStatistics() {
  const content = `
    User Profile:
    Email: john@example.com
    Phone: 555-1234
    Backup email: john.doe@work.com
    Emergency: 555-9876
    SSN: 123-45-6789
  `;

  const result = contentSanitizer.sanitize(content);
  const stats = contentSanitizer.getStatistics(result);

  console.log("Total PII found:", stats.totalPII);
  console.log("By type:", stats.byType);
  console.log("Content reduction:", `${stats.reductionPercentage.toFixed(2)}%`);
}

/**
 * Run all examples
 */
export function runAllExamples() {
  console.log("\n=== Example 1: Basic Sanitization ===");
  exampleBasicSanitization();

  console.log("\n=== Example 2: Selective Sanitization ===");
  exampleSelectiveSanitization();

  console.log("\n=== Example 3: Preserve Format ===");
  examplePreserveFormat();

  console.log("\n=== Example 4: Custom Redaction ===");
  exampleCustomRedaction();

  console.log("\n=== Example 5: Detection Only ===");
  exampleDetectionOnly();

  console.log("\n=== Example 6: Contains PII Check ===");
  exampleContainsPII();

  console.log("\n=== Example 7: URL Redaction ===");
  exampleURLRedaction();

  console.log("\n=== Example 8: API Key Detection ===");
  exampleAPIKeyDetection();

  console.log("\n=== Example 9: Credit Card Validation ===");
  exampleCreditCardValidation();

  console.log("\n=== Example 10: Statistics ===");
  exampleStatistics();
}
