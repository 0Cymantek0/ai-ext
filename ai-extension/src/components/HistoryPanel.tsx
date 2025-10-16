import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Conversation {
  id: string;
  title: string;
  timestamp: number;
  messageCount: number;
  messages?: Array<{ role: string; content: string }>;
}

interface HistoryPanelProps {
  conversations: Conversation[];
  currentConversationId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onNewConversation: () => void;
  className?: string;
}

export function HistoryPanel({
  conversations,
  currentConversationId,
  isOpen,
  onClose,
  onSelectConversation,
  onDeleteConversation,
  onNewConversation,
  className,
}: HistoryPanelProps) {
  const [searchQuery, setSearchQuery] = React.useState("");

  // Calculate similarity between two strings (0-1, higher is more similar)
  const calculateSimilarity = (str1: string, str2: string): number => {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    
    // Exact match
    if (s1 === s2) return 1;
    
    // Contains match
    if (s2.includes(s1) || s1.includes(s2)) {
      return 0.8;
    }
    
    // Simple character overlap similarity (faster than Levenshtein)
    const set1 = new Set(s1.split(''));
    const set2 = new Set(s2.split(''));
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return union.size === 0 ? 0 : intersection.size / union.size;
  };

  // Score a conversation based on search query
  const scoreConversation = (conv: Conversation, query: string): number => {
    const queryWords = query.toLowerCase().trim().split(/\s+/);
    let totalScore = 0;

    queryWords.forEach((word) => {
      if (word.length === 0) return;

      const titleLower = conv.title.toLowerCase();
      const titleWords = titleLower.split(/\s+/);

      // Title exact word match
      if (titleWords.some((tw) => tw === word)) {
        totalScore += 100;
      }
      // Title contains query word
      else if (titleLower.includes(word)) {
        totalScore += 50;
      }
      // Title fuzzy match
      else {
        const maxTitleSimilarity = Math.max(
          ...titleWords.map((tw) => calculateSimilarity(word, tw))
        );
        if (maxTitleSimilarity > 0.7) {
          totalScore += maxTitleSimilarity * 30;
        }
      }

      // Search in messages
      if (conv.messages) {
        conv.messages.forEach((msg) => {
          const contentLower = msg.content.toLowerCase();
          const contentWords = contentLower.split(/\s+/);

          // Message exact word match
          if (contentWords.some((cw) => cw === word)) {
            totalScore += 30;
          }
          // Message contains query word
          else if (contentLower.includes(word)) {
            totalScore += 15;
          }
          // Message fuzzy match
          else {
            const maxContentSimilarity = Math.max(
              ...contentWords.slice(0, 50).map((cw) => calculateSimilarity(word, cw))
            );
            if (maxContentSimilarity > 0.7) {
              totalScore += maxContentSimilarity * 10;
            }
          }
        });
      }
    });

    return totalScore;
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return date.toLocaleDateString();
  };

  const filterConversations = (convs: Conversation[]) => {
    if (!searchQuery.trim()) {
      return convs;
    }

    // Score all conversations
    const scoredConversations = convs
      .map((conv) => ({
        conversation: conv,
        score: scoreConversation(conv, searchQuery),
      }))
      .filter((item) => item.score > 0) // Only include conversations with matches
      .sort((a, b) => b.score - a.score); // Sort by relevance (highest score first)

    return scoredConversations.map((item) => item.conversation);
  };

  const groupConversationsByDate = (convs: Conversation[]) => {
    const groups: Record<string, Conversation[]> = {};

    convs.forEach((conv) => {
      const label = formatDate(conv.timestamp);
      if (!groups[label]) {
        groups[label] = [];
      }
      groups[label].push(conv);
    });

    return groups;
  };

  const filteredConversations = filterConversations(conversations);
  const grouped = groupConversationsByDate(filteredConversations);

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-60 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Panel */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-[70] w-80 transform border-r border-border/50 bg-background shadow-xl transition-transform duration-300 ease-in-out flex flex-col",
          isOpen ? "translate-x-0" : "-translate-x-full",
          className,
        )}
      >
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b px-4">
          <h2 className="text-sm font-semibold">Conversation History</h2>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                onNewConversation();
                onClose();
              }}
              aria-label="New conversation"
            >
              <svg
                className="size-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              aria-label="Close history"
            >
              <svg
                className="size-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </Button>
          </div>
        </div>

        {/* Search Input */}
        <div className="p-4 border-b">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-9 rounded-md border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              aria-label="Search conversations"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Clear search"
              >
                <svg
                  className="size-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
          {searchQuery && filteredConversations.length > 0 && (
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
              <svg
                className="size-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                />
              </svg>
              Sorted by relevance
            </p>
          )}
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto scrollbar-pill p-4 space-y-6">
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <svg
                className="size-12 text-muted-foreground/50 mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              <p className="text-sm text-muted-foreground">
                No conversations yet
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Start chatting to create history
              </p>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <svg
                className="size-12 text-muted-foreground/50 mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <p className="text-sm text-muted-foreground">
                No results found
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Try a different search term
              </p>
            </div>
          ) : (
            Object.entries(grouped).map(([dateLabel, convs]) => (
              <div key={dateLabel} className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {dateLabel}
                </h3>
                <div className="space-y-1">
                  {convs.map((conversation) => (
                    <div
                      key={conversation.id}
                      className={cn(
                        "group relative flex items-start gap-3 rounded-lg p-3 transition-all",
                        "hover:bg-accent cursor-pointer",
                        conversation.id === currentConversationId &&
                          "bg-accent/50 border border-primary/20",
                      )}
                      onClick={() => {
                        onSelectConversation(conversation.id);
                        onClose();
                      }}
                    >
                      <svg
                        className="size-4 mt-0.5 shrink-0 text-muted-foreground"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                        />
                      </svg>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {conversation.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {conversation.messageCount} message
                          {conversation.messageCount !== 1 ? "s" : ""}
                        </p>
                      </div>

                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="opacity-0 group-hover:opacity-100 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm("Delete this conversation?")) {
                            onDeleteConversation(conversation.id);
                          }
                        }}
                        aria-label="Delete conversation"
                      >
                        <svg
                          className="size-3.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <svg
              className="size-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>
              {searchQuery
                ? `${filteredConversations.length} of ${conversations.length}`
                : conversations.length}{" "}
              conversation
              {(searchQuery ? filteredConversations.length : conversations.length) !== 1 ? "s" : ""}
              {searchQuery ? " found" : " saved"}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
