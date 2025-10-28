export type MessageKind =
  | "PING"
  | "CAPTURE_REQUEST"
  | "CAPTURE_RESULT"
  | "CAPTURE_SCREENSHOT"
  | "CAPTURE_MULTI_SELECTION"
  | "CAPTURE_MEDIA"
  | "CAPTURE_MEDIA_ELEMENT"
  | "CAPTURE_SELECTION_SNIPPET"
  | "CAPTURE_IMAGE_DATA"
  | "FILE_UPLOAD"
  | "CONTEXT_MENU_SAVE_TO_POCKET"
  | "POCKET_SELECTION_REQUEST"
  | "POCKET_SELECTION_RESPONSE"
  | "AI_FORMAT_REQUEST"
  | "AI_PROCESS_REQUEST"
  | "AI_PROCESS_UPDATE"
  | "AI_PROCESS_RESULT"
  | "AI_PROCESS_STREAM_START"
  | "AI_PROCESS_STREAM_CHUNK"
  | "AI_PROCESS_STREAM_END"
  | "AI_PROCESS_STREAM_ERROR"
  | "AI_PROCESS_CANCEL"
  | "AI_PROCESS_TEXT_CORRECTION"
  | "POCKET_CREATE"
  | "POCKET_UPDATE"
  | "POCKET_GET"
  | "POCKET_LIST"
  | "POCKET_DELETE"
  | "POCKET_SEARCH"
  | "CONTENT_LIST"
  | "CONTENT_GET"
  | "CONTENT_DELETE"
  | "CONTENT_SEARCH"
  | "CONTENT_IMPORT"
  | "CONTENT_CREATED"
  | "CONTENT_UPDATED"
  | "CONTENT_DELETED"
  | "NOTES_LIST"
  | "NOTE_SAVE"
  | "CONVERSATION_LIST"
  | "CONVERSATION_GET"
  | "CONVERSATION_CREATE"
  | "CONVERSATION_UPDATE"
  | "CONVERSATION_DELETE"
  | "CONVERSATION_GENERATE_METADATA"
  | "CONVERSATION_SEMANTIC_SEARCH"
  | "CONVERSATION_ATTACH_POCKET"
  | "CONVERSATION_DETACH_POCKET"
  | "CONVERSATION_GET_ATTACHED_POCKET"
  | "METADATA_QUEUE_STATUS"
  | "ABBREVIATION_CREATE"
  | "ABBREVIATION_GET"
  | "ABBREVIATION_UPDATE"
  | "ABBREVIATION_DELETE"
  | "ABBREVIATION_LIST"
  | "ABBREVIATION_EXPAND"
  | "VECTOR_INDEXING_RETRY"
  | "VECTOR_INDEXING_PROGRESS"
  | "LOG_BATCH"
  | "ARIA_RUN_START"
  | "ARIA_RUN_STATUS"
  | "ARIA_RUN_PAUSE"
  | "ARIA_RUN_RESUME"
  | "ARIA_RUN_CANCEL"
  | "ARIA_EVENT"
  | "ARIA_ERROR"
  | "ERROR";

export interface BaseMessage<K extends MessageKind, T> {
  kind: K;
  requestId?: string;
  payload: T;
  mode?: "ask" | "ai-pocket"; // Optional mode for mode-aware processing
}

export interface CaptureRequestPayload {
  mode: "full-page" | "selection" | "element" | "note";
  pocketId: string;
  showPreview?: boolean; // Whether to show preview UI for selection mode
}

export interface CaptureMultiSelectionPayload {
  pocketId: string;
  sanitize?: boolean;
}

export interface CaptureMediaPayload {
  pocketId: string;
  compressImages?: boolean;
  generateThumbnails?: boolean;
  transcribeAudio?: boolean;
}

export interface CaptureMediaElementPayload {
  elementSelector: string;
  mediaType: "image" | "video" | "audio";
  pocketId: string;
  compress?: boolean;
  generateThumbnail?: boolean;
}

export interface AiProcessRequestPayload {
  contentId: string;
  task: "summarize" | "embed" | "translate" | "alt-text";
  preferLocal: boolean;
}

