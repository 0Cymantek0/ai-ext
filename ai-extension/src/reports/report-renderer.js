const SUPPORT_LABELS = {
  grounded: "Grounded",
  weak: "Needs support",
  conflicted: "Conflicted",
};

function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function dedupeById(items, key) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const value = item?.[key];
    if (!value || seen.has(value)) {
      continue;
    }

    seen.add(value);
    result.push(item);
  }

  return result;
}

export class ReportRenderer {
  constructor(container) {
    this.container = container;
    this.dialog = null;
    this.currentPayload = null;
    this.citationsById = new Map();
    this.supportMapByClaimId = new Map();
  }

  render(payload) {
    this.currentPayload = payload;
    this.citationsById = new Map(
      (payload.citations || []).map((citation) => [citation.citationId, citation]),
    );
    this.supportMapByClaimId = new Map(
      (payload.supportMap || []).map((entry) => [entry.claimId, entry]),
    );

    this.ensureStyles();
    this.container.innerHTML = "";
    this.container.className = "report-shell";
    document.body.classList.add("report-body");
    document.title = payload.title || "Pocket Report";

    const page = document.createElement("div");
    page.className = "report-page";

    page.appendChild(this.renderHeader(payload));
    page.appendChild(this.renderOverview(payload));
    page.appendChild(this.renderSectionNav(payload.sections || []));

    for (const section of payload.sections || []) {
      page.appendChild(this.renderSection(section));
    }

    page.appendChild(this.renderCitationCatalog(payload.citations || []));
    this.container.appendChild(page);

    this.dialog = this.renderEvidenceDialog();
    this.container.appendChild(this.dialog);
  }

