import * as React from "react"
import { cn } from "@/lib/utils"
import { FlipWords } from "@/components/ui/flip-words"
import { Component as EtheralShadow } from "@/components/ui/etheral-shadow"

interface WelcomeScreenProps {
  onSuggestionClick: (suggestion: string) => void
  className?: string
}

const suggestions = [
  {
    icon: (
      <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
    text: "Summarize this page",
    prompt: "Summarize the key points from this webpage",
  },
  {
    icon: (
      <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    text: "Explain this concept",
    prompt: "Explain this concept in simple terms",
  },
  {
    icon: (
      <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    ),
    text: "Help me write",
    prompt: "Help me write a professional email",
  },
  {
    icon: (
      <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    text: "Analyze content",
    prompt: "Analyze the main arguments in this content",
  },
  {
    icon: (
      <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    ),
    text: "Find connections",
    prompt: "Find connections between my saved content",
  },
  {
    icon: (
      <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    text: "Get started",
    prompt: "What can you help me with?",
  },
]

export function WelcomeScreen({ onSuggestionClick, className }: WelcomeScreenProps) {
  return (
    <div className={cn("relative flex flex-1 flex-col overflow-hidden", className)}>
      {/* Etheral Shadow Background */}
      <div className="absolute inset-0 z-0">
        <EtheralShadow
          color="rgba(99, 102, 241, 0.15)"
          animation={{ scale: 100, speed: 90 }}
          noise={{ opacity: 0.3, scale: 1.2 }}
          sizing="fill"
          className="w-full h-full"
        />
      </div>

      {/* Content Overlay */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center p-6 text-center overflow-y-auto scrollbar-custom">
        <div className="mb-8 space-y-4">
          {/* Welcome Message */}
          <div className="space-y-4 text-center">
            <div
              className="text-4xl md:text-5xl font-bold tracking-tight text-foreground welcome-title"
              style={{ fontFamily: '"Space Grotesk", sans-serif' }}
            >
              <span className="text-[0.85em]">Your</span> <FlipWords
                words={["intelligent", "smart", "powerful", "versatile"]}
                duration={2000}
                className="text-primary font-normal"
              /><span className="text-[0.85em]">assistant</span>
            </div>
            <p className="text-base text-muted-foreground max-w-lg mx-auto opacity-40">
              for capturing, organizing, and analyzing web content.
              Ask me anything or try one of these suggestions:
            </p>
          </div>
        </div>

        {/* Suggestion Pills */}
        <div className="grid w-full max-w-2xl grid-cols-2 gap-2">
          {suggestions.map((suggestion, index) => (
            <button
              key={index}
              onClick={() => onSuggestionClick(suggestion.prompt)}
              className={cn(
                "group flex items-center gap-2 rounded-full border bg-card/80 backdrop-blur-sm px-3 py-2",
                "hover:bg-accent/90 hover:border-primary/50 hover:shadow-md",
                "transition-all duration-200 ease-out",
                "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                "active:scale-95"
              )}
            >
              <span className="text-primary group-hover:scale-110 transition-transform flex-shrink-0">
                {suggestion.icon}
              </span>
              <span className="text-xs font-medium text-left group-hover:text-foreground transition-colors leading-tight">
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
          <span>Press <kbd className="px-1.5 py-0.5 rounded bg-muted/80 backdrop-blur-sm font-mono text-[10px]">Enter</kbd> to send, <kbd className="px-1.5 py-0.5 rounded bg-muted/80 backdrop-blur-sm font-mono text-[10px]">Shift+Enter</kbd> for new line</span>
        </div>
      </div>
    </div>
  )
}

