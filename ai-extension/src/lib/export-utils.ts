import { jsPDF } from "jspdf";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  files?: File[] | undefined;
}

interface PDFRenderContext {
  doc: jsPDF;
  yPosition: number;
  margin: number;
  maxWidth: number;
  pageWidth: number;
  pageHeight: number;
  lineHeight: number;
  bottomMargin: number;
}

/**
 * Export conversation to Markdown format
 */
export function exportToMarkdown(messages: ChatMessage[]): void {
  const timestamp = new Date().toISOString().split("T")[0];
  const filename = `conversation-${timestamp}.md`;

  let markdown = `# AI Conversation\n\n`;
  markdown += `**Exported:** ${new Date().toLocaleString()}\n\n`;
  markdown += `---\n\n`;

  messages.forEach((message) => {
    const date = new Date(message.timestamp).toLocaleString();
    const role =
      message.role === "user"
        ? "👤 You"
        : message.role === "assistant"
          ? "🤖 AI Assistant"
          : "ℹ️ System";

    markdown += `## ${role}\n`;
    markdown += `*${date}*\n\n`;

    if (message.files && message.files.length > 0) {
      markdown += `**Attachments:** ${message.files.map((f) => f.name).join(", ")}\n\n`;
    }

    markdown += `${message.content}\n\n`;
    markdown += `---\n\n`;
  });

  downloadFile(markdown, filename, "text/markdown");
}

/**
 * Export conversation to JSON format
 */
export function exportToJSON(messages: ChatMessage[]): void {
  const timestamp = new Date().toISOString().split("T")[0];
  const filename = `conversation-${timestamp}.json`;

  const exportData = {
    exportedAt: new Date().toISOString(),
    messageCount: messages.length,
    messages: messages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      date: new Date(msg.timestamp).toISOString(),
      files: msg.files?.map((f) => ({
        name: f.name,
        size: f.size,
        type: f.type,
      })),
    })),
  };

  const json = JSON.stringify(exportData, null, 2);
  downloadFile(json, filename, "application/json");
}

/**
 * Generate a dynamic title for the conversation based on content
 */
function generateConversationTitle(messages: ChatMessage[]): string {
  // Get first user message content
  const firstUserMessage =
    messages.find((m) => m.role === "user")?.content || "";

  // Extract key words (simple approach)
  const words = firstUserMessage
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter(
      (w) =>
        w.length > 3 &&
        ![
          "what",
          "how",
          "when",
          "where",
          "why",
          "this",
          "that",
          "with",
          "from",
          "have",
          "been",
        ].includes(w),
    );

  if (words.length === 0) return "AI Conversation";

  // Take first 3-5 meaningful words and capitalize
  const titleWords = words
    .slice(0, Math.min(5, words.length))
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));

  return titleWords.join(" ");
}

/**
 * Helper function to check if we need a new page and add one if necessary
 */
function checkAndAddPage(
  ctx: PDFRenderContext,
  requiredSpace: number = 5,
): void {
  if (ctx.yPosition + requiredSpace > ctx.pageHeight - ctx.bottomMargin) {
    ctx.doc.addPage();
    ctx.yPosition = ctx.margin;
  }
}

/**
 * Parse inline formatting markers - process bold first, then italic, then code
 */
function parseInlineFormatting(
  text: string,
): Array<{ type: "normal" | "bold" | "italic" | "code"; text: string }> {
  const segments: Array<{
    type: "normal" | "bold" | "italic" | "code";
    text: string;
  }> = [];

  // Process in order: bold, then code, then italic (to avoid conflicts)
  const boldRegex = /\*\*(.+?)\*\*/g;
  const inlineCodeRegex = /`(.+?)`/g;
  const italicRegex = /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g;

  let processedText = text;

  // Replace bold first (to avoid conflict with italic)
  processedText = processedText.replace(boldRegex, (_match, bold) => {
    segments.push({ type: "bold", text: bold });
    return `\x00${segments.length - 1}\x00`;
  });

  // Replace inline code
  processedText = processedText.replace(inlineCodeRegex, (_match, code) => {
    segments.push({ type: "code", text: code });
    return `\x00${segments.length - 1}\x00`;
  });

  // Replace italic (single asterisk, not part of bold)
  processedText = processedText.replace(italicRegex, (_match, italic) => {
    segments.push({ type: "italic", text: italic });
    return `\x00${segments.length - 1}\x00`;
  });

  // Split by markers and reconstruct
  const parts = processedText.split(/\x00(\d+)\x00/);
  const result: Array<{
    type: "normal" | "bold" | "italic" | "code";
    text: string;
  }> = [];

  parts.forEach((part, index) => {
    if (index % 2 === 0) {
      if (part) result.push({ type: "normal", text: part });
    } else {
      const segment = segments[parseInt(part)];
      if (segment) result.push(segment);
    }
  });

  return result.length > 0 ? result : [{ type: "normal", text }];
}

