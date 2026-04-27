import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { MathToolbar } from './MathToolbar';
import { VisualMathModal } from './VisualMathModal';
import { MarkdownRenderer } from './MarkdownRenderer';

interface MathInputProps {
  value: string;
  onChange: (next: string) => void;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  compact?: boolean;
  showPreview?: boolean;
  className?: string;
}

export interface MathInputHandle {
  focus: () => void;
}

export const MathInput = forwardRef<MathInputHandle, MathInputProps>(function MathInput(
  { value, onChange, multiline = false, rows = 4, placeholder, compact = false, showPreview = true, className = '' },
  ref,
) {
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const [visualOpen, setVisualOpen] = useState(false);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  const insertAtCursor = (snippet: string) => {
    const el = inputRef.current;
    if (!el) {
      onChange(value + snippet);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + snippet + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + snippet.length;
      try {
        el.setSelectionRange(cursor, cursor);
      } catch {
        // some input types disallow setSelectionRange
      }
    });
  };

  const hasMath = /\$[^$]+\$/.test(value);

  const fieldClassName =
    'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

  return (
    <div className={className}>
      <MathToolbar
        compact={compact}
        onInsert={insertAtCursor}
        onOpenVisualEditor={() => setVisualOpen(true)}
      />

      {multiline ? (
        <textarea
          ref={(el) => {
            inputRef.current = el;
          }}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={rows}
          placeholder={placeholder}
          className={fieldClassName}
        />
      ) : (
        <input
          ref={(el) => {
            inputRef.current = el;
          }}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={`${fieldClassName} h-10`}
        />
      )}

      {showPreview && hasMath && (
        <div className="mt-2 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs">
          <span className="mr-2 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Превью
          </span>
          <span className="text-sm text-foreground">
            <MarkdownRenderer content={value} />
          </span>
        </div>
      )}

      <VisualMathModal
        isOpen={visualOpen}
        onClose={() => setVisualOpen(false)}
        onInsert={(latex) => {
          insertAtCursor(latex);
        }}
      />
    </div>
  );
});
