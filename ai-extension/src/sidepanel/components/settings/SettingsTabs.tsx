import * as React from "react";
import { motion } from "framer-motion";

export type TabId = "providers" | "routing" | "speech";

interface SettingsTabsProps {
  activeTab: TabId;
  onChange: (tab: TabId) => void;
}

const TABS: { id: TabId; label: string }[] = [
  { id: "providers", label: "Providers" },
  { id: "routing", label: "Routing" },
  { id: "speech", label: "Speech" },
];

export function SettingsTabs({ activeTab, onChange }: SettingsTabsProps) {
  return (
    <div className="flex p-1.5 bg-muted/50 backdrop-blur-md rounded-2xl mb-8 border border-border/50 relative shadow-inner">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            className={`relative flex-1 py-2.5 px-4 rounded-xl transition-all duration-300 z-10 ${
              isActive
                ? "text-white"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => onChange(tab.id)}
          >
            {isActive && (
              <motion.div
                layoutId="activeTabIndicator"
                className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl shadow-[0_4px_12px_rgba(37,99,235,0.3)]"
                transition={{ 
                  type: "spring", 
                  stiffness: 400, 
                  damping: 30 
                }}
              />
            )}
            <span className={`relative z-20 transition-all duration-300 ${isActive ? "font-bold scale-105" : "font-medium"}`}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
