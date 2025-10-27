/**
 * Media Preview Component
 * Displays and allows editing of captured media
 * Requirements: 2.1, 3.6, 3.7
 */

import React, { useState } from "react";
import type {
  CapturedImage,
  CapturedAudio,
  CapturedVideo,
  MediaCaptureResult,
} from "../../content/media-capture";

interface MediaPreviewProps {
  media: MediaCaptureResult;
  onSave?: (media: MediaCaptureResult) => void;
  onCancel?: () => void;
}

export function MediaPreview({ media, onSave, onCancel }: MediaPreviewProps) {
  const [selectedTab, setSelectedTab] = useState<"images" | "audio" | "video">(
    "images",
  );

  const handleSave = () => {
    onSave?.(media);
  };

  const handleCancel = () => {
    onCancel?.();
  };

  return (
    <div className="media-preview-container">
      <div className="media-preview-header">
        <h2>Captured Media</h2>
        <div className="media-stats">
          <span>{media.images.length} images</span>
          <span>{media.audios.length} audio</span>
          <span>{media.videos.length} videos</span>
          <span>{Math.round(media.totalSize / 1024)} KB</span>
        </div>
      </div>

      <div className="media-tabs">
        <button
          className={selectedTab === "images" ? "active" : ""}
          onClick={() => setSelectedTab("images")}
        >
          Images ({media.images.length})
        </button>
        <button
          className={selectedTab === "audio" ? "active" : ""}
          onClick={() => setSelectedTab("audio")}
        >
          Audio ({media.audios.length})
        </button>
        <button
          className={selectedTab === "video" ? "active" : ""}
          onClick={() => setSelectedTab("video")}
        >
          Videos ({media.videos.length})
        </button>
      </div>

      <div className="media-content">
        {selectedTab === "images" && <ImageGrid images={media.images} />}
        {selectedTab === "audio" && <AudioList audios={media.audios} />}
        {selectedTab === "video" && <VideoList videos={media.videos} />}
      </div>

      <div className="media-actions">
        <button onClick={handleCancel} className="btn-cancel">
          Cancel
        </button>
        <button onClick={handleSave} className="btn-save">
          Save to Pocket
        </button>
      </div>
    </div>
  );
}

interface ImageGridProps {
  images: CapturedImage[];
}

function ImageGrid({ images }: ImageGridProps) {
  if (images.length === 0) {
    return <div className="empty-state">No images captured</div>;
  }

  return (
    <div className="image-grid">
      {images.map((image, index) => (
        <ImageCard key={index} image={image} />
      ))}
    </div>
  );
}

interface ImageCardProps {
  image: CapturedImage;
}

function ImageCard({ image }: ImageCardProps) {
  const [showDetails, setShowDetails] = useState(false);

  const displayUrl =
    image.thumbnail || image.compressed?.dataUrl || image.dataUrl;
  const size = image.compressed?.compressedSize || 0;

  return (
    <div className="image-card">
      <div className="image-preview">
        <img src={displayUrl} alt={image.metadata.alt} />
      </div>
      <div className="image-info">
        <div className="image-title">{image.metadata.alt || "Untitled"}</div>
        <div className="image-meta">
          {image.metadata.naturalWidth} × {image.metadata.naturalHeight}
          {size > 0 && ` • ${Math.round(size / 1024)} KB`}
        </div>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="btn-details"
        >
          {showDetails ? "Hide" : "Show"} Details
        </button>
      </div>
      {showDetails && (
        <div className="image-details">
          <div>Format: {image.metadata.format || "unknown"}</div>
          <div>Aspect Ratio: {image.metadata.aspectRatio.toFixed(2)}</div>
          <div>Source: {image.metadata.src}</div>
          {image.compressed && (
            <div>
              Compression:{" "}
              {(image.compressed.compressionRatio * 100).toFixed(1)}%
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface AudioListProps {
  audios: CapturedAudio[];
}

function AudioList({ audios }: AudioListProps) {
  if (audios.length === 0) {
    return <div className="empty-state">No audio captured</div>;
  }

  return (
    <div className="audio-list">
      {audios.map((audio, index) => (
        <AudioCard key={index} audio={audio} />
      ))}
    </div>
  );
}

interface AudioCardProps {
  audio: CapturedAudio;
}

function AudioCard({ audio }: AudioCardProps) {
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="audio-card">
      <div className="audio-icon">🎵</div>
      <div className="audio-info">
        <div className="audio-title">
          {audio.metadata.title || "Untitled Audio"}
        </div>
        <div className="audio-meta">
          Duration: {formatDuration(audio.metadata.duration)}
          {audio.metadata.format && ` • ${audio.metadata.format.toUpperCase()}`}
        </div>
        <div className="audio-source">{audio.metadata.src}</div>
        {audio.transcription && (
          <div className="audio-transcription">
            <strong>Transcription:</strong> {audio.transcription}
          </div>
        )}
      </div>
    </div>
  );
}

interface VideoListProps {
  videos: CapturedVideo[];
}

function VideoList({ videos }: VideoListProps) {
  if (videos.length === 0) {
    return <div className="empty-state">No videos captured</div>;
  }

  return (
    <div className="video-list">
      {videos.map((video, index) => (
        <VideoCard key={index} video={video} />
      ))}
    </div>
  );
}

interface VideoCardProps {
  video: CapturedVideo;
}

function VideoCard({ video }: VideoCardProps) {
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="video-card">
      {video.thumbnailDataUrl && (
        <div className="video-thumbnail">
          <img
            src={video.thumbnailDataUrl}
            alt={video.metadata.title || "Video"}
          />
          <div className="video-duration">
            {formatDuration(video.metadata.duration)}
          </div>
        </div>
      )}
      <div className="video-info">
        <div className="video-title">
          {video.metadata.title || "Untitled Video"}
        </div>
        <div className="video-meta">
          {video.metadata.videoWidth} × {video.metadata.videoHeight}
          {video.metadata.format && ` • ${video.metadata.format.toUpperCase()}`}
        </div>
        <div className="video-source">{video.metadata.src}</div>
      </div>
    </div>
  );
}