/**
 * Render segments on current line
 */
function renderSegmentsOnLine(
  ctx: PDFRenderContext,
  segments: Array<{ text: string; type: string; width: number }>,
  startX?: number,
): void {
  let xPos = startX ?? ctx.margin;

  segments.forEach((seg) => {
    ctx.doc.setFontSize(seg.type === "code" ? 9 : 10);

    if (seg.type === "bold") {
      ctx.doc.setFont("helvetica", "bold");
      ctx.doc.setTextColor(0, 0, 0);
    } else if (seg.type === "italic") {
      ctx.doc.setFont("helvetica", "italic");
      ctx.doc.setTextColor(0, 0, 0);
    } else if (seg.type === "code") {
      ctx.doc.setFont("courier", "normal");
      ctx.doc.setTextColor(200, 50, 50);
      // Add background for inline code with padding
      ctx.doc.setFillColor(245, 245, 250);
      ctx.doc.rect(xPos - 1, ctx.yPosition - 3.5, seg.width + 2, 4.5, "F");
    } else {
      ctx.doc.setFont("helvetica", "normal");
      ctx.doc.setTextColor(0, 0, 0);
    }

    ctx.doc.text(seg.text, xPos, ctx.yPosition);
    xPos += seg.width;
  });
}

/**
 * Render a single line with mixed formatting (bold, italic, code, normal)
 */
function renderLineWithFormatting(ctx: PDFRenderContext, line: string): void {
  const segments = parseInlineFormatting(line);
  let xPosition = ctx.margin;
  let currentLineSegments: Array<{
    text: string;
    type: string;
    width: number;
  }> = [];

  segments.forEach((segment) => {
    ctx.doc.setFontSize(segment.type === "code" ? 9 : 10);

    if (segment.type === "bold") {
      ctx.doc.setFont("helvetica", "bold");
    } else if (segment.type === "italic") {
      ctx.doc.setFont("helvetica", "italic");
    } else if (segment.type === "code") {
      ctx.doc.setFont("courier", "normal");
    } else {
      ctx.doc.setFont("helvetica", "normal");
    }

    // Split segment text by words to handle wrapping
    const words = segment.text.split(" ");

    words.forEach((word, idx) => {
      const textToAdd = idx === 0 ? word : " " + word;
      const textWidth = ctx.doc.getTextWidth(textToAdd);

      // Check if we need to wrap to next line
      if (
        xPosition + textWidth > ctx.pageWidth - ctx.margin &&
        xPosition > ctx.margin
      ) {
        // Render current line
        renderSegmentsOnLine(ctx, currentLineSegments);
        currentLineSegments = [];
        xPosition = ctx.margin;
        ctx.yPosition += 5;
        checkAndAddPage(ctx, 5);
      }

      currentLineSegments.push({
        text: textToAdd,
        type: segment.type,
        width: textWidth,
      });
      xPosition += textWidth;
    });
  });

  // Render remaining segments
  if (currentLineSegments.length > 0) {
    renderSegmentsOnLine(ctx, currentLineSegments);
    ctx.yPosition += 5;
  }
}

/**
 * Render code block with background and monospace font - allows page breaks
 */
