import * as React from "react";
import type { ProviderSettingsSnapshot } from "../../../shared/types";
import { SpeechSettingsSection } from "../SpeechSettingsSection";

interface SpeechSettingsTabProps {
  snapshot: ProviderSettingsSnapshot;
  onUpdate: () => void;
}

export function SpeechSettingsTab({
  snapshot,
  onUpdate,
}: SpeechSettingsTabProps) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Speech Settings</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Choose which configured provider handles transcription and tune
          provider-aware speech options.
        </p>
      </div>
      <SpeechSettingsSection snapshot={snapshot} onUpdate={onUpdate} />
    </section>
  );
}
