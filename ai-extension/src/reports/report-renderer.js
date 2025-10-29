/**
 * Report Renderer
 * Renders component-based reports from structured data
 */

import { ReportComponents } from './components.js';

export class ReportRenderer {
  constructor(container) {
    this.container = container;
  }

  /**
   * Render a complete report from structured data
   * @param {Object} reportData - Structured report data with components
   */
  render(reportData) {
    // Clear container
    this.container.innerHTML = '';
    this.container.style.cssText = `
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #ffffff;
      min-height: 100vh;
    `;

    // Render hero
    if (reportData.hero) {
      this.container.appendChild(ReportComponents.hero.render(reportData.hero));
    }

    // Render sidebar
    if (reportData.sidebar) {
      this.container.appendChild(ReportComponents.sidebar.render(reportData.sidebar));
    }

    // Main content wrapper
    const mainContent = document.createElement('div');
    mainContent.id = 'reportMainContent';
    mainContent.style.cssText = `
      margin-left: ${reportData.sidebar ? '300px' : '0'};
      padding: 60px 80px;
      max-width: 1200px;
    `;

    // Render sections
    if (reportData.sections) {
      reportData.sections.forEach((section, index) => {
        mainContent.appendChild(ReportComponents.section.render(section, index));
      });
    }

    // Render footer
    if (reportData.footer) {
      mainContent.appendChild(ReportComponents.footer.render(reportData.footer));
    }

    this.container.appendChild(mainContent);

    // Add text size styles
    this.addTextSizeStyles();
  }

  addTextSizeStyles() {
    if (!document.getElementById('text-size-styles')) {
      const style = document.createElement('style');
      style.id = 'text-size-styles';
      style.textContent = `
        .text-size-small { font-size: 14px; }
        .text-size-small h1 { font-size: 36px; }
        .text-size-small h2 { font-size: 24px; }
        .text-size-small h3 { font-size: 18px; }
        
        .text-size-medium { font-size: 16px; }
        .text-size-medium h1 { font-size: 48px; }
        .text-size-medium h2 { font-size: 32px; }
        .text-size-medium h3 { font-size: 20px; }
        
        .text-size-large { font-size: 18px; }
        .text-size-large h1 { font-size: 56px; }
        .text-size-large h2 { font-size: 40px; }
        .text-size-large h3 { font-size: 24px; }
      `;
      document.head.appendChild(style);
    }
  }
}
