import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Response } from "@/components/ai/response";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Bold, 
  Italic, 
  Underline, 
  Strikethrough, 
  Type,
  List,
  ListOrdered,
  Code,
  FileCode,
  ListTree,
  Table,
  Sparkles,
  ArrowLeft,
  Eye,
  Edit3,
  X,
  Quote,
  Minus,
  Link,
  Image,
  Keyboard,
  Save,
  ChevronDown
} from "lucide-react";

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

interface NoteEditorPageProps {
  note?: NoteData;
  onSave: (note: Omit<NoteData, "id" | "createdAt" | "updatedAt">) => void;
  onCancel: () => void;
  isLoading?: boolean;
  className?: string;
}

export function NoteEditorPage({
  note,
  onSave,
  onCancel,
  isLoading = false,
  className,
}: NoteEditorPageProps) {
  const [title, setTitle] = React.useState(note?.title || "");
  const [content, setContent] = React.useState(note?.content || "");
  const [tags, setTags] = React.useState<string[]>(note?.tags || []);
  const [tagInput, setTagInput] = React.useState("");
  const [isPreviewMode, setIsPreviewMode] = React.useState(false);
  const [isAutoFormatting, setIsAutoFormatting] = React.useState(false);
  const [showShortcuts, setShowShortcuts] = React.useState(false);
  const [wordCount, setWordCount] = React.useState(0);
  const [charCount, setCharCount] = React.useState(0);
  
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Calculate word and character count
  React.useEffect(() => {
    const words = content.trim().split(/\s+/).filter(w => w.length > 0).length;
    const chars = content.length;
    setWordCount(words);
    setCharCount(chars);
  }, [content]);

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

  const insertMarkdown = (
    before: string, 
    after: string = "", 
    placeholder: string = "",
    newLine: boolean = false
  ) => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);
    
    let newText: string;
    let newCursorPos: number;

    if (selectedText) {
      // Wrap selected text
      const insertion = before + selectedText + (after || before);
      newText = content.substring(0, start) + insertion + content.substring(end);
      newCursorPos = start + insertion.length;
    } else {
      // Insert syntax with placeholder
      const insertion = before + placeholder + (after || before);
      newText = content.substring(0, start) + (newLine ? "\n" : "") + insertion + (newLine ? "\n" : "") + content.substring(end);
      newCursorPos = start + (newLine ? 1 : 0) + before.length + placeholder.length;
    }

    setContent(newText);
    
    // Set cursor position after state update
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const insertCodeBlock = () => {
    insertMarkdown("```\n", "\n```", "code here", true);
  };

  const insertHTMLBoilerplate = () => {
    const boilerplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document</title>
</head>
<body>
    
</body>
</html>`;
    
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const newText = content.substring(0, start) + "\n" + boilerplate + "\n" + content.substring(start);
    setContent(newText);
    
    setTimeout(() => {
      textarea.focus();
      const newPos = start + boilerplate.length + 2;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const insertTable = () => {
    const table = `
| Header 1 | Header 2 | Header 3 |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |
`;
    
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const newText = content.substring(0, start) + table + content.substring(start);
    setContent(newText);
    
    setTimeout(() => {
      textarea.focus();
      const newPos = start + table.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const insertNestedList = () => {
    const nestedList = `
- Parent item 1
  - Child item 1.1
  - Child item 1.2
    - Grandchild item 1.2.1
- Parent item 2
  - Child item 2.1
`;
    
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const newText = content.substring(0, start) + nestedList + content.substring(start);
    setContent(newText);
    
    setTimeout(() => {
      textarea.focus();
      const newPos = start + nestedList.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const insertBlockquote = () => {
    insertMarkdown("> ", "", "Quote text");
  };

  const insertHorizontalRule = () => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const newText = content.substring(0, start) + "\n---\n" + content.substring(start);
    setContent(newText);
    
    setTimeout(() => {
      textarea.focus();
      const newPos = start + 5;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const insertLink = () => {
    insertMarkdown("[", "](url)", "link text");
  };

  const insertImage = () => {
    insertMarkdown("![", "](url)", "alt text");
  };

  // Keyboard shortcuts handler
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isPreviewMode) return;
      
      const isMod = e.ctrlKey || e.metaKey;
      
      if (isMod && e.key === 'b') {
        e.preventDefault();
        insertMarkdown("**", "**", "bold");
      } else if (isMod && e.key === 'i') {
        e.preventDefault();
        insertMarkdown("*", "*", "italic");
      } else if (isMod && e.key === 'u') {
        e.preventDefault();
        insertMarkdown("<u>", "</u>", "underline");
      } else if (isMod && e.shiftKey && e.key === 'K') {
        e.preventDefault();
        insertLink();
      } else if (isMod && e.key === 's') {
        e.preventDefault();
        handleSave();
      } else if (isMod && e.key === 'p') {
        e.preventDefault();
        setIsPreviewMode(!isPreviewMode);
      } else if (e.key === 'Escape') {
        if (showShortcuts) {
          setShowShortcuts(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPreviewMode, showShortcuts, content, title, tags]);

  const handleAutoFormat = async () => {
    if (!content.trim()) {
      alert("Please add some content to format");
      return;
    }

    setIsAutoFormatting(true);
    try {
      // Send to AI for formatting
      const response = await chrome.runtime.sendMessage({
        kind: "AI_FORMAT_REQUEST",
        requestId: crypto.randomUUID(),
        payload: {
          content: content,
          instructions: "Format this markdown content to be well-structured, properly indented, and easy to read. Fix any markdown syntax issues and improve the overall formatting."
        },
      });

      if (response.success && response.data?.formattedContent) {
        setContent(response.data.formattedContent);
      } else {
        // Fallback: Basic formatting
        const formatted = content
          .split('\n')
          .map(line => line.trim())
          .join('\n')
          .replace(/\n{3,}/g, '\n\n'); // Remove excessive line breaks
        setContent(formatted);
      }
    } catch (error) {
      console.error("Auto-format error:", error);
      alert("Failed to auto-format. Please try again.");
    } finally {
      setIsAutoFormatting(false);
    }
  };

  return (
    <div className={cn("flex flex-col h-screen bg-zinc-950 text-zinc-100", className)}>
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/95 backdrop-blur supports-[backdrop-filter]:bg-zinc-900/60">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onCancel}
            className="h-9 w-9 hover:bg-zinc-800"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-zinc-500 text-sm font-mono">#</span>
            <span className="text-lg font-medium text-zinc-100">
              {title || "Untitled Note"}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowShortcuts(!showShortcuts)}
            className="h-9 w-9 hover:bg-zinc-800"
            title="Keyboard Shortcuts"
          >
            <Keyboard className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsPreviewMode(!isPreviewMode)}
            className="h-9 w-9 hover:bg-zinc-800"
            title={isPreviewMode ? "Edit Mode" : "Preview Mode"}
          >
            {isPreviewMode ? <Edit3 className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button 
            size="sm" 
            onClick={handleSave} 
            disabled={isLoading}
            className="min-w-[80px] bg-zinc-800 hover:bg-zinc-700 text-zinc-100"
          >
            <Save className="h-3 w-3 mr-2" />
            {isLoading ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* Title Input */}
      <div className="px-6 pt-6 pb-2">
        <div className="flex items-start gap-2">
          <span className="text-2xl font-mono text-zinc-500 mt-1">#</span>
          <Input
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-2xl font-semibold border-none bg-transparent px-0 focus-visible:ring-0 placeholder:text-zinc-600 text-zinc-100"
          />
        </div>
      </div>

      {/* Tags Section */}
      <div className="px-6 py-3 border-b border-zinc-800">
        <div className="flex flex-wrap items-center gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/15 text-amber-500 rounded-full text-sm font-medium hover:bg-amber-500/20 transition-colors"
            >
              #{tag}
              <button
                onClick={() => handleRemoveTag(tag)}
                className="hover:text-amber-400 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <div className="relative">
            <Input
              placeholder="#Tags"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleAddTag}
              className="h-9 w-32 text-sm border-none bg-transparent px-0 focus-visible:ring-0 placeholder:text-zinc-600 text-zinc-400"
            />
          </div>
        </div>
      </div>

      {/* Editor/Preview Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!isPreviewMode ? (
          <>
            {/* Toolbar - Responsive with Grouped Menus */}
            <div className="flex items-center gap-1 px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/50 flex-wrap">
              {/* Text Formatting Group */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-3 shrink-0 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100"
                    title="Text Formatting"
                  >
                    <Type className="h-4 w-4 mr-1.5" />
                    Text
                    <ChevronDown className="h-3 w-3 ml-1.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-zinc-900 border-zinc-800">
                  <DropdownMenuItem
                    onClick={() => insertMarkdown("**", "**", "bold")}
                    className="hover:bg-zinc-800 text-zinc-300 cursor-pointer"
                  >
                    <Bold className="h-4 w-4 mr-2" />
                    Bold <span className="ml-auto text-xs text-zinc-500">Ctrl+B</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => insertMarkdown("*", "*", "italic")}
                    className="hover:bg-zinc-800 text-zinc-300 cursor-pointer"
                  >
                    <Italic className="h-4 w-4 mr-2" />
                    Italic <span className="ml-auto text-xs text-zinc-500">Ctrl+I</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => insertMarkdown("<u>", "</u>", "underline")}
                    className="hover:bg-zinc-800 text-zinc-300 cursor-pointer"
                  >
                    <Underline className="h-4 w-4 mr-2" />
                    Underline <span className="ml-auto text-xs text-zinc-500">Ctrl+U</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => insertMarkdown("~~", "~~", "strikethrough")}
                    className="hover:bg-zinc-800 text-zinc-300 cursor-pointer"
                  >
                    <Strikethrough className="h-4 w-4 mr-2" />
                    Strikethrough
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => insertMarkdown("## ", "", "Heading")}
                    className="hover:bg-zinc-800 text-zinc-300 cursor-pointer"
                  >
                    <Type className="h-4 w-4 mr-2" />
                    Heading
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Lists Group */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-3 shrink-0 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100"
                    title="Lists"
                  >
                    <List className="h-4 w-4 mr-1.5" />
                    Lists
                    <ChevronDown className="h-3 w-3 ml-1.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-zinc-900 border-zinc-800">
                  <DropdownMenuItem
                    onClick={() => insertMarkdown("\n- ", "", "List item")}
                    className="hover:bg-zinc-800 text-zinc-300 cursor-pointer"
                  >
                    <List className="h-4 w-4 mr-2" />
                    Bullet List
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => insertMarkdown("\n1. ", "", "List item")}
                    className="hover:bg-zinc-800 text-zinc-300 cursor-pointer"
                  >
                    <ListOrdered className="h-4 w-4 mr-2" />
                    Numbered List
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={insertNestedList}
                    className="hover:bg-zinc-800 text-zinc-300 cursor-pointer"
                  >
                    <ListTree className="h-4 w-4 mr-2" />
                    Nested List
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Code & Tables Group */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-3 shrink-0 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100"
                    title="Code & Tables"
                  >
                    <Code className="h-4 w-4 mr-1.5" />
                    Code
                    <ChevronDown className="h-3 w-3 ml-1.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-zinc-900 border-zinc-800">
                  <DropdownMenuItem
                    onClick={() => insertMarkdown("`", "`", "code")}
                    className="hover:bg-zinc-800 text-zinc-300 cursor-pointer"
                  >
                    <Code className="h-4 w-4 mr-2" />
                    Inline Code
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={insertCodeBlock}
                    className="hover:bg-zinc-800 text-zinc-300 cursor-pointer"
                  >
                    <FileCode className="h-4 w-4 mr-2" />
                    Code Block
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={insertTable}
                    className="hover:bg-zinc-800 text-zinc-300 cursor-pointer"
                  >
                    <Table className="h-4 w-4 mr-2" />
                    Table
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={insertHTMLBoilerplate}
                    className="hover:bg-zinc-800 text-zinc-300 cursor-pointer"
                  >
                    <FileCode className="h-4 w-4 mr-2" />
                    HTML Boilerplate
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Media & More Group */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-3 shrink-0 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100"
                    title="Media & More"
                  >
                    <Image className="h-4 w-4 mr-1.5" />
                    Insert
                    <ChevronDown className="h-3 w-3 ml-1.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-zinc-900 border-zinc-800">
                  <DropdownMenuItem
                    onClick={insertLink}
                    className="hover:bg-zinc-800 text-zinc-300 cursor-pointer"
                  >
                    <Link className="h-4 w-4 mr-2" />
                    Link <span className="ml-auto text-xs text-zinc-500">Ctrl+Shift+K</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={insertImage}
                    className="hover:bg-zinc-800 text-zinc-300 cursor-pointer"
                  >
                    <Image className="h-4 w-4 mr-2" />
                    Image
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={insertBlockquote}
                    className="hover:bg-zinc-800 text-zinc-300 cursor-pointer"
                  >
                    <Quote className="h-4 w-4 mr-2" />
                    Blockquote
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={insertHorizontalRule}
                    className="hover:bg-zinc-800 text-zinc-300 cursor-pointer"
                  >
                    <Minus className="h-4 w-4 mr-2" />
                    Horizontal Rule
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              <div className="flex-1 min-w-[20px]" />
              
              <div className="text-xs text-zinc-500 mr-3 shrink-0">
                {wordCount} words · {charCount} chars
              </div>
              
              <Button
                size="icon"
                onClick={handleAutoFormat}
                disabled={isAutoFormatting}
                className={cn(
                  "h-8 w-8 shrink-0 bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 hover:from-purple-600 hover:via-pink-600 hover:to-purple-600 text-white border-0 shadow-lg shadow-purple-500/20",
                  isAutoFormatting && "animate-shimmer bg-[length:200%_100%]"
                )}
                title="AI Auto-format"
              >
                <Sparkles className={cn("h-4 w-4", isAutoFormatting && "animate-pulse")} />
              </Button>
            </div>

            {/* Editor */}
            <div className="flex-1 overflow-y-auto bg-zinc-950">
              <Textarea
                ref={textareaRef}
                placeholder="Start writing your note... You can use Markdown formatting."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full h-full min-h-[500px] resize-none border-none bg-transparent px-6 py-4 focus-visible:ring-0 font-mono text-[15px] leading-relaxed text-zinc-200 placeholder:text-zinc-700"
                style={{ caretColor: '#a855f7' }}
              />
            </div>
          </>
        ) : (
          /* Preview */
          <div className="flex-1 overflow-y-auto px-6 py-4 bg-zinc-950">
            <div className="prose prose-sm prose-invert max-w-none prose-headings:text-zinc-100 prose-p:text-zinc-300 prose-a:text-purple-400 prose-strong:text-zinc-100 prose-code:text-pink-400 prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-800">
              <Response>{content || "*No content to preview*"}</Response>
            </div>
          </div>
        )}
      </div>

      {/* Keyboard Shortcuts Panel */}
      {showShortcuts && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowShortcuts(false)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl max-w-md w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-zinc-100">Keyboard Shortcuts</h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowShortcuts(false)}
                className="h-8 w-8 hover:bg-zinc-800"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Bold</span>
                <kbd className="px-2 py-1 bg-zinc-800 rounded text-zinc-300 font-mono text-xs">Ctrl+B</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Italic</span>
                <kbd className="px-2 py-1 bg-zinc-800 rounded text-zinc-300 font-mono text-xs">Ctrl+I</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Underline</span>
                <kbd className="px-2 py-1 bg-zinc-800 rounded text-zinc-300 font-mono text-xs">Ctrl+U</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Insert Link</span>
                <kbd className="px-2 py-1 bg-zinc-800 rounded text-zinc-300 font-mono text-xs">Ctrl+Shift+K</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Save Note</span>
                <kbd className="px-2 py-1 bg-zinc-800 rounded text-zinc-300 font-mono text-xs">Ctrl+S</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Toggle Preview</span>
                <kbd className="px-2 py-1 bg-zinc-800 rounded text-zinc-300 font-mono text-xs">Ctrl+P</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Close Dialog</span>
                <kbd className="px-2 py-1 bg-zinc-800 rounded text-zinc-300 font-mono text-xs">Esc</kbd>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
