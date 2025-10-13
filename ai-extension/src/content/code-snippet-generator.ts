/**
 * Code Snippet Generator
 * Creates reusable code snippets from captured elements
 * Requirements: 2.2, 2.3, 2.4, 39
 */

import type { EnhancedElementInfo } from "./element-extractor.js";

/**
 * Code snippet format
 */
export type SnippetFormat =
  | "html"
  | "css"
  | "react"
  | "vue"
  | "angular"
  | "svelte"
  | "tailwind";

/**
 * Generated code snippet
 */
export interface CodeSnippet {
  format: SnippetFormat;
  code: string;
  language: string;
  description: string;
  dependencies?: string[];
}

/**
 * Snippet generation options
 */
export interface SnippetOptions {
  includeStyles?: boolean;
  includeChildren?: boolean;
  useModernCSS?: boolean;
  componentName?: string;
  addComments?: boolean;
}

/**
 * Code Snippet Generator class
 */
export class CodeSnippetGenerator {
  private readonly defaultOptions: Required<SnippetOptions> = {
    includeStyles: true,
    includeChildren: true,
    useModernCSS: true,
    componentName: "CapturedElement",
    addComments: true,
  };

  /**
   * Generate code snippet in specified format
   * Requirements: 2.3, 2.4, 39
   */
  generateSnippet(
    element: HTMLElement,
    elementInfo: EnhancedElementInfo,
    format: SnippetFormat,
    options: SnippetOptions = {}
  ): CodeSnippet {
    const opts = { ...this.defaultOptions, ...options };

    switch (format) {
      case "html":
        return this.generateHTML(element, elementInfo, opts);
      case "css":
        return this.generateCSS(elementInfo, opts);
      case "react":
        return this.generateReact(element, elementInfo, opts);
      case "vue":
        return this.generateVue(element, elementInfo, opts);
      case "angular":
        return this.generateAngular(element, elementInfo, opts);
      case "svelte":
        return this.generateSvelte(element, elementInfo, opts);
      case "tailwind":
        return this.generateTailwind(element, elementInfo, opts);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Generate all available formats
   * Requirements: 2.3, 2.4, 39
   */
  generateAllFormats(
    element: HTMLElement,
    elementInfo: EnhancedElementInfo,
    options: SnippetOptions = {}
  ): CodeSnippet[] {
    const formats: SnippetFormat[] = [
      "html",
      "css",
      "react",
      "vue",
      "angular",
      "svelte",
      "tailwind",
    ];

    return formats.map((format) =>
      this.generateSnippet(element, elementInfo, format, options)
    );
  }

  /**
   * Generate HTML snippet
   * Requirements: 2.3, 2.4
   */
  private generateHTML(
    element: HTMLElement,
    elementInfo: EnhancedElementInfo,
    options: Required<SnippetOptions>
  ): CodeSnippet {
    const parts: string[] = [];

    if (options.addComments) {
      parts.push(`<!-- Captured from: ${window.location.href} -->`);
      parts.push(`<!-- Element: ${elementInfo.tagName} -->`);
      parts.push(`<!-- Selector: ${elementInfo.selector} -->`);
      parts.push("");
    }

    // Clone element
    const clone = element.cloneNode(options.includeChildren) as HTMLElement;

    // Clean up clone
    this.cleanElement(clone);

    parts.push(clone.outerHTML);

    return {
      format: "html",
      code: parts.join("\n"),
      language: "html",
      description: `HTML snippet for ${elementInfo.tagName} element`,
    };
  }

  /**
   * Generate CSS snippet
   * Requirements: 2.3, 2.4
   */
  private generateCSS(
    elementInfo: EnhancedElementInfo,
    options: Required<SnippetOptions>
  ): CodeSnippet {
    const parts: string[] = [];

    if (options.addComments) {
      parts.push(`/* Captured from: ${window.location.href} */`);
      parts.push(`/* Element: ${elementInfo.tagName} */`);
      parts.push(`/* Selector: ${elementInfo.selector} */`);
      parts.push("");
    }

    const selector = `.${this.sanitizeClassName(elementInfo.tagName.toLowerCase())}`;
    const styles = elementInfo.computedStyles;

    parts.push(`${selector} {`);

    // Add layout properties
    if (styles.display) parts.push(`  display: ${styles.display};`);
    if (styles.position && styles.position !== "static")
      parts.push(`  position: ${styles.position};`);

    // Add box model
    if (styles.width && styles.width !== "auto")
      parts.push(`  width: ${styles.width};`);
    if (styles.height && styles.height !== "auto")
      parts.push(`  height: ${styles.height};`);
    if (styles.margin && styles.margin !== "0px")
      parts.push(`  margin: ${styles.margin};`);
    if (styles.padding && styles.padding !== "0px")
      parts.push(`  padding: ${styles.padding};`);

    // Add borders and background
    if (styles.border && styles.border !== "0px none rgb(0, 0, 0)")
      parts.push(`  border: ${styles.border};`);
    if (styles.borderRadius && styles.borderRadius !== "0px")
      parts.push(`  border-radius: ${styles.borderRadius};`);
    if (styles.backgroundColor && styles.backgroundColor !== "rgba(0, 0, 0, 0)")
      parts.push(`  background-color: ${styles.backgroundColor};`);

    // Add typography
    if (styles.color) parts.push(`  color: ${styles.color};`);
    if (styles.fontSize) parts.push(`  font-size: ${styles.fontSize};`);
    if (styles.fontFamily) parts.push(`  font-family: ${styles.fontFamily};`);
    if (styles.fontWeight && styles.fontWeight !== "400")
      parts.push(`  font-weight: ${styles.fontWeight};`);
    if (styles.lineHeight) parts.push(`  line-height: ${styles.lineHeight};`);
    if (styles.textAlign && styles.textAlign !== "start")
      parts.push(`  text-align: ${styles.textAlign};`);

    // Add effects
    if (styles.boxShadow && styles.boxShadow !== "none")
      parts.push(`  box-shadow: ${styles.boxShadow};`);
    if (styles.opacity && styles.opacity !== "1")
      parts.push(`  opacity: ${styles.opacity};`);

    // Add flexbox properties
    if (styles.display?.includes("flex")) {
      if (styles.flexDirection && styles.flexDirection !== "row")
        parts.push(`  flex-direction: ${styles.flexDirection};`);
      if (styles.justifyContent && styles.justifyContent !== "normal")
        parts.push(`  justify-content: ${styles.justifyContent};`);
      if (styles.alignItems && styles.alignItems !== "normal")
        parts.push(`  align-items: ${styles.alignItems};`);
      if (styles.gap && styles.gap !== "0px") parts.push(`  gap: ${styles.gap};`);
    }

    // Add grid properties
    if (styles.display?.includes("grid")) {
      if (styles.gridTemplateColumns)
        parts.push(`  grid-template-columns: ${styles.gridTemplateColumns};`);
      if (styles.gridTemplateRows)
        parts.push(`  grid-template-rows: ${styles.gridTemplateRows};`);
      if (styles.gap && styles.gap !== "0px") parts.push(`  gap: ${styles.gap};`);
    }

    parts.push("}");

    return {
      format: "css",
      code: parts.join("\n"),
      language: "css",
      description: `CSS styles for ${elementInfo.tagName} element`,
    };
  }

  /**
   * Generate React component snippet
   * Requirements: 2.3, 2.4, 39
   */
  private generateReact(
    element: HTMLElement,
    elementInfo: EnhancedElementInfo,
    options: Required<SnippetOptions>
  ): CodeSnippet {
    const componentName = options.componentName;
    const parts: string[] = [];

    if (options.addComments) {
      parts.push(`// Captured from: ${window.location.href}`);
      parts.push(`// Element: ${elementInfo.tagName}`);
      parts.push("");
    }

    parts.push(`import React from 'react';`);
    parts.push("");

    // Generate styles object
    if (options.includeStyles) {
      parts.push(`const styles = {`);
      const styles = this.generateReactStyleObject(elementInfo);
      parts.push(styles);
      parts.push(`};`);
      parts.push("");
    }

    // Generate component
    parts.push(`export const ${componentName} = () => {`);
    parts.push(`  return (`);

    // Convert HTML to JSX
    const jsx = this.htmlToJSX(element, options.includeChildren);
    parts.push(`    ${jsx}`);

    parts.push(`  );`);
    parts.push(`};`);

    return {
      format: "react",
      code: parts.join("\n"),
      language: "typescript",
      description: `React component for ${elementInfo.tagName} element`,
      dependencies: ["react"],
    };
  }

  /**
   * Generate Vue component snippet
   * Requirements: 2.3, 2.4, 39
   */
  private generateVue(
    element: HTMLElement,
    elementInfo: EnhancedElementInfo,
    options: Required<SnippetOptions>
  ): CodeSnippet {
    const parts: string[] = [];

    if (options.addComments) {
      parts.push(`<!-- Captured from: ${window.location.href} -->`);
      parts.push(`<!-- Element: ${elementInfo.tagName} -->`);
      parts.push("");
    }

    parts.push(`<template>`);

    // Clone and clean element
    const clone = element.cloneNode(options.includeChildren) as HTMLElement;
    this.cleanElement(clone);

    parts.push(`  ${clone.outerHTML}`);
    parts.push(`</template>`);
    parts.push("");

    parts.push(`<script setup lang="ts">`);
    parts.push(`// Component logic here`);
    parts.push(`</script>`);
    parts.push("");

    if (options.includeStyles) {
      parts.push(`<style scoped>`);
      const css = this.generateCSS(elementInfo, options);
      parts.push(css.code);
      parts.push(`</style>`);
    }

    return {
      format: "vue",
      code: parts.join("\n"),
      language: "vue",
      description: `Vue component for ${elementInfo.tagName} element`,
      dependencies: ["vue"],
    };
  }

  /**
   * Generate Angular component snippet
   * Requirements: 2.3, 2.4, 39
   */
  private generateAngular(
    element: HTMLElement,
    elementInfo: EnhancedElementInfo,
    options: Required<SnippetOptions>
  ): CodeSnippet {
    const componentName = options.componentName;
    const selector = this.sanitizeClassName(componentName.toLowerCase());
    const parts: string[] = [];

    if (options.addComments) {
      parts.push(`// Captured from: ${window.location.href}`);
      parts.push(`// Element: ${elementInfo.tagName}`);
      parts.push("");
    }

    parts.push(`import { Component } from '@angular/core';`);
    parts.push("");
    parts.push(`@Component({`);
    parts.push(`  selector: 'app-${selector}',`);
    parts.push(`  template: \``);

    // Clone and clean element
    const clone = element.cloneNode(options.includeChildren) as HTMLElement;
    this.cleanElement(clone);

    parts.push(`    ${clone.outerHTML}`);
    parts.push(`  \`,`);

    if (options.includeStyles) {
      parts.push(`  styles: [\``);
      const css = this.generateCSS(elementInfo, options);
      parts.push(`    ${css.code}`);
      parts.push(`  \`]`);
    }

    parts.push(`})`);
    parts.push(`export class ${componentName}Component {}`);

    return {
      format: "angular",
      code: parts.join("\n"),
      language: "typescript",
      description: `Angular component for ${elementInfo.tagName} element`,
      dependencies: ["@angular/core"],
    };
  }

  /**
   * Generate Svelte component snippet
   * Requirements: 2.3, 2.4, 39
   */
  private generateSvelte(
    element: HTMLElement,
    elementInfo: EnhancedElementInfo,
    options: Required<SnippetOptions>
  ): CodeSnippet {
    const parts: string[] = [];

    if (options.addComments) {
      parts.push(`<!-- Captured from: ${window.location.href} -->`);
      parts.push(`<!-- Element: ${elementInfo.tagName} -->`);
      parts.push("");
    }

    parts.push(`<script lang="ts">`);
    parts.push(`  // Component logic here`);
    parts.push(`</script>`);
    parts.push("");

    // Clone and clean element
    const clone = element.cloneNode(options.includeChildren) as HTMLElement;
    this.cleanElement(clone);

    parts.push(clone.outerHTML);
    parts.push("");

    if (options.includeStyles) {
      parts.push(`<style>`);
      const css = this.generateCSS(elementInfo, options);
      parts.push(css.code);
      parts.push(`</style>`);
    }

    return {
      format: "svelte",
      code: parts.join("\n"),
      language: "svelte",
      description: `Svelte component for ${elementInfo.tagName} element`,
      dependencies: ["svelte"],
    };
  }

  /**
   * Generate Tailwind CSS snippet
   * Requirements: 2.3, 2.4, 39
   */
  private generateTailwind(
    element: HTMLElement,
    elementInfo: EnhancedElementInfo,
    options: Required<SnippetOptions>
  ): CodeSnippet {
    const parts: string[] = [];

    if (options.addComments) {
      parts.push(`<!-- Captured from: ${window.location.href} -->`);
      parts.push(`<!-- Element: ${elementInfo.tagName} -->`);
      parts.push("");
    }

    // Clone element
    const clone = element.cloneNode(options.includeChildren) as HTMLElement;
    this.cleanElement(clone);

    // Convert styles to Tailwind classes
    const tailwindClasses = this.convertToTailwindClasses(elementInfo);
    clone.className = tailwindClasses.join(" ");

    parts.push(clone.outerHTML);

    return {
      format: "tailwind",
      code: parts.join("\n"),
      language: "html",
      description: `HTML with Tailwind CSS classes for ${elementInfo.tagName} element`,
      dependencies: ["tailwindcss"],
    };
  }

  /**
   * Convert computed styles to Tailwind classes
   */
  private convertToTailwindClasses(
    elementInfo: EnhancedElementInfo
  ): string[] {
    const classes: string[] = [];
    const styles = elementInfo.computedStyles;

    // This is a simplified conversion - a full implementation would need
    // a comprehensive mapping of CSS properties to Tailwind classes

    // Display
    if (styles.display === "flex") classes.push("flex");
    if (styles.display === "grid") classes.push("grid");
    if (styles.display === "block") classes.push("block");
    if (styles.display === "inline-block") classes.push("inline-block");

    // Flexbox
    if (styles.flexDirection === "column") classes.push("flex-col");
    if (styles.justifyContent === "center") classes.push("justify-center");
    if (styles.alignItems === "center") classes.push("items-center");

    // Spacing (simplified)
    if (styles.padding) {
      const padding = parseInt(styles.padding);
      if (padding > 0) classes.push(`p-${Math.round(padding / 4)}`);
    }
    if (styles.margin) {
      const margin = parseInt(styles.margin);
      if (margin > 0) classes.push(`m-${Math.round(margin / 4)}`);
    }

    // Border radius
    if (styles.borderRadius && styles.borderRadius !== "0px") {
      classes.push("rounded");
    }

    // Text alignment
    if (styles.textAlign === "center") classes.push("text-center");
    if (styles.textAlign === "right") classes.push("text-right");

    return classes;
  }

  /**
   * Generate React style object
   */
  private generateReactStyleObject(elementInfo: EnhancedElementInfo): string {
    const styles = elementInfo.computedStyles;
    const styleProps: string[] = [];

    const propMap: Record<string, string> = {
      display: styles.display,
      position: styles.position,
      width: styles.width,
      height: styles.height,
      margin: styles.margin,
      padding: styles.padding,
      backgroundColor: styles.backgroundColor,
      color: styles.color,
      fontSize: styles.fontSize,
      fontFamily: styles.fontFamily,
      fontWeight: styles.fontWeight,
      lineHeight: styles.lineHeight,
      textAlign: styles.textAlign,
      borderRadius: styles.borderRadius,
    };

    Object.entries(propMap).forEach(([key, value]) => {
      if (value && value !== "none" && value !== "0px") {
        styleProps.push(`  ${key}: '${value}',`);
      }
    });

    return styleProps.join("\n");
  }

  /**
   * Convert HTML to JSX
   */
  private htmlToJSX(element: HTMLElement, includeChildren: boolean): string {
    const clone = element.cloneNode(includeChildren) as HTMLElement;
    this.cleanElement(clone);

    let html = clone.outerHTML;

    // Convert class to className
    html = html.replace(/class=/g, "className=");

    // Convert style strings to objects (simplified)
    html = html.replace(/style="([^"]*)"/g, (match, styleStr) => {
      const styleObj = this.parseStyleString(styleStr);
      return `style={${JSON.stringify(styleObj)}}`;
    });