  ensureStyles() {
    if (document.getElementById("report-renderer-styles")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "report-renderer-styles";
    style.textContent = `
      :root {
        color-scheme: dark;
        --report-bg: #0b1020;
        --report-surface: rgba(11, 18, 32, 0.86);
        --report-surface-strong: rgba(15, 23, 42, 0.96);
        --report-border: rgba(148, 163, 184, 0.18);
        --report-text: #e2e8f0;
        --report-muted: #94a3b8;
        --report-accent: #22c55e;
        --report-warn: #f59e0b;
        --report-danger: #f97316;
        --report-link: #7dd3fc;
      }

      body.report-body {
        margin: 0;
        min-height: 100vh;
        color: var(--report-text);
        background:
          radial-gradient(circle at top, rgba(34, 197, 94, 0.14), transparent 24rem),
          linear-gradient(180deg, #020617 0%, #0b1020 100%);
        font-family: "Segoe UI", Inter, system-ui, sans-serif;
      }

      .report-shell {
        min-height: 100vh;
      }

      .report-page {
        width: min(1120px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 32px 0 56px;
      }

      .report-card {
        background: var(--report-surface);
        border: 1px solid var(--report-border);
        border-radius: 24px;
        box-shadow: 0 20px 60px rgba(2, 6, 23, 0.34);
        backdrop-filter: blur(16px);
      }

      .report-header {
        padding: 32px;
        margin-bottom: 20px;
      }

      .report-eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #bbf7d0;
        background: rgba(34, 197, 94, 0.14);
      }

      .report-title {
        margin: 18px 0 12px;
        font-size: clamp(32px, 5vw, 56px);
        line-height: 1.05;
        letter-spacing: -0.03em;
      }

      .report-subtitle {
        margin: 0;
        max-width: 70ch;
        font-size: 18px;
        line-height: 1.7;
        color: var(--report-muted);
      }

      .report-meta,
      .report-stat-grid,
      .report-nav-list,
      .claim-citations,
      .evidence-list,
      .citation-list {
        display: grid;
        gap: 12px;
      }

      .report-meta {
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        margin-top: 24px;
      }

      .meta-chip,
      .stat-card,
      .nav-link,
      .claim-card,
      .citation-card,
      .evidence-card {
        border: 1px solid var(--report-border);
        background: var(--report-surface-strong);
        border-radius: 18px;
      }

      .meta-chip {
        padding: 14px 16px;
      }

      .meta-label,
      .stat-label,
      .citation-meta,
      .claim-meta,
      .evidence-meta {
        color: var(--report-muted);
        font-size: 13px;
      }

      .meta-value {
        display: block;
        margin-top: 6px;
        font-size: 15px;
        font-weight: 600;
      }

      .report-overview,
      .report-nav,
      .report-section,
      .report-citations {
        padding: 24px;
        margin-bottom: 20px;
      }

      .section-heading {
        margin: 0 0 8px;
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #bbf7d0;
      }

      .section-title {
        margin: 0 0 10px;
        font-size: 28px;
        letter-spacing: -0.02em;
      }

      .section-summary {
        margin: 0;
        color: var(--report-muted);
        line-height: 1.7;
      }

      .report-stat-grid {
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        margin-top: 18px;
      }

      .stat-card {
        padding: 18px;
      }

      .stat-value {
        display: block;
        margin-top: 8px;
        font-size: 26px;
        font-weight: 700;
      }

      .report-nav-list {
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        margin-top: 18px;
      }

      .nav-link {
        display: block;
        padding: 18px;
        color: inherit;
        text-decoration: none;
      }

      .nav-link:hover,
      .citation-link:hover,
      .source-link:hover,
      .evidence-source:hover {
        border-color: rgba(125, 211, 252, 0.44);
        color: white;
      }

      .nav-link strong {
        display: block;
        margin-bottom: 8px;
        font-size: 16px;
      }

      .claim-stack,
      .citation-list {
        margin-top: 18px;
      }

      .claim-stack {
        display: grid;
        gap: 16px;
      }

      .claim-card {
        padding: 18px;
      }

      .claim-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
      }

      .support-chip {
        display: inline-flex;
        align-items: center;
        padding: 6px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        border: 1px solid transparent;
      }

      .support-grounded {
        color: #bbf7d0;
        background: rgba(34, 197, 94, 0.14);
        border-color: rgba(34, 197, 94, 0.24);
      }

      .support-weak {
        color: #fde68a;
        background: rgba(245, 158, 11, 0.14);
        border-color: rgba(245, 158, 11, 0.24);
      }

      .support-conflicted {
        color: #fdba74;
        background: rgba(249, 115, 22, 0.14);
        border-color: rgba(249, 115, 22, 0.24);
      }

      .claim-text,
      .citation-excerpt,
      .evidence-excerpt {
        margin: 0;
        line-height: 1.7;
      }

      .claim-meta {
        margin-top: 10px;
      }

      .claim-citations {
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        margin-top: 14px;
      }

      .citation-link,
      .source-link,
      .evidence-source {
        display: block;
        padding: 12px 14px;
        border-radius: 14px;
        border: 1px solid var(--report-border);
        background: rgba(30, 41, 59, 0.72);
        color: var(--report-link);
        text-decoration: none;
      }

      .claim-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 14px;
      }

      .claim-button {
        appearance: none;
        border: 1px solid rgba(125, 211, 252, 0.24);
        background: rgba(14, 116, 144, 0.14);
        color: #bae6fd;
        border-radius: 999px;
        padding: 9px 14px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
      }

      .claim-button:hover {
        background: rgba(14, 116, 144, 0.24);
      }

      .citation-list {
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      }

      .citation-card {
        padding: 18px;
      }

      .citation-header {
        display: flex;
        gap: 10px;
        align-items: center;
        margin-bottom: 10px;
      }

      .citation-label {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 44px;
        height: 32px;
        padding: 0 10px;
        border-radius: 999px;
        background: rgba(34, 197, 94, 0.12);
        color: #bbf7d0;
        font-weight: 700;
      }

      .dialog-backdrop {
        position: fixed;
        inset: 0;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: rgba(2, 6, 23, 0.74);
        z-index: 1000;
      }

      .dialog-backdrop.is-open {
        display: flex;
      }

      .dialog-panel {
        width: min(780px, 100%);
        max-height: min(80vh, 900px);
        overflow: auto;
        padding: 24px;
        border-radius: 24px;
        border: 1px solid var(--report-border);
        background: rgba(2, 6, 23, 0.98);
        box-shadow: 0 28px 80px rgba(2, 6, 23, 0.56);
      }

      .dialog-header {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: flex-start;
        margin-bottom: 18px;
      }

      .dialog-title {
        margin: 0;
        font-size: 22px;
      }

      .dialog-close {
        appearance: none;
        border: 1px solid var(--report-border);
        background: rgba(30, 41, 59, 0.72);
        color: var(--report-text);
        border-radius: 999px;
        padding: 8px 12px;
        cursor: pointer;
      }

      .evidence-list {
        margin-top: 12px;
      }

      .evidence-card {
        padding: 16px;
      }

      .evidence-card blockquote {
        margin: 12px 0 0;
        padding: 0 0 0 14px;
        border-left: 3px solid rgba(125, 211, 252, 0.34);
        color: var(--report-text);
      }

      @media (max-width: 720px) {
        .report-page {
          width: min(100vw - 20px, 1120px);
          padding: 18px 0 32px;
        }

        .report-header,
        .report-overview,
        .report-nav,
        .report-section,
        .report-citations {
          padding: 18px;
        }

        .claim-header,
        .dialog-header {
          flex-direction: column;
          align-items: flex-start;
        }
      }
    `;

    document.head.appendChild(style);
  }

  renderHeader(payload) {
    const card = this.createCard("report-header");
    const eyebrow = document.createElement("div");
    eyebrow.className = "report-eyebrow";
    eyebrow.textContent = "Citation-backed report";

    const title = document.createElement("h1");
    title.className = "report-title";
    title.textContent = payload.title;

    const subtitle = document.createElement("p");
    subtitle.className = "report-subtitle";
    subtitle.textContent = payload.subtitle;

    const meta = document.createElement("div");
    meta.className = "report-meta";
    meta.appendChild(this.createMetaChip("Report ID", payload.reportId));
    meta.appendChild(this.createMetaChip("Pocket ID", payload.pocketId));
    meta.appendChild(
      this.createMetaChip("Generated", formatTimestamp(payload.generatedAt)),
    );
    if (payload.metadata?.modelId) {
      meta.appendChild(this.createMetaChip("Model", payload.metadata.modelId));
    }

    card.append(eyebrow, title, subtitle, meta);
    return card;
  }

  renderOverview(payload) {
    const card = this.createCard("report-overview");
    const heading = document.createElement("div");
    heading.className = "section-heading";
    heading.textContent = "Overview";

    const title = document.createElement("h2");
    title.className = "section-title";
    title.textContent = "Coverage and support posture";

    const summary = document.createElement("p");
    summary.className = "section-summary";
    summary.textContent =
      "Each claim is tied to captured evidence excerpts. Review weak and conflicted claims before treating them as settled conclusions.";

    const stats = document.createElement("div");
    stats.className = "report-stat-grid";
    stats.appendChild(this.createStatCard("Sections", String(payload.sections.length)));
    stats.appendChild(
      this.createStatCard("Evidence items", String(payload.metadata?.evidenceCount ?? 0)),
    );
    stats.appendChild(
      this.createStatCard("Weak claims", String(payload.metadata?.weakClaimCount ?? 0)),
    );
    stats.appendChild(
      this.createStatCard(
        "Conflicted claims",
        String(payload.metadata?.conflictedClaimCount ?? 0),
      ),
    );

    card.append(heading, title, summary, stats);
    return card;
  }

  renderSectionNav(sections) {
    const card = this.createCard("report-nav");
    const heading = document.createElement("div");
    heading.className = "section-heading";
    heading.textContent = "Sections";

    const title = document.createElement("h2");
    title.className = "section-title";
    title.textContent = "Jump to a section";

    const list = document.createElement("div");
    list.className = "report-nav-list";

    for (const section of sections) {
      const link = document.createElement("a");
      link.className = "nav-link";
      link.href = `#${section.sectionId}`;

      const strong = document.createElement("strong");
      strong.textContent = section.title;
      const text = document.createElement("span");
      text.className = "section-summary";
      text.textContent = section.summary;

      link.append(strong, text);
      list.appendChild(link);
    }

    card.append(heading, title, list);
    return card;
  }

  renderSection(section) {
    const card = this.createCard("report-section");
    card.id = section.sectionId;

    const heading = document.createElement("div");
    heading.className = "section-heading";
    heading.textContent = "Section";

    const title = document.createElement("h2");
    title.className = "section-title";
    title.textContent = section.title;

    const summary = document.createElement("p");
    summary.className = "section-summary";
    summary.textContent = section.summary;

    const claims = document.createElement("div");
    claims.className = "claim-stack";
    for (const claim of section.claims || []) {
      claims.appendChild(this.renderClaim(section, claim));
    }

    card.append(heading, title, summary, claims);
    return card;
  }

  renderClaim(section, claim) {
    const card = document.createElement("article");
    card.className = "claim-card";

    const header = document.createElement("div");
    header.className = "claim-header";

    const claimLabel = document.createElement("div");
    claimLabel.className = "claim-meta";
    claimLabel.textContent = claim.claimId;

    const support = document.createElement("span");
    support.className = `support-chip support-${claim.support}`;
    support.textContent = SUPPORT_LABELS[claim.support] || claim.support;

    header.append(claimLabel, support);

    const text = document.createElement("p");
    text.className = "claim-text";
    text.textContent = claim.text;

    const meta = document.createElement("p");
    meta.className = "claim-meta";
    const supportEntry = this.supportMapByClaimId.get(claim.claimId);
    const sourceCount = supportEntry?.sourceUrls?.length ?? 0;
    meta.textContent =
      sourceCount > 0
        ? `${sourceCount} source URL${sourceCount === 1 ? "" : "s"} linked`
        : "No source URLs recorded";

    const citationGrid = document.createElement("div");
    citationGrid.className = "claim-citations";
    for (const citationId of claim.citationIds || []) {
      const citation = this.citationsById.get(citationId);
      if (!citation) {
        continue;
      }

      const link = document.createElement("a");
      link.className = "citation-link";
      link.href = `#${citation.citationId}`;
      link.textContent = `${citation.label} ${citation.sourceTitle || citation.sourceUrl || citation.evidenceId}`;
      citationGrid.appendChild(link);
    }

    const actions = document.createElement("div");
    actions.className = "claim-actions";

    if ((claim.evidenceIds || []).length > 0) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "claim-button";
      button.textContent = "View supporting evidence";
      button.addEventListener("click", () => {
        this.openEvidenceDialog(section, claim);
      });
      actions.appendChild(button);
    }

    if (claim.unresolvedReason) {
      const unresolved = document.createElement("p");
      unresolved.className = "claim-meta";
      unresolved.textContent = `Open issue: ${claim.unresolvedReason}`;
      card.append(header, text, unresolved);
    } else {
      card.append(header, text);
    }

    card.append(meta);
    if (citationGrid.childElementCount > 0) {
      card.append(citationGrid);
    }
    if (actions.childElementCount > 0) {
      card.append(actions);
    }

    return card;
  }

