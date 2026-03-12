import { useMemo } from 'react';
import { DropdownSelector } from '../../../ui';
import type { DebugCard } from '../lib/debugEventCards';
import './DebugCardsPanel.css';

type DebugCardsPanelProps = {
  runtimeCards: DebugCard[];
  clientCards: DebugCard[];
  eventFilter: string;
  onEventFilterChange: (value: string) => void;
  errorsOnly: boolean;
  onErrorsOnlyChange: (value: boolean) => void;
  onCopyRaw: (raw: string) => void | Promise<void>;
};

export function DebugCardsPanel({
  runtimeCards,
  clientCards,
  eventFilter,
  onEventFilterChange,
  errorsOnly,
  onErrorsOnlyChange,
  onCopyRaw
}: DebugCardsPanelProps) {
  const eventTypeOptions = useMemo(() => {
    const values = new Set<string>();
    runtimeCards.forEach((card) => card.eventType && values.add(card.eventType));
    clientCards.forEach((card) => card.eventType && values.add(card.eventType));
    const sorted = Array.from(values).sort((a, b) => a.localeCompare(b));
    return [{ value: 'all', label: 'All event types' }, ...sorted.map((value) => ({ value, label: value }))];
  }, [clientCards, runtimeCards]);

  const filteredRuntime = useMemo(() => {
    return runtimeCards.filter((card) => {
      if (errorsOnly && card.tone !== 'danger') {
        return false;
      }
      if (eventFilter === 'all') {
        return true;
      }
      return card.eventType === eventFilter;
    });
  }, [errorsOnly, eventFilter, runtimeCards]);

  const filteredClient = useMemo(() => {
    return clientCards.filter((card) => {
      if (errorsOnly && card.tone !== 'danger') {
        return false;
      }
      if (eventFilter === 'all') {
        return true;
      }
      return card.eventType === eventFilter;
    });
  }, [clientCards, errorsOnly, eventFilter]);

  return (
    <section className="debug-cards-panel">
      <div className="debug-cards-controls">
        <DropdownSelector
          value={eventFilter}
          options={eventTypeOptions}
          onValueChange={onEventFilterChange}
          ariaLabel="Filter by event type"
          size="compact"
        />
        <label className="debug-cards-toggle">
          <input
            type="checkbox"
            checked={errorsOnly}
            onChange={(event) => onErrorsOnlyChange(event.currentTarget.checked)}
          />
          <span>Show errors only</span>
        </label>
      </div>
      <div className="debug-cards-list">
        {filteredRuntime.map((card) => (
          <article key={card.key} className={`debug-card tone-${card.tone || 'default'}`}>
            <header className="debug-card-head">
              <div>
                <h4>{card.title}</h4>
                {card.subtitle ? <p>{card.subtitle}</p> : null}
              </div>
              <button type="button" className="debug-card-copy" onClick={() => void onCopyRaw(card.raw)}>
                Copy raw
              </button>
            </header>
            <p className="debug-card-summary">{card.summary}</p>
            <details className="debug-card-raw-details">
              <summary>Raw payload</summary>
              <pre className="debug-card-output">{card.raw}</pre>
            </details>
          </article>
        ))}
        {filteredClient.length > 0 ? <div className="debug-card-divider">Client events</div> : null}
        {filteredClient.map((card) => (
          <article key={card.key} className={`debug-card tone-${card.tone || 'default'}`}>
            <header className="debug-card-head">
              <div>
                <h4>{card.title}</h4>
              </div>
              <button type="button" className="debug-card-copy" onClick={() => void onCopyRaw(card.raw)}>
                Copy raw
              </button>
            </header>
            <p className="debug-card-summary">{card.summary}</p>
            <details className="debug-card-raw-details">
              <summary>Raw payload</summary>
              <pre className="debug-card-output">{card.raw}</pre>
            </details>
          </article>
        ))}
      </div>
    </section>
  );
}
