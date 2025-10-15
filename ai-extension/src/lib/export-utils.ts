import { jsPDF } from "jspdf";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  files?: File[] | undefined;
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
  const firstUserMessage = messages.find(m => m.role === 'user')?.content || '';

  // Extract key words (simple approach)
  const words = firstUserMessage
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3 && !['what', 'how', 'when', 'where', 'why', 'this', 'that', 'with', 'from', 'have', 'been'].includes(w));

  if (words.length === 0) return 'AI Conversation';

  // Take first 3-5 meaningful words and capitalize
  const titleWords = words.slice(0, Math.min(5, words.length))
    .map(w => w.charAt(0).toUpperCase() + w.slice(1));

  return titleWords.join(' ');
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
  let yPosition = margin;

  /**
   * Helper function to check if we need a new page and add one if necessary
   */
  const checkAndAddPage = (requiredSpace: number = lineHeight): void => {
    if (yPosition + requiredSpace > pageHeight - bottomMargin) {
      doc.addPage();
      yPosition = margin;
    }
  };

  /**
   * Parse and render formatted text with markdown-style formatting
   */
  const renderFormattedText = (text: string): void => {
    // Split content into code blocks and regular text
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const parts: Array<{ type: 'code' | 'text', content: string, language?: string }> = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      // Add text before code block
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
      }
      // Add code block
      const codePart: { type: 'code' | 'text', content: string, language?: string } = {
        type: 'code',
        content: match[2] || ''
      };
      if (match[1]) {
        codePart.language = match[1];
      }
      parts.push(codePart);
      lastIndex = match.index + match[0].length;
    }
    // Add remaining text
    if (lastIndex < text.length) {
      parts.push({ type: 'text', content: text.slice(lastIndex) });
    }

    // Render each part
    parts.forEach(part => {
      if (part.type === 'code') {
        renderCodeBlock(part.content, part.language);
      } else {
        renderTextWithInlineFormatting(part.content);
      }
    });
  };

  /**
   * Render code block with background and monospace font - allows page breaks
   */
  const renderCodeBlock = (code: string, language?: string): void => {
    checkAndAddPage(15);

    // Add language label header with dark background (like in the image)
    if (language) {
      // Draw dark header background with increased height
      doc.setFillColor(50, 50, 50);
      doc.rect(margin, yPosition, maxWidth, 9, 'F');

      // Add language text in white with better vertical positioning
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text(language.toUpperCase(), margin + 4, yPosition + 6);
      yPosition += 9;
    }

    // Process code line by line with proper wrapping and page breaks
    const codeLines = code.trim().split('\n');
    const codePadding = 5; // Increased padding inside code block
    const codeMaxWidth = maxWidth - (codePadding * 2);

    doc.setFontSize(8);
    doc.setFont("courier", "normal");
    doc.setTextColor(40, 40, 40);

    // Add top padding for first line
    yPosition += 3;

    codeLines.forEach(line => {
      // Wrap long lines to fit within code block width
      const wrappedLines = doc.splitTextToSize(line || ' ', codeMaxWidth);

      wrappedLines.forEach((wrappedLine: string) => {
        checkAndAddPage(5);

        // Draw light gray background for this line with increased height
        doc.setFillColor(245, 247, 250);
        doc.rect(margin, yPosition - 3.5, maxWidth, 6, 'F');

        // Add code text with proper padding
        doc.text(wrappedLine, margin + codePadding, yPosition);
        yPosition += 5.5;
      });
    });

    // Add bottom padding
    yPosition += 3;
  };

  /**
   * Render text with inline formatting (bold, italic, inline code)
   */
  const renderTextWithInlineFormatting = (text: string): void => {
    const lines = text.split('\n');

    lines.forEach(line => {
      if (!line.trim()) {
        yPosition += 3;
        return;
      }

      // Check for headers
      const headerMatch = line.match(/^(#{1,3})\s+(.+)$/);
      if (headerMatch && headerMatch[1] && headerMatch[2]) {
        const level = headerMatch[1].length;
        const headerText = headerMatch[2];
        checkAndAddPage(8);

        doc.setFontSize(16 - level * 2);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 0, 0);

        const headerLines = doc.splitTextToSize(headerText, maxWidth);
        headerLines.forEach((hLine: string) => {
          checkAndAddPage(6);
          doc.text(hLine, margin, yPosition);
          yPosition += 6;
        });
        yPosition += 2;
        return;
      }

      // Check for bullet points
      const bulletMatch = line.match(/^[\s]*[-*]\s+(.+)$/);
      if (bulletMatch && bulletMatch[1]) {
        checkAndAddPage(5);

        // Draw bullet
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(0, 0, 0);
        doc.text("•", margin + 2, yPosition);

        // Render bullet content with inline formatting and word wrapping
        const bulletContent = bulletMatch[1];
        const segments = parseInlineFormatting(bulletContent);

        let xPos = margin + 7;
        const bulletRightMargin = pageWidth - margin;

        segments.forEach(seg => {
          doc.setFontSize(seg.type === 'code' ? 9 : 10);

          if (seg.type === 'bold') {
            doc.setFont("helvetica", "bold");
          } else if (seg.type === 'italic') {
            doc.setFont("helvetica", "italic");
          } else if (seg.type === 'code') {
            doc.setFont("courier", "normal");
          } else {
            doc.setFont("helvetica", "normal");
          }

          // Split segment into words for wrapping
          const words = seg.text.split(' ');

          words.forEach((word, idx) => {
            const textToRender = idx === 0 ? word : ' ' + word;
            const textWidth = doc.getTextWidth(textToRender);

            // Check if we need to wrap to next line
            if (xPos + textWidth > bulletRightMargin && xPos > margin + 7) {
              // Move to next line
              yPosition += 5;
              checkAndAddPage(5);
              xPos = margin + 7;
            }

            // Set colors and render
            if (seg.type === 'bold') {
              doc.setTextColor(0, 0, 0);
            } else if (seg.type === 'italic') {
              doc.setTextColor(0, 0, 0);
            } else if (seg.type === 'code') {
              doc.setTextColor(200, 50, 50);
              // Add background for inline code with padding
              doc.setFillColor(245, 245, 250);
              doc.rect(xPos - 1, yPosition - 3.5, textWidth + 2, 4.5, 'F');
            } else {
              doc.setTextColor(0, 0, 0);
            }

            doc.text(textToRender, xPos, yPosition);
            xPos += textWidth;
          });
        });

        yPosition += 5;
        return;
      }

      // Process inline formatting with proper bold/italic rendering
      renderLineWithFormatting(line);
    });
  };

  /**
   * Render a single line with mixed formatting (bold, italic, code, normal)
   */
  const renderLineWithFormatting = (line: string): void => {
    const segments = parseInlineFormatting(line);
    let xPosition = margin;
    let currentLineSegments: Array<{ text: string, type: string, width: number }> = [];

    segments.forEach(segment => {
      doc.setFontSize(segment.type === 'code' ? 9 : 10);

      if (segment.type === 'bold') {
        doc.setFont("helvetica", "bold");
      } else if (segment.type === 'italic') {
        doc.setFont("helvetica", "italic");
      } else if (segment.type === 'code') {
        doc.setFont("courier", "normal");
      } else {
        doc.setFont("helvetica", "normal");
      }

      // Split segment text by words to handle wrapping
      const words = segment.text.split(' ');

      words.forEach((word, idx) => {
        const textToAdd = idx === 0 ? word : ' ' + word;
        const textWidth = doc.getTextWidth(textToAdd);

        // Check if we need to wrap to next line
        if (xPosition + textWidth > pageWidth - margin && xPosition > margin) {
          // Render current line
          renderSegmentsOnLine(currentLineSegments);
          currentLineSegments = [];
          xPosition = margin;
          yPosition += 5;
          checkAndAddPage(5);
        }

        currentLineSegments.push({
          text: textToAdd,
          type: segment.type,
          width: textWidth
        });
        xPosition += textWidth;
      });
    });

    // Render remaining segments
    if (currentLineSegments.length > 0) {
      renderSegmentsOnLine(currentLineSegments);
      yPosition += 5;
    }
  };

  /**
   * Render segments on current line
   */
  const renderSegmentsOnLine = (segments: Array<{ text: string, type: string, width: number }>, startX: number = margin): void => {
    let xPos = startX;

    segments.forEach(seg => {
      doc.setFontSize(seg.type === 'code' ? 9 : 10);

      if (seg.type === 'bold') {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 0, 0);
      } else if (seg.type === 'italic') {
        doc.setFont("helvetica", "italic");
        doc.setTextColor(0, 0, 0);
      } else if (seg.type === 'code') {
        doc.setFont("courier", "normal");
        doc.setTextColor(200, 50, 50);
        // Add background for inline code with padding
        doc.setFillColor(245, 245, 250);
        doc.rect(xPos - 1, yPosition - 3.5, seg.width + 2, 4.5, 'F');
      } else {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(0, 0, 0);
      }

      doc.text(seg.text, xPos, yPosition);
      xPos += seg.width;
    });
  };

  /**
   * Parse inline formatting markers - process bold first, then italic, then code
   */
  const parseInlineFormatting = (text: string): Array<{ type: 'normal' | 'bold' | 'italic' | 'code', text: string }> => {
    const segments: Array<{ type: 'normal' | 'bold' | 'italic' | 'code', text: string }> = [];

    // Process in order: bold, then code, then italic (to avoid conflicts)
    const boldRegex = /\*\*(.+?)\*\*/g;
    const inlineCodeRegex = /`(.+?)`/g;
    const italicRegex = /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g;

    let processedText = text;

    // Replace bold first (to avoid conflict with italic)
    processedText = processedText.replace(boldRegex, (_match, bold) => {
      segments.push({ type: 'bold', text: bold });
      return `\x00${segments.length - 1}\x00`;
    });

    // Replace inline code
    processedText = processedText.replace(inlineCodeRegex, (_match, code) => {
      segments.push({ type: 'code', text: code });
      return `\x00${segments.length - 1}\x00`;
    });

    // Replace italic (single asterisk, not part of bold)
    processedText = processedText.replace(italicRegex, (_match, italic) => {
      segments.push({ type: 'italic', text: italic });
      return `\x00${segments.length - 1}\x00`;
    });

    // Split by markers and reconstruct
    const parts = processedText.split(/\x00(\d+)\x00/);
    const result: Array<{ type: 'normal' | 'bold' | 'italic' | 'code', text: string }> = [];

    parts.forEach((part, index) => {
      if (index % 2 === 0) {
        if (part) result.push({ type: 'normal', text: part });
      } else {
        const segment = segments[parseInt(part)];
        if (segment) result.push(segment);
      }
    });

    return result.length > 0 ? result : [{ type: 'normal', text }];
  };

  // Generate dynamic title
  const conversationTitle = generateConversationTitle(messages);

  // Title with gradient-like effect
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 60, 120);
  doc.text(conversationTitle, margin, yPosition);
  yPosition += 10;

  // Export date
  doc.setFontSize(9);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(120, 120, 120);
  checkAndAddPage(lineHeight);
  doc.text(`Exported: ${new Date().toLocaleString()}`, margin, yPosition);
  yPosition += 8;

  // Decorative separator line
  checkAndAddPage(lineHeight);
  doc.setDrawColor(30, 60, 120);
  doc.setLineWidth(0.5);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);
  yPosition += 12;

  // Messages
  messages.forEach((message, index) => {
    // Pill-shaped chip for role
    const roleColors: Record<string, { pill: [number, number, number], text: [number, number, number] }> = {
      user: { pill: [200, 220, 255], text: [20, 60, 140] },
      assistant: { pill: [200, 240, 200], text: [20, 100, 20] },
      system: { pill: [255, 240, 200], text: [160, 100, 20] }
    };

    const colors = roleColors[message.role] ?? { pill: [255, 240, 200] as [number, number, number], text: [160, 100, 20] as [number, number, number] };

    // Draw pill-shaped chip
    checkAndAddPage(10);

    const roleText = message.role === "user" ? "You" : message.role === "assistant" ? "AI Assistant" : "System";

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    const chipTextWidth = doc.getTextWidth(roleText);
    const chipWidth = chipTextWidth + 6;
    const chipHeight = 5;
    const chipRadius = chipHeight / 2;

    // Draw rounded rectangle (pill shape)
    doc.setFillColor(colors.pill[0], colors.pill[1], colors.pill[2]);
    doc.roundedRect(margin, yPosition - 1, chipWidth, chipHeight, chipRadius, chipRadius, 'F');

    // Draw chip text
    doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
    doc.text(roleText, margin + 3, yPosition + 2.5);

    // Timestamp next to chip
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    const timestampText = new Date(message.timestamp).toLocaleString();
    doc.text(timestampText, margin + chipWidth + 4, yPosition + 2.5);

    yPosition += 10; // Increased gap between chip and content

    // Files if present
    if (message.files && message.files.length > 0) {
      checkAndAddPage(6);
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(100, 100, 100);
      const filesText = `📎 ${message.files.map((f) => f.name).join(", ")}`;
      const fileLines = doc.splitTextToSize(filesText, maxWidth);

      fileLines.forEach((line: string) => {
        checkAndAddPage(4);
        doc.text(line, margin, yPosition);
        yPosition += 4;
      });
      yPosition += 2;
    }

    // Message content with rich formatting
    renderFormattedText(message.content);
    yPosition += 6;

    // Separator line between messages
    if (index < messages.length - 1) {
      checkAndAddPage(lineHeight);
      doc.setDrawColor(230, 230, 230);
      doc.setLineWidth(0.2);
      doc.line(margin, yPosition, pageWidth - margin, yPosition);
      yPosition += 8;
    }
  });

  // Save the PDF
  doc.save(filename);
}

/**
 * Helper function to download a file
 */
function downloadFile(content: string, filename: string, mimeType: string): void {
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
