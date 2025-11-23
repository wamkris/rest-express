import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Lightbulb, Send, X } from "lucide-react";

interface ReflectiveTrayProps {
  conceptName?: string;
  onSubmit?: (reflection: string) => void;
}

export function ReflectiveTray({ conceptName, onSubmit }: ReflectiveTrayProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [reflection, setReflection] = useState("");

  const handleSubmit = () => {
    if (reflection.trim() && onSubmit) {
      onSubmit(reflection);
      setReflection("");
      setIsExpanded(false);
    }
  };

  const handleSkip = () => {
    setReflection("");
    setIsExpanded(false);
  };

  const prompts = [
    "Summarize what you learned in 2-3 sentences",
    "What was the most surprising thing you discovered?",
    "How could you apply this concept to a real-world scenario?",
    "What questions do you still have about this topic?",
  ];

  return (
    <Card 
      className={`
        w-full transition-all duration-300 border-t-2 border-primary/20
        ${isExpanded ? 'shadow-lg' : 'shadow-sm'}
      `}
      data-testid="card-reflective-tray"
    >
      <CardHeader 
        className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
        data-testid="header-toggle-tray"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
            <CardTitle className="text-base font-semibold">Quick Reflection</CardTitle>
            {conceptName && !isExpanded && (
              <Badge variant="outline" className="text-xs" data-testid="badge-concept-name">
                {conceptName}
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            data-testid="button-toggle-tray"
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </Button>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-4" data-testid="content-expanded">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {prompts[Math.floor(Math.random() * prompts.length)]}
            </p>
            {conceptName && (
              <Badge variant="secondary" className="text-xs" data-testid="badge-concept">
                Reflecting on: {conceptName}
              </Badge>
            )}
          </div>

          <Textarea
            placeholder="Type your reflection here..."
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            className="min-h-[100px] resize-none"
            data-testid="textarea-reflection"
          />

          <div className="flex items-center gap-2 justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkip}
              data-testid="button-skip"
            >
              <X className="w-4 h-4 mr-1" />
              Skip
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!reflection.trim()}
              data-testid="button-submit-reflection"
            >
              <Send className="w-4 h-4 mr-1" />
              Submit
            </Button>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            💡 Reflecting on what you learn helps improve retention and understanding
          </p>
        </CardContent>
      )}
    </Card>
  );
}
