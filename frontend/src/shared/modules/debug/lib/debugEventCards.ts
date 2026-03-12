export type DebugCardTone = 'default' | 'success' | 'warning' | 'danger';

export type DebugCard = {
  key: string;
  eventType: string;
  title: string;
  subtitle?: string;
  summary: string;
  raw: string;
  tone?: DebugCardTone;
};

function stringifyDebugRaw(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? '');
  }
}

function compactDebugText(value: string, max = 260): string {
  const compact = value.split(/\s+/).join(' ').trim();
  if (!compact) {
    return '(empty)';
  }
  if (compact.length <= max) {
    return compact;
  }
  return `${compact.slice(0, max)}...`;
}

function normalizeDebugCompare(value: string): string {
  return value.split(/\s+/).join(' ').trim();
}

function parseDebugStreamJson(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return null;
  }
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function buildRuntimeDebugCards(events: Array<Record<string, unknown>>, hideProviderEcho: boolean): DebugCard[] {
  const cards: DebugCard[] = [];
  const requestByPhase = new Map<string, string>();
  const providerAssistantMergeByPhase = new Map<string, string>();

  const flushAssistantMerge = (phaseKey?: string) => {
    const keysToFlush = typeof phaseKey === 'string' ? [phaseKey] : Array.from(providerAssistantMergeByPhase.keys());
    keysToFlush.forEach((key) => {
      const merged = providerAssistantMergeByPhase.get(key);
      if (!merged || !merged.trim()) {
        providerAssistantMergeByPhase.delete(key);
        return;
      }
      const subtitle = key ? `phase: ${key}` : undefined;
      const raw = stringifyDebugRaw({
        event: 'debug_model_stream_merge',
        phase: key,
        role: 'assistant',
        merged
      });
      cards.push({
        key: `runtime-merge-${cards.length}-${key || 'default'}`,
        eventType: 'debug_model_stream_merge',
        title: 'Provider Stream Merge (assistant)',
        subtitle,
        summary: compactDebugText(merged),
        raw
      });
      providerAssistantMergeByPhase.delete(key);
    });
  };

  events.forEach((event, index) => {
    const eventType = String(event.event ?? '');
    const phase = typeof event.phase === 'string' ? event.phase : '';
    const subtitle = phase ? `phase: ${phase}` : undefined;
    const phaseKey = phase || 'default';

    if (eventType === 'debug_model_request') {
      flushAssistantMerge(phaseKey);
      const payload = typeof event.payload === 'string' ? event.payload : stringifyDebugRaw(event.payload);
      requestByPhase.set(phase || 'default', normalizeDebugCompare(payload));
      cards.push({
        key: `runtime-${index}`,
        eventType,
        title: 'Model Request',
        subtitle,
        summary: compactDebugText(payload),
        raw: stringifyDebugRaw(event)
      });
      return;
    }

    if (eventType === 'debug_model_response') {
      flushAssistantMerge(phaseKey);
      const payload = typeof event.payload === 'string' ? event.payload : stringifyDebugRaw(event.payload);
      cards.push({
        key: `runtime-${index}`,
        eventType,
        title: 'Model Response',
        subtitle,
        summary: compactDebugText(payload),
        raw: stringifyDebugRaw(event)
      });
      return;
    }

    if (eventType === 'debug_model_stream_line') {
      const line = typeof event.line === 'string' ? event.line : '';
      const parsed = parseDebugStreamJson(line);
      if (parsed) {
        const type = typeof parsed.type === 'string' ? parsed.type : '';
        if (hideProviderEcho && type === 'message' && parsed.role === 'user') {
          const content = typeof parsed.content === 'string' ? parsed.content : '';
          const request = requestByPhase.get(phase || 'default') ?? '';
          if (request && normalizeDebugCompare(content) === request) {
            return;
          }
        }
        if (type === 'tool_use') {
          const toolName = typeof parsed.tool_name === 'string' ? parsed.tool_name : 'tool';
          const params = stringifyDebugRaw(parsed.parameters ?? {});
          cards.push({
            key: `runtime-${index}`,
            eventType,
            title: 'Provider Tool Use',
            subtitle,
            summary: `${toolName}: ${compactDebugText(params, 140)}`,
            raw: stringifyDebugRaw(event),
            tone: 'warning'
          });
          return;
        }
        if (type === 'tool_result') {
          const toolId = typeof parsed.tool_id === 'string' ? parsed.tool_id : 'tool';
          const status = typeof parsed.status === 'string' ? parsed.status : 'success';
          cards.push({
            key: `runtime-${index}`,
            eventType,
            title: 'Provider Tool Result',
            subtitle,
            summary: `${toolId} (${status})`,
            raw: stringifyDebugRaw(event),
            tone: status === 'error' ? 'danger' : 'success'
          });
          return;
        }
        if (type === 'message') {
          const role = typeof parsed.role === 'string' ? parsed.role : 'assistant';
          const content = typeof parsed.content === 'string' ? parsed.content : '';
          if (role === 'assistant' && content) {
            providerAssistantMergeByPhase.set(
              phaseKey,
              `${providerAssistantMergeByPhase.get(phaseKey) ?? ''}${content}`
            );
          } else {
            flushAssistantMerge(phaseKey);
          }
          cards.push({
            key: `runtime-${index}`,
            eventType,
            title: `Provider Stream (${role})`,
            subtitle,
            summary: compactDebugText(content),
            raw: stringifyDebugRaw(event)
          });
          return;
        }
        if (type === 'result') {
          flushAssistantMerge(phaseKey);
          cards.push({
            key: `runtime-${index}`,
            eventType,
            title: 'Provider Result',
            subtitle,
            summary: compactDebugText(stringifyDebugRaw(parsed.stats ?? parsed)),
            raw: stringifyDebugRaw(event),
            tone: 'success'
          });
          return;
        }
        flushAssistantMerge(phaseKey);
      }

      flushAssistantMerge(phaseKey);
      cards.push({
        key: `runtime-${index}`,
        eventType,
        title: 'Provider Stream Line',
        subtitle,
        summary: compactDebugText(line),
        raw: stringifyDebugRaw(event)
      });
      return;
    }

    if (eventType === 'model_delta') {
      flushAssistantMerge(phaseKey);
      const text = typeof event.text === 'string' ? event.text : '';
      cards.push({
        key: `runtime-${index}`,
        eventType,
        title: 'Model Delta',
        subtitle,
        summary: compactDebugText(text),
        raw: stringifyDebugRaw(event)
      });
      return;
    }

    if (eventType === 'tool_use' || eventType === 'tool_result' || eventType === 'debug_tool_result') {
      flushAssistantMerge(phaseKey);
      const lifecycle = typeof event.lifecycle === 'string' ? event.lifecycle : '';
      const toolName = typeof event.tool_name === 'string' ? event.tool_name : 'tool';
      let summary = `${toolName}${lifecycle ? ` (${lifecycle})` : ''}`;
      if (eventType === 'debug_tool_result' && event.output) {
        const output = event.output as Record<string, unknown>;
        if (output.error && typeof output.error === 'object') {
          summary = `${toolName} error: ${compactDebugText(stringifyDebugRaw(output.error), 170)}`;
        } else if (typeof output.summary === 'string') {
          summary = `${toolName}: ${compactDebugText(output.summary)}`;
        }
      }
      const lifecycleTitle = lifecycle
        ? `Tool Event - ${lifecycle.charAt(0).toUpperCase()}${lifecycle.slice(1)}`
        : eventType === 'debug_tool_result'
          ? 'Tool Event - Payload'
          : 'Tool Event';
      cards.push({
        key: `runtime-${index}`,
        eventType,
        title: lifecycleTitle,
        subtitle,
        summary,
        raw: stringifyDebugRaw(event),
        tone: lifecycle === 'failed' ? 'danger' : lifecycle === 'completed' ? 'success' : 'warning'
      });
      return;
    }

    if (eventType.startsWith('run_')) {
      flushAssistantMerge(phaseKey);
      cards.push({
        key: `runtime-${index}`,
        eventType,
        title: eventType,
        subtitle,
        summary: compactDebugText(stringifyDebugRaw(event)),
        raw: stringifyDebugRaw(event),
        tone: eventType === 'run_failed' ? 'danger' : eventType === 'run_completed' ? 'success' : 'default'
      });
      return;
    }

    flushAssistantMerge(phaseKey);
    cards.push({
      key: `runtime-${index}`,
      eventType: eventType || 'event',
      title: eventType || 'Event',
      subtitle,
      summary: compactDebugText(stringifyDebugRaw(event)),
      raw: stringifyDebugRaw(event)
    });
  });

  flushAssistantMerge();
  return cards;
}

export function buildClientDebugCards(events: Array<Record<string, unknown>>): DebugCard[] {
  return events.map((event, index) => {
    const eventType = String(event.event ?? 'client_event');
    return {
      key: `client-${index}`,
      eventType,
      title: eventType,
      summary: compactDebugText(stringifyDebugRaw(event)),
      raw: stringifyDebugRaw(event),
      tone: eventType.includes('error') ? 'danger' : 'default'
    };
  });
}
