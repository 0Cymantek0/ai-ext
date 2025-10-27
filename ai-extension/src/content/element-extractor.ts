/**
 * Enhanced Element Extractor
 * Extracts comprehensive element information including HTML, styles, and computed properties
 * Requirements: 2.2, 2.3, 2.4, 39
 */

import { domAnalyzer, type ElementInfo } from "./dom-analyzer.js";

/**
 * Enhanced element information with computed styles
 */
export interface EnhancedElementInfo extends ElementInfo {
  computedStyles: ComputedStyleInfo;
  cssRules: CSSRuleInfo[];
  dimensions: ElementDimensions;
  position: ElementPosition;
  accessibility: AccessibilityInfo;
}

/**
 * Computed style information
 */
export interface ComputedStyleInfo {
  display: string;
  position: string;
  width: string;
  height: string;
  margin: string;
  padding: string;
  border: string;
  backgroundColor: string;
  color: string;
  fontSize: string;
  fontFamily: string;
  fontWeight: string;
  lineHeight: string;
  textAlign: string;
  boxShadow: string;
  borderRadius: string;
  opacity: string;
  zIndex: string;
  overflow: string;
  flexDirection?: string;
  flexWrap?: string;
  justifyContent?: string;
  alignItems?: string;
  gridTemplateColumns?: string;
  gridTemplateRows?: string;
  gap?: string;
}

/**
 * CSS rule information
 */
export interface CSSRuleInfo {
  selector: string;
  properties: Record<string, string>;
  specificity: number;
  source: string;
}

/**
 * Element dimensions
 */
export interface ElementDimensions {
  width: number;
  height: number;
  offsetWidth: number;
  offsetHeight: number;
  clientWidth: number;
  clientHeight: number;
  scrollWidth: number;
  scrollHeight: number;
}

/**
 * Element position information
 */
export interface ElementPosition {
  top: number;
  left: number;
  right: number;
  bottom: number;
  x: number;
  y: number;
  offsetTop: number;
  offsetLeft: number;
  scrollTop: number;
  scrollLeft: number;
}

/**
 * Accessibility information
 */
export interface AccessibilityInfo {
  role: string | null;
  ariaLabel: string | null;
  ariaDescribedBy: string | null;
  ariaLabelledBy: string | null;
  tabIndex: number;
  isInteractive: boolean;
  isFocusable: boolean;
}

/**
 * Enhanced Element Extractor class
 */
export class ElementExtractor {
  /**
   * Extract comprehensive element information
   * Requirements: 2.2, 2.3, 2.4
   */
  extractEnhanced(element: HTMLElement): EnhancedElementInfo {
    const basicInfo = domAnalyzer.extractElement(element);
    const computedStyles = this.extractComputedStyles(element);
    const cssRules = this.extractCSSRules(element);
    const dimensions = this.extractDimensions(element);
    const position = this.extractPosition(element);
    const accessibility = this.extractAccessibility(element);

    return {
      ...basicInfo,
      computedStyles,
      cssRules,
      dimensions,
      position,
      accessibility,
    };
  }

  /**
   * Extract computed styles from element
   * Requirements: 2.3, 2.4
   */
  private extractComputedStyles(element: HTMLElement): ComputedStyleInfo {
    const computed = window.getComputedStyle(element);

    const styles: ComputedStyleInfo = {
      display: computed.display,
      position: computed.position,
      width: computed.width,
      height: computed.height,
      margin: computed.margin,
      padding: computed.padding,
      border: computed.border,
      backgroundColor: computed.backgroundColor,
      color: computed.color,
      fontSize: computed.fontSize,
      fontFamily: computed.fontFamily,
      fontWeight: computed.fontWeight,
      lineHeight: computed.lineHeight,
      textAlign: computed.textAlign,
      boxShadow: computed.boxShadow,
      borderRadius: computed.borderRadius,
      opacity: computed.opacity,
      zIndex: computed.zIndex,
      overflow: computed.overflow,
    };

    // Add flexbox properties if applicable
    if (computed.display.includes("flex")) {
      styles.flexDirection = computed.flexDirection;
      styles.flexWrap = computed.flexWrap;
      styles.justifyContent = computed.justifyContent;
      styles.alignItems = computed.alignItems;
      styles.gap = computed.gap;
    }

    // Add grid properties if applicable
    if (computed.display.includes("grid")) {
      styles.gridTemplateColumns = computed.gridTemplateColumns;
      styles.gridTemplateRows = computed.gridTemplateRows;
      styles.gap = computed.gap;
    }

    return styles;
  }

