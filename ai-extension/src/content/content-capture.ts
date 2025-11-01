/**
 * Content Capture Coordinator - Re-export Module
 *
 * This file re-exports the unified ContentCapture implementation from the capture/ folder.
 * All imports should use this file to ensure consistency across the codebase.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 7.1, 7.2, 7.3
 */

// Re-export all types and classes from the unified implementation
export {
  ContentCapture,
  CaptureError,
  CaptureErrorType,
  type CaptureMode,
  type CaptureOptions,
  type CaptureResult,
  type EditablePreview,
  type ValidationResult,
  type IDOMAnalyzer,
  type IContentSanitizer,
  type IMediaCapture,
  type IReliableSelectionCapture,
  type IContentProcessor,
  type BackgroundMessenger,
  type ContentCaptureDeps,
} from "./capture/ContentCapture.js";

// Create and export singleton instance with default dependencies
import { ContentCapture } from "./capture/ContentCapture.js";

/**
 * Singleton instance of ContentCapture with default dependencies.
 * This instance is used throughout the content scripts for capturing content.
 */
export const contentCapture = new ContentCapture();