function renderCodeBlock(
  ctx: PDFRenderContext,
  code: string,
  language?: string,
): void {
  checkAndAddPage(ctx, 15);

  // Add language label header with dark background (like in the image)
  if (language) {
    // Draw dark header background with increased height
    ctx.doc.setFillColor(50, 50, 50);
    ctx.doc.rect(ctx.margin, ctx.yPosition, ctx.maxWidth, 9, "F");

    // Add language text in white with better vertical positioning
    ctx.doc.setFontSize(9);
    ctx.doc.setFont("helvetica", "bold");
    ctx.doc.setTextColor(255, 255, 255);
    ctx.doc.text(language.toUpperCase(), ctx.margin + 4, ctx.yPosition + 6);
    ctx.yPosition += 9;
  }

  // Process code line by line with proper wrapping and page breaks
  const codeLines = code.trim().split("\n");
  const codePadding = 5; // Increased padding inside code block
  const codeMaxWidth = ctx.maxWidth - codePadding * 2;

  ctx.doc.setFontSize(8);
  ctx.doc.setFont("courier", "normal");
  ctx.doc.setTextColor(40, 40, 40);

  // Add top padding for first line
  ctx.yPosition += 3;

  codeLines.forEach((line) => {
    // Wrap long lines to fit within code block width
    const wrappedLines = ctx.doc.splitTextToSize(line || " ", codeMaxWidth);

    wrappedLines.forEach((wrappedLine: string) => {
      checkAndAddPage(ctx, 5);

      // Draw light gray background for this line with increased height
      ctx.doc.setFillColor(245, 247, 250);
      ctx.doc.rect(ctx.margin, ctx.yPosition - 3.5, ctx.maxWidth, 6, "F");

      // Add code text with proper padding
      ctx.doc.text(wrappedLine, ctx.margin + codePadding, ctx.yPosition);
      ctx.yPosition += 5.5;
    });
  });

  // Add bottom padding
  ctx.yPosition += 3;
}

/**
 * Render text with inline formatting (bold, italic, inline code)
 */
function renderTextWithInlineFormatting(
  ctx: PDFRenderContext,
  text: string,
): void {
  const lines = text.split("\n");

  lines.forEach((line) => {
    if (!line.trim()) {
      ctx.yPosition += 3;
      return;
    }

    // Check for headers
    const headerMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headerMatch && headerMatch[1] && headerMatch[2]) {
      const level = headerMatch[1].length;
      const headerText = headerMatch[2];
      checkAndAddPage(ctx, 8);

      ctx.doc.setFontSize(16 - level * 2);
      ctx.doc.setFont("helvetica", "bold");
      ctx.doc.setTextColor(0, 0, 0);

      const headerLines = ctx.doc.splitTextToSize(headerText, ctx.maxWidth);
      headerLines.forEach((hLine: string) => {
        checkAndAddPage(ctx, 6);
        ctx.doc.text(hLine, ctx.margin, ctx.yPosition);
        ctx.yPosition += 6;
      });
      ctx.yPosition += 2;
      return;
    }

    // Check for bullet points
    const bulletMatch = line.match(/^[\s]*[-*]\s+(.+)$/);
    if (bulletMatch && bulletMatch[1]) {
      checkAndAddPage(ctx, 5);

      // Draw bullet
      ctx.doc.setFontSize(10);
      ctx.doc.setFont("helvetica", "normal");
      ctx.doc.setTextColor(0, 0, 0);
      ctx.doc.text("•", ctx.margin + 2, ctx.yPosition);

      // Render bullet content with inline formatting and word wrapping
      const bulletContent = bulletMatch[1];
      const segments = parseInlineFormatting(bulletContent);

      let xPos = ctx.margin + 7;
      const bulletRightMargin = ctx.pageWidth - ctx.margin;

      segments.forEach((seg) => {
        ctx.doc.setFontSize(seg.type === "code" ? 9 : 10);

        if (seg.type === "bold") {
          ctx.doc.setFont("helvetica", "bold");
        } else if (seg.type === "italic") {
          ctx.doc.setFont("helvetica", "italic");
        } else if (seg.type === "code") {
          ctx.doc.setFont("courier", "normal");
        } else {
          ctx.doc.setFont("helvetica", "normal");
        }

        // Split segment into words for wrapping
        const words = seg.text.split(" ");

        words.forEach((word, idx) => {
          const textToRender = idx === 0 ? word : " " + word;
          const textWidth = ctx.doc.getTextWidth(textToRender);

          // Check if we need to wrap to next line
          if (xPos + textWidth > bulletRightMargin && xPos > ctx.margin + 7) {
            // Move to next line
            ctx.yPosition += 5;
            checkAndAddPage(ctx, 5);
            xPos = ctx.margin + 7;
          }

          // Set colors and render
          if (seg.type === "bold") {
            ctx.doc.setTextColor(0, 0, 0);
          } else if (seg.type === "italic") {
            ctx.doc.setTextColor(0, 0, 0);
          } else if (seg.type === "code") {
            ctx.doc.setTextColor(200, 50, 50);
            // Add background for inline code with padding
            ctx.doc.setFillColor(245, 245, 250);
            ctx.doc.rect(
              xPos - 1,
              ctx.yPosition - 3.5,
              textWidth + 2,
              4.5,
              "F",
            );
          } else {
            ctx.doc.setTextColor(0, 0, 0);
          }

          ctx.doc.text(textToRender, xPos, ctx.yPosition);
          xPos += textWidth;
        });
      });

      ctx.yPosition += 5;
      return;
    }

    // Process inline formatting with proper bold/italic rendering
    renderLineWithFormatting(ctx, line);
  });
}