  /**
   * Extract CSS rules that apply to the element
   * Requirements: 2.3, 2.4
   */
  private extractCSSRules(element: HTMLElement): CSSRuleInfo[] {
    const rules: CSSRuleInfo[] = [];

    try {
      // Get all stylesheets
      const stylesheets = Array.from(document.styleSheets);

      for (const stylesheet of stylesheets) {
        try {
          // Skip cross-origin stylesheets
          if (!stylesheet.cssRules) continue;

          const cssRules = Array.from(stylesheet.cssRules);

          for (const rule of cssRules) {
            if (rule instanceof CSSStyleRule) {
              // Check if rule applies to element
              if (element.matches(rule.selectorText)) {
                const properties: Record<string, string> = {};

                // Extract properties
                const style = rule.style;
                for (let i = 0; i < style.length; i++) {
                  const prop = style[i];
                  if (prop) {
                    properties[prop] = style.getPropertyValue(prop);
                  }
                }

                rules.push({
                  selector: rule.selectorText,
                  properties,
                  specificity: this.calculateSpecificity(rule.selectorText),
                  source: stylesheet.href || "inline",
                });
              }
            }
          }
        } catch (error) {
          // Skip stylesheets that can't be accessed (CORS)
          console.debug(
            "[ElementExtractor] Skipping stylesheet due to CORS",
            error,
          );
        }
      }
    } catch (error) {
      console.warn("[ElementExtractor] Failed to extract CSS rules", error);
    }

    return rules;
  }

  /**
   * Calculate CSS selector specificity
   */
  private calculateSpecificity(selector: string): number {
    // Simplified specificity calculation
    // ID = 100, class/attribute/pseudo-class = 10, element/pseudo-element = 1
    let specificity = 0;

    // Count IDs
    specificity += (selector.match(/#/g) || []).length * 100;

    // Count classes, attributes, pseudo-classes
    specificity += (selector.match(/\.|:\w+|\[/g) || []).length * 10;

    // Count elements and pseudo-elements
    specificity += (selector.match(/\w+|::/g) || []).length * 1;

    return specificity;
  }

  /**
   * Extract element dimensions
   * Requirements: 2.3
   */
  private extractDimensions(element: HTMLElement): ElementDimensions {
    const rect = element.getBoundingClientRect();

    return {
      width: rect.width,
      height: rect.height,
      offsetWidth: element.offsetWidth,
      offsetHeight: element.offsetHeight,
      clientWidth: element.clientWidth,
      clientHeight: element.clientHeight,
      scrollWidth: element.scrollWidth,
      scrollHeight: element.scrollHeight,
    };
  }

  /**
   * Extract element position
   * Requirements: 2.3
   */
  private extractPosition(element: HTMLElement): ElementPosition {
    const rect = element.getBoundingClientRect();

    return {
      top: rect.top,
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
      x: rect.x,
      y: rect.y,
      offsetTop: element.offsetTop,
      offsetLeft: element.offsetLeft,
      scrollTop: element.scrollTop,
      scrollLeft: element.scrollLeft,
    };
  }

  /**
   * Extract accessibility information
   * Requirements: 2.3, 11.1
   */
  private extractAccessibility(element: HTMLElement): AccessibilityInfo {
    const role = element.getAttribute("role");
    const ariaLabel = element.getAttribute("aria-label");
    const ariaDescribedBy = element.getAttribute("aria-describedby");
    const ariaLabelledBy = element.getAttribute("aria-labelledby");
    const tabIndex = element.tabIndex;

    // Check if element is interactive
    const interactiveTags = new Set([
      "A",
      "BUTTON",
      "INPUT",
      "SELECT",
      "TEXTAREA",
      "DETAILS",
      "SUMMARY",
    ]);
    const isInteractive =
      interactiveTags.has(element.tagName) ||
      element.hasAttribute("onclick") ||
      element.hasAttribute("role") ||
      tabIndex >= 0;

    // Check if element is focusable
    const isFocusable = tabIndex >= 0 || isInteractive;

    return {
      role,
      ariaLabel,
      ariaDescribedBy,
      ariaLabelledBy,
      tabIndex,
      isInteractive,
      isFocusable,
    };
  }

  /**
   * Extract inline styles as object
   * Requirements: 2.3, 2.4
   */
  extractInlineStyles(element: HTMLElement): Record<string, string> {
    const styles: Record<string, string> = {};
    const style = element.style;

    for (let i = 0; i < style.length; i++) {
      const prop = style[i];
      if (prop) {
        styles[prop] = style.getPropertyValue(prop);
      }
    }

    return styles;
  }

  /**
   * Get element's effective styles (computed + inline)
   * Requirements: 2.3, 2.4
   */
  getEffectiveStyles(element: HTMLElement): Record<string, string> {
    const computed = this.extractComputedStyles(element);
    const inline = this.extractInlineStyles(element);

    // Merge with inline styles taking precedence
    return { ...computed, ...inline };
  }
}

// Export singleton instance
export const elementExtractor = new ElementExtractor();
