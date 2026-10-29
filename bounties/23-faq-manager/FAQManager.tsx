'use client';

import { useId, useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';

export interface FAQEntry {
  /** Stable and unique within this collection. */
  id: string;
  question: string;
  answer: string;
  category: string;
}

export interface FAQManagerProps {
  /** Supply published FAQ content from the host application. */
  entries: readonly FAQEntry[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  title?: string;
}

const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D4AF37]';
// Fold dotted I after lowercasing without stripping unrelated accents.
const normalize = (text: string) => text.normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/i\u0307/g, 'i');
// Fixed-width UTF-16 encoding preserves every ID, including lone surrogates.
const domKey = (id: string) => id.split('').map((unit) => unit.charCodeAt(0).toString(16).padStart(4, '0')).join('');

/** No storage, network calls, third-party packages, or assumed product claims. */
export function FAQManager({ entries, loading = false, error = null, onRetry, title = 'Frequently asked questions' }: FAQManagerProps) {
  const uid = useId();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const categories = useMemo(() => Array.from(new Set(entries.map((entry) => entry.category))).sort((a, b) => a.localeCompare(b)), [entries]);
  // If a controlled data refresh removes a category, do not strand the user in it.
  const activeCategory = category !== null && categories.includes(category) ? category : null;
  const visible = useMemo(() => {
    const needle = normalize(query);
    return entries.filter((entry) =>
      (activeCategory === null || entry.category === activeCategory) &&
      normalize(`${entry.question} ${entry.answer} ${entry.category}`).includes(needle),
    );
  }, [entries, query, activeCategory]);

  function reset() {
    setQuery('');
    setCategory(null);
  }

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let target: number;
    switch (event.key) {
      case 'ArrowDown': target = (index + 1) % visible.length; break;
      case 'ArrowUp': target = (index + visible.length - 1) % visible.length; break;
      case 'Home': target = 0; break;
      case 'End': target = visible.length - 1; break;
      default: return;
    }
    event.preventDefault();
    document.getElementById(`${uid}-question-${domKey(visible[target].id)}`)?.focus();
  }

  return (
    <section aria-labelledby={`${uid}-title`} aria-busy={loading}
      className="bg-[#0A0A0A] px-4 py-8 text-[#F5F5F5] md:px-8 md:py-12">
      <div className="mx-auto max-w-4xl">
        <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-[#D4AF37]">Help center</p>
        <h2 id={`${uid}-title`} className="break-words text-2xl font-semibold md:text-4xl">{title}</h2>
        <p className="mt-3 text-[#9CA3AF]">Search answers or choose a category.</p>
        <div className="mt-6 rounded-xl border border-[#2A2A2A] bg-[#0D0D0D] p-4">
          <label htmlFor={`${uid}-search`} className="mb-2 block font-medium">Search FAQs</label>
          <input id={`${uid}-search`} type="search" value={query}
            onChange={(event) => setQuery(event.target.value)} disabled={loading || Boolean(error)}
            className={`min-h-11 w-full rounded-lg border border-[#2A2A2A] bg-[#0A0A0A] px-3 py-2 text-[#F5F5F5] hover:border-[#D4AF37] disabled:opacity-50 ${focus}`} />
          <div role="group" aria-label="FAQ categories" className="mt-4 flex flex-wrap gap-2">
            {[null, ...categories].map((value) => (
              <button key={value === null ? 'all' : `category:${value}`} type="button"
                aria-pressed={activeCategory === value} aria-label={value === null ? 'Show all categories' : `Filter category: ${value}`} disabled={loading || Boolean(error)}
                onClick={() => setCategory(value)}
                className={`min-h-11 rounded-lg border px-3 py-2 hover:border-[#E8C547] disabled:opacity-50 ${focus} ${activeCategory === value ? 'border-[#D4AF37] bg-[#D4AF37] text-[#0A0A0A]' : 'border-[#2A2A2A] bg-[#0D0D0D] text-[#F5F5F5]'}`}>
                {value === null ? 'All categories' : value}
              </button>
            ))}
          </div>
        </div>

        {loading ? <p role="status" className="mt-6 text-[#9CA3AF]">Loading FAQs…</p>
          : error ? (
            <div role="alert" className="mt-6 rounded-xl border border-[#2A2A2A] p-4">
              <p>{error}</p>
              {onRetry && <button type="button" onClick={onRetry} className={`mt-3 min-h-11 rounded-lg bg-[#D4AF37] px-4 text-[#0A0A0A] hover:bg-[#E8C547] ${focus}`}>Try again</button>}
            </div>
          ) : (
            <>
              <div className="my-4 flex flex-wrap items-center justify-between gap-3">
                <p role="status" aria-live="polite" aria-atomic="true" className="text-sm text-[#9CA3AF]">
                  {visible.length} {visible.length === 1 ? 'answer' : 'answers'} found
                </p>
                {(query !== '' || activeCategory !== null) && <button type="button" onClick={reset}
                  className={`min-h-11 px-2 text-[#D4AF37] underline hover:text-[#E8C547] ${focus}`}>Clear filters</button>}
              </div>
              {visible.length === 0 ? (
                <div className="rounded-xl border border-[#2A2A2A] p-6">
                  <h3 className="text-lg font-semibold">{entries.length === 0 ? 'No FAQs published yet' : 'No matching FAQs'}</h3>
                  <p className="mt-2 text-[#9CA3AF]">{entries.length === 0 ? 'Check back when new answers are available.' : 'Try a shorter search or clear your filters.'}</p>
                </div>
              ) : visible.map((entry, index) => {
                const id = `${uid}-question-${domKey(entry.id)}`;
                const panel = `${uid}-answer-${domKey(entry.id)}`;
                const open = expanded.has(entry.id);
                return (
                  <article key={entry.id} className="mb-3 rounded-xl border border-[#2A2A2A] bg-[#0D0D0D] hover:bg-[#141414]">
                    <h3>
                      <button type="button" id={id} aria-controls={panel} aria-expanded={open}
                        onKeyDown={(event) => moveFocus(event, index)}
                        onClick={() => setExpanded((previous) => {
                          const next = new Set(previous);
                          if (next.has(entry.id)) next.delete(entry.id); else next.add(entry.id);
                          return next;
                        })}
                        className={`flex min-h-11 w-full items-start justify-between gap-3 rounded-xl p-4 text-left ${focus}`}>
                        <span className="min-w-0 break-words"><span className="block text-xs text-[#D4AF37]">{entry.category}</span><span className="mt-1 block font-semibold">{entry.question}</span></span>
                        <span aria-hidden="true" className="shrink-0 text-xl text-[#D4AF37]">{open ? '−' : '+'}</span>
                      </button>
                    </h3>
                    {/* Keep every aria-controls target in the DOM, including collapsed answers. */}
                    <div id={panel} aria-labelledby={id} hidden={!open}
                      className="whitespace-pre-wrap break-words border-t border-[#2A2A2A] px-4 py-4 text-[#9CA3AF]">
                      {entry.answer}
                    </div>
                  </article>
                );
              })}
            </>
          )}
      </div>
    </section>
  );
}

export default FAQManager;