  renderCitationCatalog(citations) {
    const card = this.createCard("report-citations");
    const heading = document.createElement("div");
    heading.className = "section-heading";
    heading.textContent = "Evidence";

    const title = document.createElement("h2");
    title.className = "section-title";
    title.textContent = "Citation catalog";

    const list = document.createElement("div");
    list.className = "citation-list";

    for (const citation of dedupeById(citations, "citationId")) {
      const article = document.createElement("article");
      article.className = "citation-card";
      article.id = citation.citationId;

      const header = document.createElement("div");
      header.className = "citation-header";

      const label = document.createElement("span");
      label.className = "citation-label";
      label.textContent = citation.label;

      const titleBlock = document.createElement("div");
      const titleText = document.createElement("strong");
      titleText.textContent =
        citation.sourceTitle || citation.sourceUrl || citation.evidenceId;
      const meta = document.createElement("div");
      meta.className = "citation-meta";
      meta.textContent = citation.evidenceId;
      titleBlock.append(titleText, meta);

      header.append(label, titleBlock);

      const excerpt = document.createElement("p");
      excerpt.className = "citation-excerpt";
      excerpt.textContent = citation.excerpt;

      article.append(header, excerpt);

      if (citation.sourceUrl) {
        const source = document.createElement("a");
        source.className = "source-link";
        source.href = citation.sourceUrl;
        source.target = "_blank";
        source.rel = "noreferrer";
        source.textContent = citation.sourceUrl;
        article.appendChild(source);
      }

      list.appendChild(article);
    }

    card.append(heading, title, list);
    return card;
  }