/**
 * Parse and render formatted text with markdown-style formatting
 */
function renderFormattedText(ctx: PDFRenderContext, text: string): void {
  // Split content into code blocks and regular text
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  const parts: Array<{
    type: "code" | "text";
    content: string;
    language?: string;
  }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    // Add text before code block
    if (match.index > lastIndex) {
      parts.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    // Add code block
    const codePart: {
      type: "code" | "text";
      content: string;
      language?: string;
    } = {
      type: "code",
      content: match[2] || "",
    };
    if (match[1]) {
      codePart.language = match[1];
    }
    parts.push(codePart);
    lastIndex = match.index + match[0].length;
  }
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({ type: "text", content: text.slice(lastIndex) });
  }

  // Render each part
  parts.forEach((part) => {
    if (part.type === "code") {
      renderCodeBlock(ctx, part.content, part.language);
    } else {
      renderTextWithInlineFormatting(ctx, part.content);
    }
  });
}

/**
 * Export conversation to PDF format with rich text formatting
 */
export function exportToPDF(messages: ChatMessage[]): void {
  const timestamp = new Date().toISOString().split("T")[0];
  const filename = `conversation-${timestamp}.pdf`;

  // Create new PDF document
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20; // Increased top/bottom margins
  const maxWidth = pageWidth - 2 * margin;
  const lineHeight = 5;
  const bottomMargin = 20; // Increased bottom margin

  // Create rendering context
  const ctx: PDFRenderContext = {
    doc,
    yPosition: margin,
    margin,
    maxWidth,
    pageWidth,
    pageHeight,
    lineHeight,
    bottomMargin,
  };

  // Generate dynamic title
  const conversationTitle = generateConversationTitle(messages);

  // Title with gradient-like effect
  ctx.doc.setFontSize(22);
  ctx.doc.setFont("helvetica", "bold");
  ctx.doc.setTextColor(30, 60, 120);
  ctx.doc.text(conversationTitle, ctx.margin, ctx.yPosition);
  ctx.yPosition += 10;

  // Export date
  ctx.doc.setFontSize(9);
  ctx.doc.setFont("helvetica", "italic");
  ctx.doc.setTextColor(120, 120, 120);
  checkAndAddPage(ctx, ctx.lineHeight);
  ctx.doc.text(
    `Exported: ${new Date().toLocaleString()}`,
    ctx.margin,
    ctx.yPosition,
  );
  ctx.yPosition += 8;

  // Decorative separator line
  checkAndAddPage(ctx, ctx.lineHeight);
  ctx.doc.setDrawColor(30, 60, 120);
  ctx.doc.setLineWidth(0.5);
  ctx.doc.line(
    ctx.margin,
    ctx.yPosition,
    ctx.pageWidth - ctx.margin,
    ctx.yPosition,
  );
  ctx.yPosition += 12;

  // Messages
  messages.forEach((message, index) => {
    // Pill-shaped chip for role
    const roleColors: Record<
      string,
      { pill: [number, number, number]; text: [number, number, number] }
    > = {
      user: { pill: [200, 220, 255], text: [20, 60, 140] },
      assistant: { pill: [200, 240, 200], text: [20, 100, 20] },
      system: { pill: [255, 240, 200], text: [160, 100, 20] },
    };

    const colors = roleColors[message.role] ?? {
      pill: [255, 240, 200] as [number, number, number],
      text: [160, 100, 20] as [number, number, number],
    };

    // Draw pill-shaped chip
    checkAndAddPage(ctx, 10);

    const roleText =
      message.role === "user"
        ? "You"
        : message.role === "assistant"
          ? "AI Assistant"
          : "System";

    ctx.doc.setFontSize(9);
    ctx.doc.setFont("helvetica", "bold");
    const chipTextWidth = ctx.doc.getTextWidth(roleText);
    const chipWidth = chipTextWidth + 6;
    const chipHeight = 5;
    const chipRadius = chipHeight / 2;

    // Draw rounded rectangle (pill shape)
    ctx.doc.setFillColor(colors.pill[0], colors.pill[1], colors.pill[2]);
    ctx.doc.roundedRect(
      ctx.margin,
      ctx.yPosition - 1,
      chipWidth,
      chipHeight,
      chipRadius,
      chipRadius,
      "F",
    );

    // Draw chip text
    ctx.doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
    ctx.doc.text(roleText, ctx.margin + 3, ctx.yPosition + 2.5);

    // Timestamp next to chip
    ctx.doc.setFontSize(7);
    ctx.doc.setFont("helvetica", "normal");
    ctx.doc.setTextColor(120, 120, 120);
    const timestampText = new Date(message.timestamp).toLocaleString();
    ctx.doc.text(
      timestampText,
      ctx.margin + chipWidth + 4,
      ctx.yPosition + 2.5,
    );

    ctx.yPosition += 10; // Increased gap between chip and content

    // Files if present
    if (message.files && message.files.length > 0) {
      checkAndAddPage(ctx, 6);
      ctx.doc.setFontSize(8);
      ctx.doc.setFont("helvetica", "italic");
      ctx.doc.setTextColor(100, 100, 100);
      const filesText = `📎 ${message.files.map((f) => f.name).join(", ")}`;
      const fileLines = ctx.doc.splitTextToSize(filesText, ctx.maxWidth);

      fileLines.forEach((line: string) => {
        checkAndAddPage(ctx, 4);
        ctx.doc.text(line, ctx.margin, ctx.yPosition);
        ctx.yPosition += 4;
      });
      ctx.yPosition += 2;
    }

    // Message content with rich formatting
    renderFormattedText(ctx, message.content);
    ctx.yPosition += 6;

    // Separator line between messages
    if (index < messages.length - 1) {
      checkAndAddPage(ctx, ctx.lineHeight);
      ctx.doc.setDrawColor(230, 230, 230);
      ctx.doc.setLineWidth(0.2);
      ctx.doc.line(
        ctx.margin,
        ctx.yPosition,
        ctx.pageWidth - ctx.margin,
        ctx.yPosition,
      );
      ctx.yPosition += 8;
    }
  });

  // Save the PDF
  ctx.doc.save(filename);
}

