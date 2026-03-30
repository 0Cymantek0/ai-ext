import { ReportRenderer } from "./report-renderer.js";

const loadingElement = document.getElementById("loading");
const loadingMessageElement = document.getElementById("loadingMessage");
const reportContainer = document.getElementById("reportContainer");

document.addEventListener("DOMContentLoaded", async () => {
  await loadReport();
});

async function loadReport() {
  const query = new URLSearchParams(window.location.search);
  const reportId = query.get("reportId");
  const pocketId = query.get("pocketId");
  const forceGenerate = query.get("generate") === "1";

  try {
    if (reportId) {
      showLoading("Loading report...");
      const report = await getReport(reportId);
      renderReport(report);
      return;
    }

    if (!pocketId) {
      throw new Error("A pocketId or reportId is required to open a report");
    }

    if (!forceGenerate) {
      showLoading("Loading report...");
      const latestReport = await getLatestReportForPocket(pocketId);
      if (latestReport) {
        const report = await getReport(latestReport.reportId);
        renderReport(report);
        return;
      }
    }

    showLoading("Generating report...");
    const generated = await generateReport(pocketId);
    replaceLocationWithReportId(generated.reportId, pocketId);
    renderReport(generated);
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  }
}

async function getReport(reportId) {
  const response = await chrome.runtime.sendMessage({
    kind: "REPORT_GET",
    requestId: crypto.randomUUID(),
    payload: { reportId },
  });

  if (!response?.success || !response?.data) {
    throw new Error(response?.error || "Failed to load report");
  }

  return response.data;
}

async function getLatestReportForPocket(pocketId) {
  const response = await chrome.runtime.sendMessage({
    kind: "REPORT_LIST",
    requestId: crypto.randomUUID(),
    payload: { pocketId },
  });

  if (!response?.success) {
    throw new Error(response?.error || "Failed to list reports");
  }

  return response?.data?.reports?.[0] || null;
}

async function generateReport(pocketId) {
  const response = await chrome.runtime.sendMessage({
    kind: "GENERATE_REPORT",
    requestId: crypto.randomUUID(),
    payload: { pocketId },
  });

  if (!response?.success || !response?.data) {
    throw new Error(response?.error || "Failed to generate report");
  }

  return response.data;
}

function renderReport(payload) {
  loadingElement.classList.add("hidden");
  reportContainer.classList.remove("hidden");
  new ReportRenderer(reportContainer).render(payload);
}

function showLoading(message) {
  loadingMessageElement.textContent = message;
}

function showError(message) {
  loadingElement.innerHTML = `
    <div class="error-state">
      <div class="error-icon">!</div>
      <h1>Report unavailable</h1>
      <p>${escapeHtml(message)}</p>
      <button type="button" id="retryButton">Try again</button>
    </div>
  `;

  document.getElementById("retryButton")?.addEventListener("click", () => {
    window.location.reload();
  });
}

function replaceLocationWithReportId(reportId, pocketId) {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("reportId", reportId);
  nextUrl.searchParams.set("pocketId", pocketId);
  nextUrl.searchParams.delete("generate");
  window.history.replaceState({}, "", nextUrl);
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}
