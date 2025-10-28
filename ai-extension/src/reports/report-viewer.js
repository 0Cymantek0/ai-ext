/**
 * Report Viewer Script
 * Handles report data loading and rendering
 */

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

    if (response && response.success) {
      reportData = response.data;
      console.log('Report data:', reportData);
      renderReport(reportData);
    } else {
      const errorMsg = response?.error || 'Failed to generate report';
      console.error('Report generation failed:', errorMsg);
      showError(errorMsg);
    }
  } catch (error) {
    console.error('Error loading report:', error);
    showError('Failed to load report: ' + (error.message || error));
  }
}

/**
 * Render report data to the page
 */
function renderReport(data) {
  // Hide loading, show content
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('reportContent').classList.remove('hidden');

  // Render overview
  renderOverview(data.metadata, data.statistics);

  // Render AI insights
  renderAIInsights(data.aiInsights);

  // Render content list
  renderContentList(data.content);
}

/**
 * Render overview section
 */
function renderOverview(metadata, statistics) {
  document.getElementById('totalItems').textContent = metadata.totalItems;
  document.getElementById('pocketName').textContent = metadata.pocketName || 'All Pockets';
  document.getElementById('contentTypes').textContent = Object.keys(statistics.byType).length;
  document.getElementById('totalTags').textContent = Object.keys(statistics.byTag).length;
  document.getElementById('generatedDate').textContent = new Date(metadata.generatedAt).toLocaleString();
}

/**
 * Render AI insights section
 */
function renderAIInsights(insights) {
  // Summary
  document.getElementById('aiSummary').textContent = insights.summary || 'No summary available';

  // Themes
  const themesContainer = document.getElementById('aiThemes');
  themesContainer.innerHTML = '';
  if (insights.themes && insights.themes.length > 0) {
    insights.themes.forEach(theme => {
      const badge = document.createElement('span');
      badge.className = 'theme-badge';
      badge.textContent = theme;
      themesContainer.appendChild(badge);
    });
  } else {
    themesContainer.innerHTML = '<p style="color: #a0aec0;">No themes identified</p>';
  }

  // Key findings
  const findingsContainer = document.getElementById('aiFindings');
  findingsContainer.innerHTML = '';
  if (insights.keyFindings && insights.keyFindings.length > 0) {
    insights.keyFindings.forEach(finding => {
      const li = document.createElement('li');
      li.textContent = finding;
      findingsContainer.appendChild(li);
    });
  } else {
    findingsContainer.innerHTML = '<li style="list-style: none; color: #a0aec0;">No key findings</li>';
  }

  // Recommendations
  const recommendationsContainer = document.getElementById('aiRecommendations');
  recommendationsContainer.innerHTML = '';
  if (insights.recommendations && insights.recommendations.length > 0) {
    insights.recommendations.forEach(rec => {
      const li = document.createElement('li');
      li.textContent = rec;
      recommendationsContainer.appendChild(li);
    });
  } else {
    recommendationsContainer.innerHTML = '<li style="list-style: none; color: #a0aec0;">No recommendations</li>';
  }
}

/**
 * Render content list
 */
function renderContentList(contents) {
  const container = document.getElementById('contentList');
  container.innerHTML = '';

  if (!contents || contents.length === 0) {
    container.innerHTML = '<p style="color: #a0aec0; text-align: center; padding: 40px;">No content items found</p>';
    return;
  }

  // Limit to first 50 items for performance
  const displayContents = contents.slice(0, 50);

  displayContents.forEach(content => {
    const item = document.createElement('div');
    item.className = 'content-item';
    
    const title = document.createElement('div');
    title.className = 'content-title';
    title.textContent = content.title || 'Untitled';
    
    const preview = document.createElement('div');
    preview.className = 'content-preview';
    preview.textContent = content.preview || 'No preview available';
    
    const tagsDiv = document.createElement('div');
    if (content.tags && content.tags.length > 0) {
      content.tags.forEach(tag => {
        const tagSpan = document.createElement('span');
        tagSpan.className = 'tag';
        tagSpan.textContent = tag;
        tagsDiv.appendChild(tagSpan);
      });
    }
    
    const meta = document.createElement('div');
    meta.className = 'content-meta';
    meta.innerHTML = `
      <span>${new Date(content.timestamp).toLocaleDateString()}</span>
      <span>${content.type}</span>
    `;
    
    item.appendChild(title);
    item.appendChild(preview);
    item.appendChild(tagsDiv);
    item.appendChild(meta);
    
    if (content.url) {
      const link = document.createElement('a');
      link.href = content.url;
      link.target = '_blank';
      link.textContent = 'View Source →';
      link.style.cssText = 'font-size: 12px; color: #667eea; text-decoration: none; display: inline-block; margin-top: 10px;';
      item.appendChild(link);
    }
    
    container.appendChild(item);
  });

  // Show count if limited
  if (contents.length > 50) {
    const moreInfo = document.createElement('p');
    moreInfo.style.cssText = 'text-align: center; color: #a0aec0; margin-top: 20px;';
    moreInfo.textContent = `Showing 50 of ${contents.length} items`;
    container.appendChild(moreInfo);
  }
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
      <p style="color: #718096; margin-bottom: 20px;">${escapeHtml(message)}</p>
      <button class="btn" onclick="location.reload()">Try Again</button>
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
