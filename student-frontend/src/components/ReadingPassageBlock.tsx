import { memo, useState } from 'react';
import type { ReadingPassage } from '../lib/api';

interface ReadingPassageBlockProps {
  passage: ReadingPassage;
  /** When true, no extra wrapper margins/padding — caller handles layout. */
  compact?: boolean;
}

function ReadingPassageBlockComponent({ passage, compact = false }: ReadingPassageBlockProps) {
  const [expanded, setExpanded] = useState(false);

  // Mobile-first: keep the collapsed preview short (~3 lines) so the question and
  // its options are immediately visible. Tap the button to expand into a scrollable
  // panel that never grows past ~50% of the viewport, so the question stays on screen.
  const wrapperClass = compact
    ? 'rounded-2xl border-2 border-stone-200 bg-stone-50'
    : 'mb-3 sm:mb-4 rounded-2xl border-2 border-stone-200 bg-stone-50';

  return (
    <section className={wrapperClass} aria-label={`Reading passage: ${passage.title}`}>
      <header className="flex items-baseline justify-between gap-3 px-4 pt-3 sm:px-5 sm:pt-4">
        <h3 className="text-sm font-semibold text-stone-500 uppercase tracking-wide">
          Reading text
        </h3>
        {passage.title && (
          <span className="text-xs text-stone-400 truncate" title={passage.title}>
            «{passage.title}»
          </span>
        )}
      </header>

      <div className="px-4 pb-3 pt-1 sm:px-5 sm:pb-4">
        {passage.title && (
          <p className="mb-2 text-base sm:text-lg font-semibold leading-tight text-stone-900">
            «{passage.title}»
          </p>
        )}

        {expanded ? (
          <div className="max-h-[50vh] sm:max-h-[55vh] overflow-y-auto overscroll-contain rounded-xl border border-stone-200 bg-white px-3 py-3 sm:px-4 sm:py-4">
            {passage.body.split(/\n+/).map((para, i) => (
              <p
                key={i}
                className="mb-2 last:mb-0 text-[15px] sm:text-base leading-relaxed text-stone-800 whitespace-pre-wrap"
              >
                {para}
              </p>
            ))}
          </div>
        ) : (
          <div className="relative max-h-20 sm:max-h-24 overflow-hidden">
            <p className="text-[15px] sm:text-base leading-relaxed text-stone-700 whitespace-pre-wrap">
              {passage.body}
            </p>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-stone-50 to-transparent" />
          </div>
        )}

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 active:scale-[0.98] transition"
        >
          {expanded ? 'Свернуть текст' : 'Развернуть текст полностью'}
        </button>
      </div>
    </section>
  );
}

export const ReadingPassageBlock = memo(ReadingPassageBlockComponent);
