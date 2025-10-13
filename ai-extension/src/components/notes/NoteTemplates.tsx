import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface NoteTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  category: string;
  tags: string[];
  icon: string;
}

interface NoteTemplatesProps {
  onSelectTemplate: (template: NoteTemplate) => void;
  onClose: () => void;
  className?: string;
}

const DEFAULT_TEMPLATES: NoteTemplate[] = [
  {
    id: "blank",
    name: "Blank Note",
    description: "Start with a clean slate",
    content: "",
    category: "general",
    tags: [],
    icon: "📝",
  },
  {
    id: "meeting-notes",
    name: "Meeting Notes",
    description: "Template for meeting notes and action items",
    content: `# Meeting Notes

**Date:** ${new Date().toLocaleDateString()}
**Attendees:** 
**Duration:** 

## Agenda
- 

## Discussion Points
- 

## Action Items
- [ ] 
- [ ] 

## Next Steps
- 

## Notes
`,
    category: "work",
    tags: ["meeting", "work"],
    icon: "🤝",
  },
  {
    id: "daily-journal",
    name: "Daily Journal",
    description: "Daily reflection and planning template",
    content: `# Daily Journal - ${new Date().toLocaleDateString()}

## Today's Highlights
- 

## Challenges Faced
- 

## Lessons Learned
- 

## Tomorrow's Goals
- [ ] 
- [ ] 
- [ ] 

## Gratitude
- 

## Mood: 
## Energy Level: /10
`,
    category: "personal",
    tags: ["journal", "daily", "reflection"],
    icon: "📔",
  },
  {
    id: "research-notes",
    name: "Research Notes",
    description: "Template for research and study notes",
    content: `# Research Notes

**Topic:** 
**Source:** 
**Date:** ${new Date().toLocaleDateString()}

## Key Points
- 

## Important Quotes
> 

## Questions
- 

## Related Topics
- 

## Summary
`,
    category: "research",
    tags: ["research", "study", "notes"],
    icon: "🔬",
  },
  {
    id: "project-planning",
    name: "Project Planning",
    description: "Template for project planning and tracking",
    content: `# Project Planning

**Project Name:** 
**Start Date:** ${new Date().toLocaleDateString()}
**Deadline:** 
**Status:** Planning

## Objective
Brief description of what this project aims to achieve.

## Requirements
- [ ] 
- [ ] 
- [ ] 

## Milestones
- [ ] **Phase 1:** 
- [ ] **Phase 2:** 
- [ ] **Phase 3:** 

## Resources Needed
- 

## Risks & Mitigation
- **Risk:** 
  - *Mitigation:* 

## Notes
`,
    category: "work",
    tags: ["project", "planning", "work"],
    icon: "📋",
  },
  {
    id: "book-review",
    name: "Book Review",
    description: "Template for book reviews and notes",
    content: `# Book Review

**Title:** 
**Author:** 
**Genre:** 
**Pages:** 
**Date Read:** ${new Date().toLocaleDateString()}

## Rating: ⭐⭐⭐⭐⭐ (out of 5)

## Summary
Brief summary of the book's main themes and plot.

## Key Takeaways
- 
- 
- 

## Favorite Quotes
> 

## What I Liked
- 

## What I Didn't Like
- 

## Would I Recommend?
Yes/No - Why?

## Related Books
- 
`,
    category: "personal",
    tags: ["book", "review", "reading"],
    icon: "📚",
  },
  {
    id: "recipe",
    name: "Recipe",
    description: "Template for cooking recipes",
    content: `# Recipe Name

**Prep Time:** 
**Cook Time:** 
**Total Time:** 
**Servings:** 
**Difficulty:** Easy/Medium/Hard

## Ingredients
- 
- 
- 

## Instructions
1. 
2. 
3. 

## Notes
- 

## Variations
- 

## Source
`,
    category: "personal",
    tags: ["recipe", "cooking", "food"],
    icon: "👨‍🍳",
  },
  {
    id: "travel-log",
    name: "Travel Log",
    description: "Template for travel experiences and memories",
    content: `# Travel Log

**Destination:** 
**Date:** ${new Date().toLocaleDateString()}
**Duration:** 
**Travel Companions:** 

## Itinerary
- **Day 1:** 
- **Day 2:** 
- **Day 3:** 

## Highlights
- 

## Places Visited
- 

## Food & Restaurants
- 

## Accommodation
**Hotel/Airbnb:** 
**Rating:** ⭐⭐⭐⭐⭐
**Notes:** 

## Budget
- **Transportation:** 
- **Accommodation:** 
- **Food:** 
- **Activities:** 
- **Total:** 

## Photos & Memories
- 

## Would Visit Again?
Yes/No - Why?
`,
    category: "personal",
    tags: ["travel", "log", "memories"],
    icon: "✈️",
  },
];

export function NoteTemplates({ onSelectTemplate, onClose, className }: NoteTemplatesProps) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedCategory, setSelectedCategory] = React.useState<string>("all");

  const categories = React.useMemo(() => {
    const cats = new Set(DEFAULT_TEMPLATES.map(t => t.category));
    return ["all", ...Array.from(cats)];
  }, []);

  const filteredTemplates = React.useMemo(() => {
    return DEFAULT_TEMPLATES.filter(template => {
      const matchesSearch = searchQuery === "" || 
        template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesCategory = selectedCategory === "all" || template.category === selectedCategory;
      
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, selectedCategory]);

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold">Choose a Template</h2>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </Button>
      </div>

      {/* Filters */}
      <div className="p-4 border-b space-y-4">
        <Input
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        
        <div className="flex flex-wrap gap-2">
          {categories.map(category => (
            <Button
              key={category}
              variant={selectedCategory === category ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(category)}
            >
              {category === "all" ? "All" : category.charAt(0).toUpperCase() + category.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {/* Templates Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filteredTemplates.map(template => (
            <div
              key={template.id}
              className="border rounded-lg p-4 hover:bg-accent/50 cursor-pointer transition-colors"
              onClick={() => onSelectTemplate(template)}
            >
              <div className="flex items-start gap-3">
                <div className="text-2xl">{template.icon}</div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm mb-1">{template.name}</h3>
                  <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                    {template.description}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {template.tags.slice(0, 3).map(tag => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 bg-accent rounded-full text-xs"
                      >
                        {tag}
                      </span>
                    ))}
                    {template.tags.length > 3 && (
                      <span className="px-2 py-0.5 bg-accent rounded-full text-xs">
                        +{template.tags.length - 3}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredTemplates.length === 0 && (
          <div className="text-center py-8">
            <p className="text-muted-foreground">No templates found matching your criteria.</p>
          </div>
        )}
      </div>
    </div>
  );
}