export interface AiStreamRequestPayload {
  prompt: string;
  conversationId?: string;
  preferLocal?: boolean;
  model?: "nano" | "flash" | "pro";
  mode?: "ask" | "ai-pocket";
  pocketId?: string;
  autoContext?: boolean; // Whether to automatically include context
}

export interface AiStreamChunkPayload {
  requestId: string;
  chunk: string;
  conversationId?: string;
}

export interface AiStreamEndPayload {
  requestId: string;
  conversationId?: string;
  totalTokens: number;
  processingTime: number;
  source: "gemini-nano" | "gemini-flash" | "gemini-pro";
  mode?: "ask" | "ai-pocket"; // Mode used for processing
  contextUsed?: string[]; // Context signals used during processing
}

export interface AiStreamErrorPayload {
  requestId: string;
  error: string;
  conversationId?: string;
}

export interface AiCancelRequestPayload {
  requestId: string;
}

export interface AiTextCorrectionPayload {
  text: string;
}

export interface ContentListPayload {
  pocketId: string;
}

export interface ContentGetPayload {
  contentId: string;
}

export interface ContentDeletePayload {
  contentId: string;
}

export interface PocketSearchPayload {
  query: string;
  limit?: number;
}

export interface PocketSelectionRequestPayload {
  requestId: string;
  pockets: Array<{
    id: string;
    name: string;
    description?: string;
    color?: string;
  }>;
  selectionText?: string;
  preview?: string;
  sourceUrl?: string;
}

export interface PocketSelectionResponsePayload {
  requestId: string;
  status: "success" | "cancelled" | "error";
  pocketId?: string;
  error?: string;
}

export interface AIFormatRequestPayload {
  content: string;
  instructions?: string;
  preferLocal?: boolean;
}

export interface ContentSearchPayload {
  query: string;
  pocketId?: string;
  limit?: number;
}

export interface SearchResult<T> {
  item: T;
  relevanceScore: number;
  matchedFields?: string[];
}

// User Preferences
export interface UserPreferences {
  theme: "light" | "dark" | "auto";
  language: string;
  defaultAIModel: "nano" | "flash" | "pro";
  privacyMode: "strict" | "balanced" | "performance";
  accessibility: AccessibilityPreferences;
}

export interface AccessibilityPreferences {
  highContrast: boolean;
  largeText: boolean;
  reducedMotion: boolean;
  screenReaderOptimized: boolean;
  keyboardNavigationOnly: boolean;
}

// Side Panel State
export interface SidePanelState {
  version: number;
  activeTab: "chat" | "pockets";
  currentConversationId: string | null;
  lastActiveTimestamp: number;

  // UI State
  ui: {
    chatScrollPosition: number;
    pocketsScrollPosition: number;
    expandedSections: string[];
    sidebarCollapsed: boolean;
  };

  // Pocket State
  pockets: {
    selectedPocketId: string | null;
    filterQuery: string;
    sortBy: "date" | "name" | "size";
    viewMode: "list" | "grid";
  };

  // Chat State
  chat: {
    draftMessage: string;
    recentPrompts: string[];
    preferredModel: "nano" | "flash" | "pro" | null;
  };
}

// Abbreviation Types
export interface Abbreviation {
  shortcut: string;
  expansion: string;
  category?: string;
  usageCount: number;
  createdAt: number;
  lastUsed: number;
}

export interface AbbreviationCreatePayload {
  shortcut: string;
  expansion: string;
  category?: string;
}

export interface AbbreviationUpdatePayload {
  shortcut: string;
  expansion?: string;
  category?: string;
}

export interface AbbreviationGetPayload {
  shortcut: string;
}

export interface AbbreviationDeletePayload {
  shortcut: string;
}

export interface AbbreviationExpandPayload {
  shortcut: string;
}

export interface AbbreviationExpandResult {
  expansion: string;
  abbreviation: Abbreviation;
}

// Conversation Pocket Attachment Types
export interface ConversationAttachPocketPayload {
  conversationId: string;
  pocketId: string;
}

export interface ConversationDetachPocketPayload {
  conversationId: string;
  pocketId?: string; // Optional: detach specific pocket, or all if undefined
}

export interface ConversationGetAttachedPocketPayload {
  conversationId: string;
}

