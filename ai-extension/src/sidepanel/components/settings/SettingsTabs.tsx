import * as React from "react";

export type TabId = "providers" | "routing" | "speech";

interface SettingsTabsProps {
  activeTab: TabId;
  onChange: (tab: TabId) => void;
}

export function SettingsTabs({ activeTab, onChange }: SettingsTabsProps) {
  return (
    <div className="flex space-x-1 p-1 bg-muted rounded-md mb-4 text-sm font-medium">
      <button
        type="button"
        className={`flex-1 py-1.5 px-3 rounded-sm transition-all ${
          activeTab === "providers"
            ? "bg-background shadow-sm text-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
        onClick={() => onChange("providers")}
      >
        Providers
      </button>
      <button
        type="button"
        className={`flex-1 py-1.5 px-3 rounded-sm transition-all ${
          activeTab === "routing"
            ? "bg-background shadow-sm text-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
        onClick={() => onChange("routing")}
      >
        Routing
      </button>
      <button
        type="button"
        className={`flex-1 py-1.5 px-3 rounded-sm transition-all ${
          activeTab === "speech"
            ? "bg-background shadow-sm text-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
        onClick={() => onChange("speech")}
      >
        Speech
      </button>
    </div>
  );
}
