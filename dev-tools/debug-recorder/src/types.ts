/**
 * Session data model for debug recorder
 */

export interface SessionMetadata {
  sessionId: string;
  startTime: number;
  endTime?: number;
  extensionId: string;
  extensionVersion?: string;
  chromeVersion?: string;
  platform?: string;
  recordingOptions?: RecordingOptions;
}

export interface RecordingOptions {
  includeScreenshots?: boolean;
  includeStorage?: boolean;
  includeMetrics?: boolean;
  includePII?: boolean;
  maxLogSize?: number;
}

export interface Interaction {
  id: string;
  timestamp: number;
  type: InteractionType;
  description: string;
  status: 'pending' | 'success' | 'error' | 'warning';
  duration?: number;
  context?: Record<string, unknown>;
  logs?: LogEntry[];
  errors?: ErrorEntry[];
  screenshot?: string;
}

export type InteractionType =
  | 'navigation'
  | 'click'
  | 'input'
  | 'api_call'
  | 'storage_operation'
  | 'ai_request'
  | 'message_passing'
  | 'vector_operation'
  | 'user_action'
  | 'system_event';

export interface LogEntry {
  timestamp: number;
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  source: string;
  message: string;
  data?: unknown;
}

export interface ErrorEntry {
  timestamp: number;
  message: string;
  stack?: string;
  code?: string;
  source: string;
  context?: Record<string, unknown>;
  recovered?: boolean;
}

export interface StateSnapshot {
  timestamp: number;
  storageUsage?: {
    indexedDB?: number;
    localStorage?: number;
    chromeStorage?: number;
  };
  aiState?: {
    activeModels?: string[];
    pendingRequests?: number;
    tokenUsage?: number;
  };
  performance?: {
    memory?: number;
    cpu?: number;
  };
  breadcrumbs?: string[];
}

export interface Session {
  metadata: SessionMetadata;
  interactions: Interaction[];
  errors: ErrorEntry[];
  snapshots: StateSnapshot[];
}

export interface ReportOptions {
  includeAssets?: boolean;
  maxTokens?: number;
  trimRedundant?: boolean;
  collapseLogs?: boolean;
  collapseAssets?: boolean;
}
