/**
 * Report Viewer - Component-based report viewer
 */

import { ReportRenderer } from './report-renderer.js';

let reportData = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  await loadReport();
});

/**
 * Load report data from background script
 */
async function loadReport() {
  try {
    // Get pocketId from URL params if provided
    const urlParams = new URLSearchParams(window.location.search);
    const pocketId = urlParams.get('pocketId');

    console.log('Loading report for pocketId:', pocketId);

    // Request report generation from background
    const response = await chrome.runtime.sendMessage({
      kind: 'GENERATE_REPORT',
      requestId: crypto.randomUUID(),
      payload: { pocketId }
    });

    console.log('Report response:', response);

    if (response?.success && response?.data) {
      reportData = response.data;
      console.log('Report data:', reportData);
      renderReport(reportData);
    } else {
      const errorPayload = response?.error;
      const errorMsg = typeof errorPayload === 'string'
        ? errorPayload
        : errorPayload?.message || 'Failed to generate report';
      console.error('Report generation failed:', errorMsg, errorPayload);
      showError(errorMsg);
    }
  } catch (error) {
    console.error('Error loading report:', error);
    showError('Failed to load report: ' + (error.message || error));
  }
}

/**
 * Render report using component-based renderer
 */
function renderReport(data) {
  // Hide loading, show content
  document.getElementById('loading').classList.add('hidden');
  const container = document.getElementById('reportContainer');
  container.classList.remove('hidden');

  // Initialize renderer and render report
  const renderer = new ReportRenderer(container);
  renderer.render(data);
}

/**
 * Show error message
 */
function showError(message) {
  const loading = document.getElementById('loading');
  loading.innerHTML = `
    <div style="text-align: center; padding: 60px 20px;">
      <div style="font-size: 60px; margin-bottom: 20px;">⚠️</div>
      <h2 style="font-size: 24px; color: #2d3748; margin-bottom: 10px;">Error</h2>
      <p style="color: #718096; margin-bottom: 20px; max-width: 500px;">${escapeHtml(message)}</p>
      <button onclick="location.reload()" style="
        background: #667eea;
        color: white;
        border: none;
        padding: 12px 24px;
        border-radius: 6px;
        font-size: 16px;
        cursor: pointer;
        transition: background 0.2s;
      ">Try Again</button>
    </div>
  `;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
