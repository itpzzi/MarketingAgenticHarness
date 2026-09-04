import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import crypto from 'crypto';
import { handleChat, handleApprove } from './lib/orchestrator';
import { getOllamaStatus } from './lib/llm';
import type { TraceEvent } from './lib/types';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Independente de rodar via tsx (server.ts na raiz) ou a partir do build
// compilado (dist/server.js), o processo sempre é iniciado a partir da raiz do repo.
const WEB_DIST = path.join(process.cwd(), 'web', 'dist');
app.use(express.static(WEB_DIST));
app.use('/data', express.static(path.join(process.cwd(), 'data')));

app.get('/api/health', (_req: Request, res: Response) => res.json({ ok: true }));
app.get('/api/providers', async (_req: Request, res: Response) => res.json({ ollama: await getOllamaStatus() }));

app.post('/api/session', (_req: Request, res: Response) => {
  res.json({ sessionId: crypto.randomUUID() });
});

app.post('/api/chat', async (req: Request, res: Response) => {
  try {
    const { sessionId, message, apiKey, model } = req.body || {};
    if (!sessionId || !message) {
      return res.status(400).json({ error: 'missing_sessionId_or_message' });
    }
    const result = await handleChat(sessionId, { message, apiKey, model });
    res.json(result);
  } catch (e: any) {
    console.error('chat_error', e);
    res.status(500).json({ error: 'internal_error', detail: e.message });
  }
});

function writeEvent(res: Response, type: string, payload: unknown): void {
  res.write(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`);
}

app.post('/api/chat/stream', async (req: Request, res: Response) => {
  const { sessionId, message, apiKey, model } = req.body || {};
  if (!sessionId || !message) {
    res.status(400).json({ error: 'missing_sessionId_or_message' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  res.flushHeaders();

  try {
    const result = await handleChat(sessionId, {
      message,
      apiKey,
      model,
      onTrace: (trace: TraceEvent) => writeEvent(res, 'trace', trace),
    });
    writeEvent(res, 'result', result);
  } catch (error) {
    console.error('chat_stream_error', error);
    writeEvent(res, 'error', { error: 'internal_error' });
  } finally {
    res.end();
  }
});

app.post('/api/approve', async (req: Request, res: Response) => {
  try {
    const { sessionId, decision } = req.body || {};
    if (!sessionId || !['approve', 'reject'].includes(decision)) {
      return res.status(400).json({ error: 'missing_sessionId_or_decision' });
    }
    const result = await handleApprove(sessionId, decision);
    res.json(result);
  } catch (e: any) {
    console.error('approve_error', e);
    res.status(500).json({ error: 'internal_error', detail: e.message });
  }
});

app.post('/api/approve/stream', async (req: Request, res: Response) => {
  const { sessionId, decision } = req.body || {};
  if (!sessionId || !['approve', 'reject'].includes(decision)) {
    res.status(400).json({ error: 'missing_sessionId_or_decision' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  res.flushHeaders();

  try {
    const result = await handleApprove(sessionId, decision, (trace: TraceEvent) => writeEvent(res, 'trace', trace));
    writeEvent(res, 'result', result);
  } catch (error) {
    console.error('approve_stream_error', error);
    writeEvent(res, 'error', { error: 'internal_error' });
  } finally {
    res.end();
  }
});

// SPA fallback: qualquer rota não-API cai no index.html do Vue Router (se vier a existir).
app.get(/^(?!\/api|\/data).*/, (_req: Request, res: Response) => {
  res.sendFile(path.join(WEB_DIST, 'index.html'));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`AdzHubOrchestrator proto ouvindo na porta ${PORT}`);
});
