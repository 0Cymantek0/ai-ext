/**
 * Selection Preview UI Integration Tests
 * Tests the complete workflow from capture to preview to save
 * Requirements: 2.1, 2.2, 2.3, 17.1, 17.2
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SelectionPreviewUI } from "./selection-preview-ui";
import type { EditablePreview, ValidationResult } from "./content-capture";

describe("Selection Preview UI - Integration Tests", () => {
  let previewUI: SelectionPreviewUI;

  beforeEach(() => {
    previewUI = new SelectionPreviewUI();
    // Clear any existing preview elements
    document
      .querySelectorAll(
        "#ai-pocket-selection-preview, #ai-pocket-preview-backdrop",
      )
      .forEach((el) => el.remove());
  });

  afterEach(() => {
    previewUI.hide();
    // Clean up any remaining elements
    document
      .querySelectorAll(
        "#ai-pocket-selection-preview, #ai-pocket-preview-backdrop",
      )
      .forEach((el) => el.remove());
  });

  describe("Preview Display", () => {
    it("should display preview UI with valid selection", () => {
      const preview: EditablePreview = {
        id: "test-preview-1",
        text: "Selected text content",
        htmlContent: "<p>Selected text content</p>",
        context: {
          before: "Text before selection",
          after: "Text after selection",
          full: "Text before selection [Selected text content] Text after selection",
        },
        sourceLocation: {
          url: "https://example.com/page",
          elementPath: "body > div > p",
          containerTag: "p",
          position: { top: 100, left: 50, width: 300, height: 50 },
        },
        timestamp: Date.now(),
        editable: true,
        preview: "Selected text content",
      };

      const validation: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: [],
      };

      const onSave = vi.fn();
      const onCancel = vi.fn();

      previewUI.show(preview, validation, { onSave, onCancel });

      // Check if preview container exists
      const container = document.getElementById("ai-pocket-selection-preview");
      expect(container).toBeTruthy();

      // Check if backdrop exists
      const backdrop = document.getElementById("ai-pocket-preview-backdrop");
      expect(backdrop).toBeTruthy();

      // Check if textarea has correct content
      const textarea = document.getElementById(
        "ai-pocket-preview-textarea",
      ) as HTMLTextAreaElement;
      expect(textarea).toBeTruthy();
      expect(textarea.value).toBe("Selected text content");
    });

    it("should display validation errors", () => {
      const preview: EditablePreview = {
        id: "test-preview-2",
        text: "",
        htmlContent: "",
        context: {
          before: "",
          after: "",
          full: "",
        },
        sourceLocation: {
          url: "https://example.com",
          elementPath: "",
          containerTag: "",
          position: { top: 0, left: 0, width: 0, height: 0 },
        },
        timestamp: Date.now(),
        editable: true,
        preview: "",
      };

      const validation: ValidationResult = {
        isValid: false,
        errors: ["Selection is empty", "No content found"],
        warnings: [],
      };

      previewUI.show(preview, validation, {
        onSave: vi.fn(),
        onCancel: vi.fn(),
      });

      const container = document.getElementById("ai-pocket-selection-preview");
      expect(container).toBeTruthy();

      // Check if error box is displayed
      const errorText = container?.textContent || "";
      expect(errorText).toContain("Validation Errors");
      expect(errorText).toContain("Selection is empty");
      expect(errorText).toContain("No content found");
    });

    it("should display warnings", () => {
      const preview: EditablePreview = {
        id: "test-preview-3",
        text: "a".repeat(60000),
        htmlContent: "",
        context: {
          before: "",
          after: "",
          full: "",
        },
        sourceLocation: {
          url: "https://example.com",
          elementPath: "",
          containerTag: "",
          position: { top: 0, left: 0, width: 0, height: 0 },
        },
        timestamp: Date.now(),
        editable: true,
        preview: "",
      };

      const validation: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: ["Selection is very large (>50,000 characters)"],
      };

      previewUI.show(preview, validation, {
        onSave: vi.fn(),
        onCancel: vi.fn(),
      });

      const container = document.getElementById("ai-pocket-selection-preview");
      const warningText = container?.textContent || "";
      expect(warningText).toContain("Warnings");
      expect(warningText).toContain("very large");
    });

    it("should display source location info", () => {
      const preview: EditablePreview = {
        id: "test-preview-4",
        text: "Test text",
        htmlContent: "",
        context: {
          before: "",
          after: "",
          full: "",
        },
        sourceLocation: {
          url: "https://example.com/article",
          elementPath: "body > article > p:nth-child(3)",
          containerTag: "p",
          position: { top: 200, left: 100, width: 500, height: 100 },
        },
        timestamp: Date.now(),
        editable: true,
        preview: "",
      };

      const validation: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: [],
      };

      previewUI.show(preview, validation, {
        onSave: vi.fn(),
        onCancel: vi.fn(),
      });

      const container = document.getElementById("ai-pocket-selection-preview");
      const locationText = container?.textContent || "";
      expect(locationText).toContain("https://example.com/article");
      expect(locationText).toContain("body > article > p:nth-child(3)");
    });

    it("should display context sections", () => {
      const preview: EditablePreview = {
        id: "test-preview-5",
        text: "Selected text",
        htmlContent: "",
        context: {
          before: "This is the text before the selection",
          after: "This is the text after the selection",
          full: "This is the text before the selection [Selected text] This is the text after the selection",
        },
        sourceLocation: {
          url: "https://example.com",
          elementPath: "",
          containerTag: "",
          position: { top: 0, left: 0, width: 0, height: 0 },
        },
        timestamp: Date.now(),
        editable: true,
        preview: "",
      };

      const validation: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: [],
      };

      previewUI.show(preview, validation, {
        onSave: vi.fn(),
        onCancel: vi.fn(),
      });

      const container = document.getElementById("ai-pocket-selection-preview");
      const contextText = container?.textContent || "";
      expect(contextText).toContain("This is the text before the selection");
      expect(contextText).toContain("This is the text after the selection");
    });
  });

  describe("User Interactions", () => {
    it("should call onSave when save button is clicked", () => {
      const preview: EditablePreview = {
        id: "test-preview-6",
        text: "Original text",
        htmlContent: "",
        context: {
          before: "",
          after: "",
          full: "",
        },
        sourceLocation: {
          url: "https://example.com",
          elementPath: "",
          containerTag: "",
          position: { top: 0, left: 0, width: 0, height: 0 },
        },
        timestamp: Date.now(),
        editable: true,
        preview: "",
      };

      const validation: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: [],
      };

      const onSave = vi.fn();
      const onCancel = vi.fn();

      previewUI.show(preview, validation, { onSave, onCancel });

      // Find and click save button
      const container = document.getElementById("ai-pocket-selection-preview");
      const saveButton = Array.from(
        container?.querySelectorAll("button") || [],
      ).find((btn) => btn.textContent === "Save to Pocket");

      expect(saveButton).toBeTruthy();
      saveButton?.click();

      expect(onSave).toHaveBeenCalledWith("Original text");
      expect(onCancel).not.toHaveBeenCalled();

      // Check if preview is hidden
      const hiddenContainer = document.getElementById(
        "ai-pocket-selection-preview",
      );
      expect(hiddenContainer).toBeFalsy();
    });

    it("should call onCancel when cancel button is clicked", () => {
      const preview: EditablePreview = {
        id: "test-preview-7",
        text: "Test text",
        htmlContent: "",
        context: {
          before: "",
          after: "",
          full: "",
        },
        sourceLocation: {
          url: "https://example.com",
          elementPath: "",
          containerTag: "",
          position: { top: 0, left: 0, width: 0, height: 0 },
        },
        timestamp: Date.now(),
        editable: true,
        preview: "",
      };

      const validation: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: [],
      };

      const onSave = vi.fn();
      const onCancel = vi.fn();

      previewUI.show(preview, validation, { onSave, onCancel });

      // Find and click cancel button
      const container = document.getElementById("ai-pocket-selection-preview");
      const cancelButton = Array.from(
        container?.querySelectorAll("button") || [],
      ).find((btn) => btn.textContent === "Cancel");

      expect(cancelButton).toBeTruthy();
      cancelButton?.click();

      expect(onCancel).toHaveBeenCalled();
      expect(onSave).not.toHaveBeenCalled();
    });

    it("should call onCancel when backdrop is clicked", () => {
      const preview: EditablePreview = {
        id: "test-preview-8",
        text: "Test text",
        htmlContent: "",
        context: {
          before: "",
          after: "",
          full: "",
        },
        sourceLocation: {
          url: "https://example.com",
          elementPath: "",
          containerTag: "",
          position: { top: 0, left: 0, width: 0, height: 0 },
        },
        timestamp: Date.now(),
        editable: true,
        preview: "",
      };

      const validation: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: [],
      };

      const onSave = vi.fn();
      const onCancel = vi.fn();

      previewUI.show(preview, validation, { onSave, onCancel });

      // Click backdrop
      const backdrop = document.getElementById("ai-pocket-preview-backdrop");
      expect(backdrop).toBeTruthy();
      backdrop?.click();

      expect(onCancel).toHaveBeenCalled();
      expect(onSave).not.toHaveBeenCalled();
    });

    it("should call onCancel when Escape key is pressed", () => {
      const preview: EditablePreview = {
        id: "test-preview-9",
        text: "Test text",
        htmlContent: "",
        context: {
          before: "",
          after: "",
          full: "",
        },
        sourceLocation: {
          url: "https://example.com",
          elementPath: "",
          containerTag: "",
          position: { top: 0, left: 0, width: 0, height: 0 },
        },
        timestamp: Date.now(),
        editable: true,
        preview: "",
      };

      const validation: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: [],
      };

      const onSave = vi.fn();
      const onCancel = vi.fn();

      previewUI.show(preview, validation, { onSave, onCancel });

      // Simulate Escape key press
      const escapeEvent = new KeyboardEvent("keydown", { key: "Escape" });
      document.dispatchEvent(escapeEvent);

      expect(onCancel).toHaveBeenCalled();
      expect(onSave).not.toHaveBeenCalled();
    });

    it("should allow editing text in textarea", () => {
      const preview: EditablePreview = {
        id: "test-preview-10",
        text: "Original text",
        htmlContent: "",
        context: {
          before: "",
          after: "",
          full: "",
        },
        sourceLocation: {
          url: "https://example.com",
          elementPath: "",
          containerTag: "",
          position: { top: 0, left: 0, width: 0, height: 0 },
        },
        timestamp: Date.now(),
        editable: true,
        preview: "",
      };

      const validation: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: [],
      };

      const onSave = vi.fn();
      const onEdit = vi.fn();

      previewUI.show(preview, validation, {
        onSave,
        onCancel: vi.fn(),
        onEdit,
      });

      // Get textarea and change value
      const textarea = document.getElementById(
        "ai-pocket-preview-textarea",
      ) as HTMLTextAreaElement;
      expect(textarea).toBeTruthy();

      textarea.value = "Edited text";
      textarea.dispatchEvent(new Event("input"));

      expect(onEdit).toHaveBeenCalledWith("Edited text");
    });

    it("should save edited text", () => {
      const preview: EditablePreview = {
        id: "test-preview-11",
        text: "Original text",
        htmlContent: "",
        context: {
          before: "",
          after: "",
          full: "",
        },
        sourceLocation: {
          url: "https://example.com",
          elementPath: "",
          containerTag: "",
          position: { top: 0, left: 0, width: 0, height: 0 },
        },
        timestamp: Date.now(),
        editable: true,
        preview: "",
      };

      const validation: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: [],
      };

      const onSave = vi.fn();

      previewUI.show(preview, validation, { onSave, onCancel: vi.fn() });

      // Edit text
      const textarea = document.getElementById(
        "ai-pocket-preview-textarea",
      ) as HTMLTextAreaElement;
      textarea.value = "Modified text content";

      // Click save
      const container = document.getElementById("ai-pocket-selection-preview");
      const saveButton = Array.from(
        container?.querySelectorAll("button") || [],
      ).find((btn) => btn.textContent === "Save to Pocket");
      saveButton?.click();

      expect(onSave).toHaveBeenCalledWith("Modified text content");
    });

    it("should disable save button when validation fails", () => {
      const preview: EditablePreview = {
        id: "test-preview-12",
        text: "",
        htmlContent: "",
        context: {
          before: "",
          after: "",
          full: "",
        },
        sourceLocation: {
          url: "https://example.com",
          elementPath: "",
          containerTag: "",
          position: { top: 0, left: 0, width: 0, height: 0 },
        },
        timestamp: Date.now(),
        editable: true,
        preview: "",
      };

      const validation: ValidationResult = {
        isValid: false,
        errors: ["Selection is empty"],
        warnings: [],
      };

      previewUI.show(preview, validation, {
        onSave: vi.fn(),
        onCancel: vi.fn(),
      });

      const container = document.getElementById("ai-pocket-selection-preview");
      const saveButton = Array.from(
        container?.querySelectorAll("button") || [],
      ).find(
        (btn) => btn.textContent === "Save to Pocket",
      ) as HTMLButtonElement;

      expect(saveButton).toBeTruthy();
      expect(saveButton.disabled).toBe(true);
    });
  });

  describe("Cleanup", () => {
    it("should remove all elements when hidden", () => {
      const preview: EditablePreview = {
        id: "test-preview-13",
        text: "Test text",
        htmlContent: "",
        context: {
          before: "",
          after: "",
          full: "",
        },
        sourceLocation: {
          url: "https://example.com",
          elementPath: "",
          containerTag: "",
          position: { top: 0, left: 0, width: 0, height: 0 },
        },
        timestamp: Date.now(),
        editable: true,
        preview: "",
      };

      const validation: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: [],
      };

      previewUI.show(preview, validation, {
        onSave: vi.fn(),
        onCancel: vi.fn(),
      });

      // Verify elements exist
      expect(
        document.getElementById("ai-pocket-selection-preview"),
      ).toBeTruthy();
      expect(
        document.getElementById("ai-pocket-preview-backdrop"),
      ).toBeTruthy();

      // Hide preview
      previewUI.hide();

      // Verify elements are removed
      expect(
        document.getElementById("ai-pocket-selection-preview"),
      ).toBeFalsy();
      expect(document.getElementById("ai-pocket-preview-backdrop")).toBeFalsy();
    });

    it("should handle multiple show/hide cycles", () => {
      const preview: EditablePreview = {
        id: "test-preview-14",
        text: "Test text",
        htmlContent: "",
        context: {
          before: "",
          after: "",
          full: "",
        },
        sourceLocation: {
          url: "https://example.com",
          elementPath: "",
          containerTag: "",
          position: { top: 0, left: 0, width: 0, height: 0 },
        },
        timestamp: Date.now(),
        editable: true,
        preview: "",
      };

      const validation: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: [],
      };

      // First cycle
      previewUI.show(preview, validation, {
        onSave: vi.fn(),
        onCancel: vi.fn(),
      });
      expect(
        document.getElementById("ai-pocket-selection-preview"),
      ).toBeTruthy();
      previewUI.hide();
      expect(
        document.getElementById("ai-pocket-selection-preview"),
      ).toBeFalsy();

      // Second cycle
      previewUI.show(preview, validation, {
        onSave: vi.fn(),
        onCancel: vi.fn(),
      });
      expect(
        document.getElementById("ai-pocket-selection-preview"),
      ).toBeTruthy();
      previewUI.hide();
      expect(
        document.getElementById("ai-pocket-selection-preview"),
      ).toBeFalsy();
    });
  });
});