export interface ConversationAttachedPocketResult {
  conversationId: string;
  attachedPocketId: string | null; // For backward compatibility (first pocket)
  attachedPocketIds?: string[]; // All attached pocket IDs
  pockets?: Array<{
    id: string;
    name: string;
    description?: string;
    color?: string;
  }>;
  pocketName?: string; // For backward compatibility (first pocket)
  pocketDescription?: string; // For backward compatibility (first pocket)
}

// ARIA Research Types

/**
 * Research mode for ARIA autonomous research agent.
 * - "quick": Fast research with minimal depth
 * - "standard": Balanced research with moderate depth
 * - "deep": Comprehensive research with maximum depth
 */
export type ResearchMode = "quick" | "standard" | "deep";

/**
 * Flexible mode string accepted across messaging.
 * Allows predefined research modes and custom legacy values.
 */
export type AriaMode = ResearchMode | (string & {});

/**
 * Enum describing the discrete phases of an ARIA research run.
 * Provides stable keys for messaging and UI state machines.
 */
export const enum AriaPhase {
  Initializing = "initializing",
  Planning = "planning",
  Researching = "researching",
  Synthesizing = "synthesizing",
  Paused = "paused",
  Cancelled = "cancelled",
  Completed = "completed",
}

/**
 * String literal form of {@link AriaPhase} values.
 * Useful when working with serialized payloads.
 */
export type AriaPhaseValue = `${AriaPhase}`;

export type AriaRunStatus = "running" | "paused" | "cancelled" | "completed";

export type AriaRunPhase = AriaPhaseValue;

export interface AriaRunMetrics {
  /** Overall progress expressed as percentage from 0-1 */
  progress: number;
  /** Number of discrete steps completed */
  stepsCompleted: number;
  /** Total number of steps planned for the run */
  stepsTotal?: number;
}

export interface AriaRunConfig {
  /** Research mode requested for the run (accepts ResearchMode or any custom string) */
  mode: string;
  /** Optional initial query or prompt */
  query?: string;
  /** Optional phase to resume from */
  phase?: AriaRunPhase;
  /** Planned total number of steps */
  stepsTotal?: number;
  /** Additional metadata used for diagnostics */
  metadata?: Record<string, unknown>;
  /** Arbitrary context passed from the UI */
  context?: Record<string, unknown>;
}

export interface AriaRunState {
  /** Unique identifier for the run */
  runId: string;
  /** Research mode for this run (ResearchMode or any custom string) */
  mode: string;
  /** Current phase */
  phase: AriaRunPhase;
  /** Current status */
  status: AriaRunStatus;
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
  /** Progress metrics */
  metrics: AriaRunMetrics;
  /** Arbitrary contextual state */
  context?: Record<string, unknown>;
  /** Last emitted event type */
  lastEvent?: AriaControllerEventType;
  /** Last status message */
  lastMessage?: string;
}

export type AriaControllerEventType =
  | "started"
  | "paused"
  | "resumed"
  | "cancelled"
  | "progress";

export interface AriaControllerEventDetail {
  type: AriaControllerEventType;
  run: AriaRunState;
  message: string;
  timestamp: number;
}

export type AriaRunFailureReason =
  | "NOT_FOUND"
  | "INVALID_STATE"
  | "INVALID_CONFIG";

export interface AriaRunSuccessResponse {
  success: true;
  run: AriaRunState;
  message: string;
}

export interface AriaRunFailureResponse {
  success: false;
  reason: AriaRunFailureReason;
  error: string;
}

export type AriaRunResult = AriaRunSuccessResponse | AriaRunFailureResponse;

/**
 * Progress metrics for ARIA research execution.
 * Tracks resource usage and execution time.
 */
export interface AriaProgressMetrics {
  /** Number of AI interactions/API calls used */
  interactionsUsed: number;
  /** Number of sources/documents collected */
  sourcesCollected: number;
  /** Time elapsed in milliseconds */
  elapsedMs: number;
  /** Optional: estimated time remaining in milliseconds */
  estimatedRemainingMs?: number;
  /** Optional: current processing throughput (sources per minute) */
  throughput?: number;
}

/**
 * Quota limits for ARIA research execution.
 * Controls resource consumption.
 */
export interface AriaQuotaLimits {
  /** Maximum number of AI interactions allowed */
  maxInteractions?: number;
  /** Maximum number of sources to collect */
  maxSources?: number;
  /** Maximum execution time in milliseconds */
  maxDurationMs?: number;
}

