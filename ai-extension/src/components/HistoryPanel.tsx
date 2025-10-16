import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ConversationMetadata {
  summary: string;
  keywords: string[];
  topics: string[];
  entities: string[];
  mainQuestions: string[];
  generatedAt: number;
}

interface Conversation {
  id: string;
  title: string;
  timestamp: number;
  messageCount: number;
  messages?: Array<{ role: string; content: string }>;
  metadata?: ConversationMetadata;
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
  const [isSearching, setIsSearching] = React.useState(false);

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

  const [filteredResults, setFilteredResults] = React.useState<Conversation[]>([]);

  // Debounced semantic search
  React.useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timeoutId = setTimeout(async () => {
      try {
        // Use semantic search via service worker
        const response = await chrome.runtime.sendMessage({
          kind: "CONVERSATION_SEMANTIC_SEARCH",
          requestId: crypto.randomUUID(),
          payload: {
            query: searchQuery,
            conversations: conversations,
          },
        });

        if (response.success && response.data.results) {
          // Extract conversations from search results
          const results = response.data.results.map((r: any) => r.conversation);
          setFilteredResults(results);
        } else {
          // Fallback to basic filtering
          setFilteredResults(basicFilter(searchQuery, conversations));
        }
      } catch (error) {
        console.error("Semantic search failed:", error);
        // Fallback to basic filtering
        setFilteredResults(basicFilter(searchQuery, conversations));
      } finally {
        setIsSearching(false);
      }
    }, 300); // Debounce 300ms

    return () => clearTimeout(timeoutId);
  }, [searchQuery, conversations]);

  // Basic fallback filter
  const basicFilter = (query: string, convs: Conversation[]): Conversation[] => {
    const queryLower = query.toLowerCase();
    return convs.filter((conv) => {
      // Search in title
      if (conv.title.toLowerCase().includes(queryLower)) {
        return true;
      }
      // Search in metadata
      if (conv.metadata) {
        if (
          conv.metadata.summary.toLowerCase().includes(queryLower) ||
          conv.metadata.keywords.some((k) => k.includes(queryLower)) ||
          conv.metadata.topics.some((t) => t.toLowerCase().includes(queryLower))
        ) {
          return true;
        }
      }
      // Search in messages
      if (conv.messages) {
        return conv.messages.some((m) => m.content.toLowerCase().includes(queryLower));
      }
      return false;
    });
  };

  const filterConversations = (convs: Conversation[]) => {
    if (!searchQuery.trim()) {
      return convs;
    }
    return filteredResults;
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
          {searchQuery && (
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
              {isSearching ? (
                <>
                  <svg
                    className="size-3 animate-spin"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  Searching with AI...
                </>
              ) : filteredConversations.length > 0 ? (
                <>
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
                  Sorted by AI relevance
                </>
              ) : null}
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
