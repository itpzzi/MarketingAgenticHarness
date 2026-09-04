import type { ChatResult, TraceEvent } from './types';

export async function ensureSession(): Promise<string> {
  const res = await fetch('/api/session', { method: 'POST' });
  const json = await res.json();
  return json.sessionId as string;
}

export async function fetchProviderStatus(): Promise<{ available: boolean; models: string[] }> {
  try {
    const res = await fetch('/api/providers');
    const { ollama } = await res.json();
    return ollama;
  } catch {
    return { available: false, models: [] };
  }
}

type StreamHandlers = {
  trace: (trace: TraceEvent) => void;
  result: (result: ChatResult) => void;
  error: (payload: unknown) => void;
};

async function readStream(stream: ReadableStream<Uint8Array>, handlers: StreamHandlers): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const event of events) {
      const type = event.match(/^event: (.+)$/m)?.[1];
      const data = event.match(/^data: (.+)$/m)?.[1];
      if (type && data && type in handlers) {
        (handlers as any)[type](JSON.parse(data));
      }
    }
    if (done) break;
  }
}

export async function streamChat(
  body: { sessionId: string; message: string; apiKey: string; model: string },
  handlers: StreamHandlers
): Promise<void> {
  const res = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) throw new Error('Não foi possível iniciar a resposta.');
  await readStream(res.body, handlers);
}

export async function streamApprove(
  body: { sessionId: string; decision: 'approve' | 'reject' },
  handlers: StreamHandlers
): Promise<void> {
  const res = await fetch('/api/approve/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) throw new Error('Não foi possível registrar a decisão.');
  await readStream(res.body, handlers);
}