/**
 * Single utterance captured during a forked exploration path.
 */
export interface AriaForkTranscriptMessage {
  /** Speaker or generator of the message */
  role: "agent" | "assistant" | "system" | "user" | "source";
  /** Message content */
  content: string;
  /** Capture timestamp */
  timestamp: number;
  /** Optional metadata for rich UI rendering */
  metadata?: Record<string, unknown>;
}

/**
 * Transcript representing a forked exploration branch.
 */
export interface AriaForkTranscript {
  /** Unique identifier for the fork branch */
  forkId: string;
  /** Identifier for the parent fork when nesting occurs */
  parentForkId?: string;
  /** Descriptive label for the branch */
  label?: string;
  /** Summary of the branch outcome */
  summary?: string;
  /** Chronological messages collected during the fork */
  messages: AriaForkTranscriptMessage[];
}

/**
 * Payload for ARIA_RUN_START message.
 * Initiates a new ARIA research session.
 */
export interface AriaStartPayload {
  /** Research mode: "quick", "standard", "deep", or any custom mode string */
  mode: AriaMode;
  /** Resource quota limits */
  quotas?: AriaQuotaLimits;
  /** Optional: specific research topics to focus on */
  topics?: string[];
  /** Optional: resume token to continue a previous session */
  resumeToken?: string;
  /** Optional: initial query or prompt */
  query?: string;
  /** Optional: additional configuration context */
  context?: Record<string, unknown>;
}

/**
 * Payload for ARIA_RUN_STATUS message.
 * Reports current status of an ARIA research session.
 */
export interface AriaStatusPayload {
  /** Unique identifier for the research run */
  runId: string;
  /** Current execution status */
  status: AriaRunStatus;
  /** Current execution phase */
  phase: AriaRunPhase;
  /** Research mode being used */
  mode: AriaMode;
  /** Progress metrics */
  metrics: AriaProgressMetrics;
  /** Timestamp of last update */
  updatedAt: number;
  /** Optional: detailed message about current status */
  message?: string;
  /** Optional: current context data */
  context?: Record<string, unknown>;
}

/**
 * Payload for ARIA_EVENT message.
 * Reports progress events during ARIA research execution.
 */
export interface AriaEventPayload {
  /** Unique identifier for the research run */
  runId: string;
  /** Type of event */
  eventType: AriaControllerEventType;
  /** Current execution phase */
  phase: AriaRunPhase;
  /** Brief summary of the event */
  summary: string;
  /** Progress metrics at time of event */
  metrics: AriaProgressMetrics;
  /** Event timestamp */
  timestamp: number;
  /** Optional: fork transcript(s) for exploration branches */
  forkTranscript?: AriaForkTranscript | AriaForkTranscript[];
  /** Optional: additional event-specific context */
  context?: Record<string, unknown>;
}

/**
 * Payload for ARIA_ERROR message.
 * Reports errors during ARIA research execution.
 */
export interface AriaErrorPayload {
  /** Unique identifier for the research run (if available) */
  runId?: string;
  /** Error message */
  error: string;
  /** Error code or type */
  errorCode?: string;
  /** Current phase when error occurred */
  phase?: AriaRunPhase;
  /** Timestamp of error */
  timestamp: number;
  /** Whether the error is recoverable */
  recoverable?: boolean;
  /** Optional: stack trace or additional debug info */
  details?: string;
  /** Optional: suggested action for recovery */
  suggestedAction?: string;
}

// Legacy payload types for backward compatibility
export interface AriaRunStartPayload {
  config: AriaRunConfig;
}

export interface AriaRunUpdatePayload {
  runId: string;
}

export type AriaRunStatusResponse = AriaRunResult;

// Legacy event payload alias (use AriaEventPayload for new code)
export type AriaControllerEventPayload = AriaControllerEventDetail;

// Storage Keys
export const STORAGE_KEYS = {
  USER_PREFERENCES: "userPreferences",
  SIDE_PANEL_STATE: "sidePanelState",
  CONVERSATIONS: "conversations",
  POCKETS: "pockets",
  ABBREVIATIONS: "abbreviations",
} as const;
