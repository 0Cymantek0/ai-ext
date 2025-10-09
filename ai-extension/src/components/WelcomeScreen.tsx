import * as React from "react"
import { cn } from "@/lib/utils"

interface WelcomeScreenProps {
  onSuggestionClick: (suggestion: string) => void
  className?: string
}

const suggestions = [
  {
    icon: "🔍",
    text: "Summarize this page",
    prompt: "Summarize the key points from this webpage",
  },
  {
    icon: "💡",
    text: "Explain this concept",
    prompt: "Explain this concept in simple terms",
  },
  {
    icon: "📝",
    text: "Help me write",
    prompt: "Help me write a professional email",
  },
  {
    icon: "🎯",
    text: "Analyze content",
    prompt: "Analyze the main arguments in this content",
  },
  {
    icon: "🔗",
    text: "Find connections",
    prompt: "Find connections between my saved content",
  },
  {
    icon: "🚀",
    text: "Get started",
    prompt: "What can you help me with?",
  },
]

export function WelcomeScreen({ onSuggestionClick, className }: WelcomeScreenProps) {
  return (
    <div className={cn("flex h-full flex-col items-center justify-center p-6 text-center", className)}>
      <div className="mb-8 space-y-4">
        {/* Icon */}
        <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-primary/10">
          <svg className="size-10 text-primary" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z" opacity="0.5"/>
            <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5zm0 2.18l8 3.64v7.18c0 4.52-2.98 8.69-7 9.93-4.02-1.24-7-5.41-7-9.93V7.82l8-3.64zM11 7v2H9v2h2v2h2v-2h2V9h-2V7h-2z"/>
          </svg>
        </div>

        {/* Welcome Message */}
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">Welcome to AI Pocket</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Your intelligent assistant for capturing, organizing, and analyzing web content. 
            Ask me anything or try one of these suggestions:
          </p>
        </div>
      </div>

      {/* Suggestion Pills */}
      <div className="grid w-full max-w-2xl grid-cols-2 gap-3 sm:grid-cols-3">
        {suggestions.map((suggestion, index) => (
          <button
            key={index}
            onClick={() => onSuggestionClick(suggestion.prompt)}
            className={cn(
              "group flex flex-col items-center gap-2 rounded-lg border bg-card p-4",
              "hover:bg-accent hover:border-primary/50 hover:shadow-md",
              "transition-all duration-200 ease-out",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
              "active:scale-95"
            )}
          >
            <span className="text-2xl group-hover:scale-110 transition-transform">
              {suggestion.icon}
            </span>
            <span className="text-xs font-medium text-center group-hover:text-foreground transition-colors">
              {suggestion.text}
            </span>
          </button>
        ))}
      </div>

      {/* Footer Hint */}
      <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
        <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <span>Press <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono text-[10px]">Ctrl+Enter</kbd> to send</span>
      </div>
    </div>
  )
}

