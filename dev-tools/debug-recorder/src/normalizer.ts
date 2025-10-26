import { Session, SessionMetadata, Interaction, LogEntry, ErrorEntry, StateSnapshot, RecordingOptions } from './types.js';

export interface RawSessionCapture {
  session?: Partial<SessionMetadata> & { sessionId: string; startTime: number };
  timeline?: RawInteractionEvent[];
  logs?: RawLogGroup[];
  errors?: RawErrorEvent[];
  snapshots?: StateSnapshot[];
  assets?: RawAsset[];
}

export interface RawInteractionEvent {
  id: string;
  timestamp: number;
  type: Interaction['type'];
  description: string;
  status?: Interaction['status'];
  duration?: number;
  context?: Record<string, unknown>;
}

export interface RawLogGroup {
  interactionId?: string;
  entries: RawLogEntry[];
}

export interface RawLogEntry {
  timestamp: number;
  level?: LogEntry['level'];
  source?: string;
  message: string;
  data?: unknown;
}

export interface RawErrorEvent {
  interactionId?: string;
  timestamp: number;
  message: string;
  stack?: string;
  code?: string;
  source: string;
  context?: Record<string, unknown>;
  recovered?: boolean;
}

export interface RawAsset {
  interactionId?: string;
  timestamp: number;
  screenshot: string;
}

export function normalizeSession(raw: RawSessionCapture): Session {
  const metadata = normalizeMetadata(raw.session);
  const interactions = normalizeInteractions(raw.timeline ?? [], raw.logs ?? [], raw.errors ?? [], raw.assets ?? []);
  const errors = normalizeErrors(raw.errors ?? []);
  const snapshots = raw.snapshots ?? [];

  return {
    metadata,
    interactions,
    errors,
    snapshots,
  };
}

function normalizeMetadata(raw?: RawSessionCapture['session']): SessionMetadata {
  if (!raw) {
    throw new Error('Missing session metadata in capture');
  }

  const recordingOptions: RecordingOptions | undefined = raw.recordingOptions
    ? {
        includeScreenshots: raw.recordingOptions.includeScreenshots ?? false,
        includeStorage: raw.recordingOptions.includeStorage ?? false,
        includeMetrics: raw.recordingOptions.includeMetrics ?? false,
        includePII: raw.recordingOptions.includePII ?? false,
        maxLogSize: raw.recordingOptions.maxLogSize,
      }
    : undefined;

  return {
    sessionId: raw.sessionId,
    startTime: raw.startTime,
    endTime: raw.endTime,
    extensionId: raw.extensionId ?? 'unknown-extension',
    extensionVersion: raw.extensionVersion,
    chromeVersion: raw.chromeVersion,
    platform: raw.platform,
    recordingOptions,
  };
}

function normalizeInteractions(
  timeline: RawInteractionEvent[],
  logGroups: RawLogGroup[],
  errors: RawErrorEvent[],
  assets: RawAsset[],
): Interaction[] {
  const interactionMap = new Map<string, Interaction>();

  for (const event of timeline) {
    const interaction: Interaction = {
      id: event.id,
      timestamp: event.timestamp,
      type: event.type,
      description: event.description,
      status: event.status ?? 'pending',
      duration: event.duration,
      context: event.context,
      logs: [],
      errors: [],
    };
    interactionMap.set(interaction.id, interaction);
  }

  const logsWithoutInteraction: Interaction[] = [];

  for (const group of logGroups) {
    const normalizedLogs = group.entries.map<LogEntry>((entry) => ({
      timestamp: entry.timestamp,
      level: entry.level ?? 'info',
      source: entry.source ?? 'unknown',
      message: entry.message,
      data: entry.data,
    }));

    if (group.interactionId && interactionMap.has(group.interactionId)) {
      const interaction = interactionMap.get(group.interactionId)!;
      interaction.logs = [...(interaction.logs ?? []), ...normalizedLogs];
    } else {
      const syntheticInteraction: Interaction = {
        id: group.interactionId ?? `log-${normalizedLogs[0]?.timestamp ?? Date.now()}`,
        timestamp: normalizedLogs[0]?.timestamp ?? Date.now(),
        type: 'system_event',
        description: group.interactionId ? `Logs for ${group.interactionId}` : 'Orphan logs',
        status: 'warning',
        logs: normalizedLogs,
        errors: [],
      };
      logsWithoutInteraction.push(syntheticInteraction);
    }
  }

  for (const error of errors) {
    const normalized: ErrorEntry = {
      timestamp: error.timestamp,
      message: error.message,
      stack: error.stack,
      code: error.code,
      source: error.source,
      context: error.context,
      recovered: error.recovered,
    };

    if (error.interactionId && interactionMap.has(error.interactionId)) {
      const interaction = interactionMap.get(error.interactionId)!;
      interaction.errors = [...(interaction.errors ?? []), normalized];
      if (interaction.status === 'pending') {
        interaction.status = error.recovered ? 'warning' : 'error';
      }
    }
  }

  for (const asset of assets) {
    if (asset.interactionId && interactionMap.has(asset.interactionId)) {
      const interaction = interactionMap.get(asset.interactionId)!;
      interaction.screenshot = asset.screenshot;
    }
  }

  const interactions = [...interactionMap.values(), ...logsWithoutInteraction];
  interactions.sort((a, b) => a.timestamp - b.timestamp);

  return interactions;
}

function normalizeErrors(errors: RawErrorEvent[]): ErrorEntry[] {
  return errors
    .map<ErrorEntry>((error) => ({
      timestamp: error.timestamp,
      message: error.message,
      stack: error.stack,
      code: error.code,
      source: error.source,
      context: error.context,
      recovered: error.recovered,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}