/**
 * Export a single message to Markdown format
 */
export function exportMessageToMarkdown(message: ChatMessage): void {
  const timestamp = new Date().toISOString().split("T")[0];
  const filename = `message-${timestamp}.md`;

  const date = new Date(message.timestamp).toLocaleString();
  const role =
    message.role === "user"
      ? "👤 You"
      : message.role === "assistant"
        ? "🤖 AI Assistant"
        : "ℹ️ System";

  let markdown = `# AI Message\n\n`;
  markdown += `**Exported:** ${new Date().toLocaleString()}\n\n`;
  markdown += `---\n\n`;
  markdown += `## ${role}\n`;
  markdown += `*${date}*\n\n`;

  if (message.files && message.files.length > 0) {
    markdown += `**Attachments:** ${message.files.map((f) => f.name).join(", ")}\n\n`;
  }

  markdown += `${message.content}\n\n`;

  downloadFile(markdown, filename, "text/markdown");
}

/**
 * Export a single message to JSON format
 */
export function exportMessageToJSON(message: ChatMessage): void {
  const timestamp = new Date().toISOString().split("T")[0];
  const filename = `message-${timestamp}.json`;

  const exportData = {
    exportedAt: new Date().toISOString(),
    message: {
      id: message.id,
      role: message.role,
      content: message.content,
      timestamp: message.timestamp,
      date: new Date(message.timestamp).toISOString(),
      files: message.files?.map((f) => ({
        name: f.name,
        size: f.size,
        type: f.type,
      })),
    },
  };

  const json = JSON.stringify(exportData, null, 2);
  downloadFile(json, filename, "application/json");
}

