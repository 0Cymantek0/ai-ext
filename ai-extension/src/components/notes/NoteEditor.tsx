import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Response } from "@/components/ai/response";
import { useAutoResizeTextarea } from "@/components/hooks/use-auto-resize-textarea";

export interface NoteData {
  id?: string;
  title: string;
  content: string;
  tags: string[];
  category?: string;
  createdAt?: number;
  updatedAt?: number;
  pocketId?: string;
}

interface NoteEditorProps {
  note?: NoteData;
  onSave: (note: Omit<NoteData, "id" | "createdAt" | "updatedAt">) => void;
  onCancel: () => void;
  isLoading?: boolean;
  className?: string;
}

export function NoteEditor({
  note,
  onSave,
  onCancel,
  isLoading = false,
  className,
}: NoteEditorProps) {
  const [title, setTitle] = React.useState(note?.title || "");
  const [content, setContent] = React.useState(note?.content || "");
  const [tags, setTags] = React.useState<string[]>(note?.tags || []);
  const [category, setCategory] = React.useState(note?.category || "");
  const [tagInput, setTagInput] = React.useState("");
  const [isPreviewMode, setIsPreviewMode] = React.useState(false);
  
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: 300,
    maxHeight: 600,
  });

  // Adjust height when content changes
  React.useEffect(() => {
    adjustHeight();
  }, [content, adjustHeight]);

  const handleSave = () => {
    if (!title.trim()) {
      alert("Please enter a title for your note");
      return;
    }

    const noteData: Omit<NoteData, "id" | "createdAt" | "updatedAt"> = {
      title: title.trim(),
      content: content.trim(),
      tags,
    };
    
    if (category.trim()) {
      noteData.category = category.trim();
    }
    
    if (note?.pocketId) {
      noteData.pocketId = note.pocketId;
    }
    
    onSave(noteData);
  };

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      const newTag = tagInput.trim().toLowerCase();
      if (!tags.includes(newTag)) {
        setTags([...tags, newTag]);
      }
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const insertMarkdown = (syntax: string, placeholder: string = "") => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);
    
    let newText: string;
    let newCursorPos: number;

    if (selectedText) {
      // Wrap selected text
      newText = content.substring(0, start) + syntax + selectedText + syntax + content.substring(end);
      newCursorPos = end + syntax.length * 2;
    } else {
      // Insert syntax with placeholder
      const insertion = syntax + placeholder + syntax;
      newText = content.substring(0, start) + insertion + content.substring(end);
      newCursorPos = start + syntax.length + placeholder.length;
    }

    setContent(newText);
    
    // Set cursor position after state update
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const insertList = (type: "ul" | "ol") => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const prefix = type === "ul" ? "- " : "1. ";
    const insertion = "\n" + prefix;
    
    const newText = content.substring(0, start) + insertion + content.substring(start);
    setContent(newText);
    
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + insertion.length, start + insertion.length);
    }, 0);
  };

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold">
          {note ? "Edit Note" : "Create Note"}
        </h2>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsPreviewMode(!isPreviewMode)}
          >
            {isPreviewMode ? "Edit" : "Preview"}
          </Button>
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isLoading}>
            {isLoading ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Title and metadata */}
        <div className="p-4 space-y-4 border-b">
          <Input
            placeholder="Note title..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-lg font-semibold border-none outline-none focus-visible:ring-0 focus-visible:border-transparent"
          />
          
          <div className="flex gap-4">
            <Input
              placeholder="Category (optional)"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="flex-1 border-none outline-none focus-visible:ring-0 focus-visible:border-transparent"
            />
            <Input
              placeholder="Add tags (press Enter)"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleAddTag}
              className="flex-1 border-none outline-none focus-visible:ring-0 focus-visible:border-transparent"
            />
          </div>

          {/* Tags display */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-accent rounded-full text-sm"
                >
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-destructive"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Editor/Preview */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!isPreviewMode ? (
            <>
              {/* Toolbar */}
              <div className="flex items-center gap-1 p-2 border-b bg-muted/50">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => insertMarkdown("**", "bold text")}
                  title="Bold"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1 4 4 4 4 0 0 1-4 4H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm2 5V7h6a2 2 0 0 1 2 2 2 2 0 0 1-2 2H8zm0 6v-2h6a2 2 0 0 1 2 2 2 2 0 0 1-2 2H8z"/>
                  </svg>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => insertMarkdown("*", "italic text")}
                  title="Italic"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4h-8z"/>
                  </svg>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => insertMarkdown("`", "code")}
                  title="Code"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                </Button>
                <div className="w-px h-6 bg-border mx-1" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => insertList("ul")}
                  title="Bullet List"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => insertList("ol")}
                  title="Numbered List"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                  </svg>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => insertMarkdown("## ", "")}
                  title="Heading"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8m-8 6h16" />
                  </svg>
                </Button>
              </div>

              {/* Editor */}
              <div className="flex-1 p-4">
                <Textarea
                  ref={textareaRef}
                  placeholder="Start writing your note... You can use Markdown formatting."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full h-full resize-none border-none focus:ring-0 focus-visible:ring-0 focus-visible:border-transparent font-mono text-sm"
                  style={{ minHeight: "300px" }}
                />
              </div>
            </>
          ) : (
            /* Preview */
            <div className="flex-1 p-4 overflow-y-auto">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <Response>{content || "*No content to preview*"}</Response>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