    return html;
  }

  /**
   * Parse style string to object
   */
  private parseStyleString(styleStr: string): Record<string, string> {
    const styles: Record<string, string> = {};
    const declarations = styleStr.split(";").filter((s) => s.trim());

    declarations.forEach((decl) => {
      const [prop, value] = decl.split(":").map((s) => s.trim());
      if (prop && value) {
        // Convert kebab-case to camelCase
        const camelProp = prop.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
        styles[camelProp] = value;
      }
    });

    return styles;
  }

  /**
   * Clean element by removing unwanted attributes
   */
  private cleanElement(element: HTMLElement): void {
    // Remove data attributes
    Array.from(element.attributes).forEach((attr) => {
      if (attr.name.startsWith("data-")) {
        element.removeAttribute(attr.name);
      }
    });

    // Remove event handlers
    const eventAttrs = Array.from(element.attributes).filter((attr) =>
      attr.name.startsWith("on")
    );
    eventAttrs.forEach((attr) => element.removeAttribute(attr.name));

    // Clean children recursively
    Array.from(element.children).forEach((child) => {
      this.cleanElement(child as HTMLElement);
    });
  }

  /**
   * Sanitize class name
   */
  private sanitizeClassName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9-_]/g, "-")
      .replace(/^[0-9]/, "n$&")
      .toLowerCase();
  }
}

// Export singleton instance
export const codeSnippetGenerator = new CodeSnippetGenerator();