  renderEvidenceDialog() {
    const backdrop = document.createElement("div");
    backdrop.className = "dialog-backdrop";

    const panel = document.createElement("div");
    panel.className = "dialog-panel";

    const header = document.createElement("div");
    header.className = "dialog-header";

    const headingBlock = document.createElement("div");
    const title = document.createElement("h3");
    title.className = "dialog-title";
    title.textContent = "Supporting evidence";
    const subtitle = document.createElement("p");
    subtitle.className = "section-summary";
    subtitle.id = "dialogSubtitle";
    headingBlock.append(title, subtitle);

    const close = document.createElement("button");
    close.type = "button";
    close.className = "dialog-close";
    close.textContent = "Close";
    close.addEventListener("click", () => this.closeEvidenceDialog());

    header.append(headingBlock, close);

    const content = document.createElement("div");
    content.className = "evidence-list";
    content.id = "dialogEvidenceList";

    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) {
        this.closeEvidenceDialog();
      }
    });

    panel.append(header, content);
    backdrop.appendChild(panel);
    return backdrop;
  }

  openEvidenceDialog(section, claim) {
    if (!this.dialog) {
      return;
    }

    const subtitle = this.dialog.querySelector("#dialogSubtitle");
    const list = this.dialog.querySelector("#dialogEvidenceList");
    if (!subtitle || !list) {
      return;
    }

    subtitle.textContent = `${section.title} • ${SUPPORT_LABELS[claim.support] || claim.support}`;
    list.innerHTML = "";

    const citations = dedupeById(
      (claim.citationIds || [])
        .map((citationId) => this.citationsById.get(citationId))
        .filter(Boolean),
      "citationId",
    );

    for (const citation of citations) {
      const card = document.createElement("article");
      card.className = "evidence-card";

      const label = document.createElement("div");
      label.className = "citation-meta";
      label.textContent = `${citation.label} • ${citation.evidenceId}`;

      const title = document.createElement("strong");
      title.textContent =
        citation.sourceTitle || citation.sourceUrl || citation.evidenceId;

      const excerpt = document.createElement("blockquote");
      excerpt.className = "evidence-excerpt";
      excerpt.textContent = citation.excerpt;

      card.append(label, title, excerpt);

      if (citation.sourceUrl) {
        const link = document.createElement("a");
        link.className = "evidence-source";
        link.href = citation.sourceUrl;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = citation.sourceUrl;
        card.appendChild(link);
      }

      list.appendChild(card);
    }

    this.dialog.classList.add("is-open");
    document.body.style.overflow = "hidden";
  }

  closeEvidenceDialog() {
    if (!this.dialog) {
      return;
    }

    this.dialog.classList.remove("is-open");
    document.body.style.overflow = "";
  }

  createCard(className) {
    const card = document.createElement("section");
    card.className = `report-card ${className}`;
    return card;
  }

  createMetaChip(label, value) {
    const chip = document.createElement("div");
    chip.className = "meta-chip";

    const labelNode = document.createElement("span");
    labelNode.className = "meta-label";
    labelNode.textContent = label;

    const valueNode = document.createElement("span");
    valueNode.className = "meta-value";
    valueNode.textContent = value;

    chip.append(labelNode, valueNode);
    return chip;
  }

  createStatCard(label, value) {
    const card = document.createElement("div");
    card.className = "stat-card";

    const labelNode = document.createElement("span");
    labelNode.className = "stat-label";
    labelNode.textContent = label;

    const valueNode = document.createElement("span");
    valueNode.className = "stat-value";
    valueNode.textContent = value;

    card.append(labelNode, valueNode);
    return card;
  }
}
