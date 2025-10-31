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
      font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      min-height: 100vh;
      color: rgba(255,255,255,0.9);
    `;

    // Apply dark theme to body
    document.body.style.background = '#0a0a0a';
    document.body.style.color = 'rgba(255,255,255,0.9)';

    // Render sidebar
    if (reportData.sidebar) {
      this.container.appendChild(ReportComponents.sidebar.render(reportData.sidebar));
    }

    // Render hero
    if (reportData.hero) {
      this.container.appendChild(ReportComponents.hero.render(reportData.hero));
    }

    // Main content wrapper
    const mainContent = document.createElement('div');
    mainContent.id = 'reportMainContent';
    mainContent.className = 'text-size-medium';
    mainContent.style.cssText = `
      margin-left: ${reportData.sidebar ? '280px' : '0'};
      padding: 60px 80px;
      max-width: 1200px;
      transition: all 0.3s ease;
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

    // Update scrollbar styles for dark theme
    this.addScrollbarStyles();
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

  addScrollbarStyles() {
    if (!document.getElementById('scrollbar-styles')) {
      const style = document.createElement('style');
      style.id = 'scrollbar-styles';
      style.textContent = `
        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        
        ::-webkit-scrollbar-track {
          background: rgba(255,255,255,0.05);
        }
        
        ::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.2);
          border-radius: 4px;
        }
        
        ::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.3);
        }

        /* Responsive styles */
        @media (max-width: 1024px) {
          #reportMainContent {
            padding: 40px 40px !important;
          }
          
          .report-hero-responsive {
            padding: 60px 40px 40px 40px !important;
          }
        }

        @media (max-width: 768px) {
          #reportMainContent {
            padding: 30px 24px !important;
            margin-left: 0 !important;
          }
          
          .report-hero-responsive {
            padding: 40px 24px 30px 24px !important;
            margin-left: 0 !important;
          }
          
          #reportSidebar {
            transform: translateX(-280px) !important;
          }
          
          #sidebarExpandBtn {
            display: flex !important;
          }
        }

        /* Better centering when sidebar is collapsed */
        #reportMainContent.sidebar-collapsed {
          margin-left: 0 !important;
          margin-right: auto;
          padding-left: 120px !important;
          padding-right: 120px !important;
        }

        .report-hero-responsive.sidebar-collapsed {
          margin-left: 0 !important;
          padding-left: 120px !important;
          padding-right: 120px !important;
        }

        @media (max-width: 1400px) {
          #reportMainContent.sidebar-collapsed {
            padding-left: 80px !important;
            padding-right: 80px !important;
          }
          
          .report-hero-responsive.sidebar-collapsed {
            padding-left: 80px !important;
            padding-right: 80px !important;
          }
        }

        @media (max-width: 1024px) {
          #reportMainContent.sidebar-collapsed {
            padding-left: 40px !important;
            padding-right: 40px !important;
          }
          
          .report-hero-responsive.sidebar-collapsed {
            padding-left: 40px !important;
            padding-right: 40px !important;
          }
        }
      `;
      document.head.appendChild(style);
    }
  }
}
