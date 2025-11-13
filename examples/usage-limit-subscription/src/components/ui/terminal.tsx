'use client';

import { useEffect, useState, useRef } from 'react';
import { cn } from '@/lib/utils';

interface TerminalProps {
  /**
   * New line to add to the terminal. The component maintains its own internal
   * state of all lines. When this prop changes (by React's dependency comparison),
   * it will be added to the terminal and typed out character by character.
   */
  newLine?: string;
  className?: string;
}

export function Terminal({ newLine, className }: TerminalProps) {
  // Internal state: all lines that have been added
  const [lines, setLines] = useState<string[]>([]);
  const [displayedLines, setDisplayedLines] = useState<string[]>([]);
  const [currentLine, setCurrentLine] = useState('');
  const [currentLineIndex, setCurrentLineIndex] = useState(0);

  // Handle new line prop: add to internal lines state when the prop value changes
  useEffect(() => {
    if (newLine !== undefined) {
      setLines((prev) => [...prev, newLine]);
    }
  }, [newLine]);

  // Type the current line character by character
  useEffect(() => {
    // If we're past all lines, stop
    if (currentLineIndex >= lines.length || currentLineIndex < 0) {
      return;
    }

    const targetLine = lines[currentLineIndex];

    if (!targetLine) {
      return;
    }

    // If we haven't finished typing this line, add the next character
    if (currentLine.length < targetLine.length) {
      const timer = setTimeout(() => {
        setCurrentLine(targetLine.slice(0, currentLine.length + 1));
      }, 15); // Typing speed

      return () => clearTimeout(timer);
    }

    // If we've finished typing this line, move to the next
    if (
      currentLine.length === targetLine.length &&
      currentLine === targetLine
    ) {
      setDisplayedLines((prev) => [...prev, currentLine]);
      setCurrentLine('');
      setCurrentLineIndex((prev) => prev + 1);
    }
  }, [currentLine, currentLineIndex, lines]);

  const contentRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new content is added
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [displayedLines, currentLine]);

  return (
    <div
      className={cn(
        'rounded-lg border bg-background shadow-lg flex flex-col h-80',
        className
      )}
    >
      {/* Terminal Header */}
      <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-2 shrink-0">
        <div className="flex gap-1.5">
          <div className="h-3 w-3 rounded-full bg-red-500" />
          <div className="h-3 w-3 rounded-full bg-yellow-500" />
          <div className="h-3 w-3 rounded-full bg-green-500" />
        </div>
        <div className="ml-2 text-xs text-muted-foreground">Terminal</div>
      </div>

      {/* Terminal Content */}
      <div
        ref={contentRef}
        className="p-4 font-mono text-sm overflow-y-auto flex-1"
      >
        <div className="space-y-1">
          {displayedLines.map((line, index) => (
            <div key={index} className="text-foreground">
              <span className="text-green-400">$</span> <span>{line}</span>
            </div>
          ))}
          {currentLine && (
            <div className="text-foreground">
              <span className="text-green-400">$</span>{' '}
              <span>{currentLine}</span>
              <span className="animate-pulse">▊</span>
            </div>
          )}
          {!currentLine &&
            displayedLines.length === lines.length &&
            lines.length > 0 && (
              <div className="text-foreground">
                <span className="text-green-400">$</span>
                <span className="animate-pulse ml-1">▊</span>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