/**
 * Export a single message to PDF format with rich text formatting
 */
export function exportMessageToPDF(message: ChatMessage): void {
  const timestamp = new Date().toISOString().split("T")[0];
  const filename = `message-${timestamp}.pdf`;

  // Create new PDF document
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const maxWidth = pageWidth - 2 * margin;
  const lineHeight = 5;
  const bottomMargin = 20;

  // Create rendering context
  const ctx: PDFRenderContext = {
    doc,
    yPosition: margin,
    margin,
    maxWidth,
    pageWidth,
    pageHeight,
    lineHeight,
    bottomMargin,
  };

  // Title
  ctx.doc.setFontSize(22);
  ctx.doc.setFont("helvetica", "bold");
  ctx.doc.setTextColor(30, 60, 120);
  ctx.doc.text("AI Message", ctx.margin, ctx.yPosition);
  ctx.yPosition += 10;

  // Export date
  ctx.doc.setFontSize(9);
  ctx.doc.setFont("helvetica", "italic");
  ctx.doc.setTextColor(120, 120, 120);
  ctx.doc.text(
    `Exported: ${new Date().toLocaleString()}`,
    ctx.margin,
    ctx.yPosition,
  );
  ctx.yPosition += 8;

  // Separator line
  ctx.doc.setDrawColor(30, 60, 120);
  ctx.doc.setLineWidth(0.5);
  ctx.doc.line(
    ctx.margin,
    ctx.yPosition,
    ctx.pageWidth - ctx.margin,
    ctx.yPosition,
  );
  ctx.yPosition += 12;

  // Role chip
  const roleColors: Record<
    string,
    { pill: [number, number, number]; text: [number, number, number] }
  > = {
    user: { pill: [200, 220, 255], text: [20, 60, 140] },
    assistant: { pill: [200, 240, 200], text: [20, 100, 20] },
    system: { pill: [255, 240, 200], text: [160, 100, 20] },
  };

  const colors = roleColors[message.role] ?? {
    pill: [255, 240, 200] as [number, number, number],
    text: [160, 100, 20] as [number, number, number],
  };
  const roleText =
    message.role === "user"
      ? "You"
      : message.role === "assistant"
        ? "AI Assistant"
        : "System";

  ctx.doc.setFontSize(9);
  ctx.doc.setFont("helvetica", "bold");
  const chipTextWidth = ctx.doc.getTextWidth(roleText);
  const chipWidth = chipTextWidth + 6;
  const chipHeight = 5;
  const chipRadius = chipHeight / 2;

  ctx.doc.setFillColor(colors.pill[0], colors.pill[1], colors.pill[2]);
  ctx.doc.roundedRect(
    ctx.margin,
    ctx.yPosition - 1,
    chipWidth,
    chipHeight,
    chipRadius,
    chipRadius,
    "F",
  );
  ctx.doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
  ctx.doc.text(roleText, ctx.margin + 3, ctx.yPosition + 2.5);

  // Timestamp
  ctx.doc.setFontSize(7);
  ctx.doc.setFont("helvetica", "normal");
  ctx.doc.setTextColor(120, 120, 120);
  const timestampText = new Date(message.timestamp).toLocaleString();
  ctx.doc.text(timestampText, ctx.margin + chipWidth + 4, ctx.yPosition + 2.5);
  ctx.yPosition += 10;

  // Files if present
  if (message.files && message.files.length > 0) {
    checkAndAddPage(ctx, 6);
    ctx.doc.setFontSize(8);
    ctx.doc.setFont("helvetica", "italic");
    ctx.doc.setTextColor(100, 100, 100);
    const filesText = `📎 ${message.files.map((f) => f.name).join(", ")}`;
    const fileLines = ctx.doc.splitTextToSize(filesText, ctx.maxWidth);
    fileLines.forEach((line: string) => {
      checkAndAddPage(ctx, 4);
      ctx.doc.text(line, ctx.margin, ctx.yPosition);
      ctx.yPosition += 4;
    });
    ctx.yPosition += 2;
  }

  // Message content with rich formatting
  renderFormattedText(ctx, message.content);

  ctx.doc.save(filename);
}

/**
 * Helper function to download a file
 */
function downloadFile(
  content: string,
  filename: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
