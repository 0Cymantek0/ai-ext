/**
 * Shared types for chat pocket attachment and element mention features
 */

export interface PocketInfo {
  id: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  contentCount: number;
  isIndexing?: boolean;
}

export interface ContentElement {
  id: string;
  pocketId: string;
  pocketName: string;
  type: 'capture' | 'note' | 'pdf' | 'image' | 'audio' | 'link';
  title: string;
  preview?: string;
  thumbnail?: string; // For images
  sourceUrl?: string;
  timestamp: number;
}

export interface MentionedElement extends ContentElement {
  mentionId: string; // Unique ID for this mention instance
}
