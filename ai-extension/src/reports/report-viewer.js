/**
 * Report Viewer Script
 * Handles report data loading, rendering, and PDF export
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

    // Request report generation from background
    const response = await chrome.runtime.sendMessage({
      kind: 'GENERATE_REPORT',
      requestId: crypto.randomUUID(),
      payload: { pocketId }
    });

    if (response.success) {
      reportData = response.data;
      renderReport(reportData);
    } else {
      showError(response.error || 'Failed to generate report');
    }
  } catch (error) {
    console.error('Error loading report:', error);
    showError('Failed to load report: ' + error.message);
  }
}

/**
 * Render report data to the page
 */
function renderReport(data) {
  // Hide loading, show content
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('reportContent').classList.remove('hidden');

  // Render metadata
  renderMetadata(data.metadata, data.statistics);

  // Render AI insights
  renderAIInsights(data.aiInsights);

  // Render statistics charts
  renderStatistics(data.statistics);

  // Render content list
  renderContentList(data.content);
}

/**
 * Render metadata section
 */
function renderMetadata(metadata, statistics) {
  document.getElementById('totalItems').textContent = metadata.totalItems;
  document.getElementById('pocketName').textContent = metadata.pocketName || 'All';
  
  // Format date range
  const startDate = new Date(metadata.dateRange.start).toLocaleDateString();
  const endDate = new Date(metadata.dateRange.end).toLocaleDateString();
  document.getElementById('dateRange').textContent = `${startDate} - ${endDate}`;
  
  // Format total size
  const sizeInMB = (statistics.totalSize / (1024 * 1024)).toFixed(2);
  document.getElementById('totalSize').textContent = `${sizeInMB} MB`;
  
  // Set generated date
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
  insights.themes.forEach(theme => {
    const badge = document.createElement('span');
    badge.className = 'theme-badge';
    badge.textContent = theme;
    themesContainer.appendChild(badge);
  });

  // Key findings
  const findingsContainer = document.getElementById('aiFindings');
  findingsContainer.innerHTML = '';
  insights.keyFindings.forEach(finding => {
    const li = document.createElement('li');
    li.textContent = finding;
    findingsContainer.appendChild(li);
  });

  // Recommendations
  const recommendationsContainer = document.getElementById('aiRecommendations');
  recommendationsContainer.innerHTML = '';
  insights.recommendations.forEach(rec => {
    const li = document.createElement('li');
    li.textContent = rec;
    recommendationsContainer.appendChild(li);
  });
}

/**
 * Render statistics charts
 */
function renderStatistics(statistics) {
  // Content by Type Chart
  const typeCtx = document.getElementById('typeChart').getContext('2d');
  new Chart(typeCtx, {
    type: 'doughnut',
    data: {
      labels: Object.keys(statistics.byType),
      datasets: [{
        data: Object.values(statistics.byType),
        backgroundColor: [
          '#667eea', '#764ba2', '#f093fb', '#4facfe',
          '#43e97b', '#fa709a', '#fee140', '#30cfd0'
        ]
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'bottom'
        }
      }
    }
  });

  // Top Tags Chart
  const tagCtx = document.getElementById('tagChart').getContext('2d');
  const topTags = Object.entries(statistics.byTag)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  new Chart(tagCtx, {
    type: 'bar',
    data: {
      labels: topTags.map(([tag]) => tag),
      datasets: [{
        label: 'Count',
        data: topTags.map(([, count]) => count),
        backgroundColor: '#667eea'
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1
          }
        }
      }
    }
  });
}

/**
 * Render content list
 */
function renderContentList(contents) {
  const container = document.getElementById('contentList');
  container.innerHTML = '';

  // Limit to first 50 items for performance
  const displayContents = contents.slice(0, 50);

  displayContents.forEach(content => {
    const item = document.createElement('div');
    item.className = 'border border-gray-200 rounded-lg p-4 hover:shadow-md transition';
    
    item.innerHTML = `
      <div class="flex justify-between items-start mb-2">
        <h3 class="font-semibold text-gray-800">${escapeHtml(content.title)}</h3>
        <span class="text-xs text-gray-500">${new Date(content.timestamp).toLocaleDateString()}</span>
      </div>
      <p class="text-sm text-gray-600 mb-2">${escapeHtml(content.preview)}</p>
      <div class="flex items-center justify-between">
        <div class="flex flex-wrap gap-1">
          ${content.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
        </div>
        <span class="text-xs bg-gray-100 px-2 py-1 rounded">${content.type}</span>
      </div>
      ${content.url ? `<a href="${escapeHtml(content.url)}" target="_blank" class="text-xs text-blue-600 hover:underline mt-2 inline-block">View Source →</a>` : ''}
    `;
    
    container.appendChild(item);
  });

  // Show count if limited
  if (contents.length > 50) {
    const moreInfo = document.createElement('p');
    moreInfo.className = 'text-center text-gray-500 mt-4';
    moreInfo.textContent = `Showing 50 of ${contents.length} items`;
    container.appendChild(moreInfo);
  }
}

/**
 * Export report to PDF
 */
async function exportToPDF() {
  const element = document.getElementById('reportContent');
  const opt = {
    margin: 10,
    filename: `pocket-report-${Date.now()}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  try {
    await html2pdf().set(opt).from(element).save();
  } catch (error) {
    console.error('PDF export failed:', error);
    alert('Failed to export PDF. Please try again.');
  }
}

/**
 * Show error message
 */
function showError(message) {
  document.getElementById('loading').innerHTML = `
    <div class="text-center py-12">
      <div class="text-red-600 text-6xl mb-4">⚠️</div>
      <h2 class="text-2xl font-bold text-gray-800 mb-2">Error</h2>
      <p class="text-gray-600">${escapeHtml(message)}</p>
      <button onclick="location.reload()" class="mt-4 bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700">
        Try Again
      </button>
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
