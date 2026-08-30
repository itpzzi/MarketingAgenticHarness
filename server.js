const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { handleChat, handleApprove } = require('./lib/orchestrator');
const { getOllamaStatus } = require('./lib/llm');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/data', express.static(path.join(__dirname, 'data')));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/providers', async (req, res) => res.json({ ollama: await getOllamaStatus() }));

app.post('/api/session', (req, res) => {
  res.json({ sessionId: crypto.randomUUID() });
});

app.post('/api/chat', async (req, res) => {
  try {
    const { sessionId, message, apiKey, model } = req.body || {};
    if (!sessionId || !message) {
      return res.status(400).json({ error: 'missing_sessionId_or_message' });
    }
    const result = await handleChat(sessionId, { message, apiKey, model });
    res.json(result);
  } catch (e) {
    console.error('chat_error', e);
    res.status(500).json({ error: 'internal_error', detail: e.message });
  }
});

function writeEvent(res, type, payload) {
  res.write(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`);
}

app.post('/api/chat/stream', async (req, res) => {
  const { sessionId, message, apiKey, model } = req.body || {};
  if (!sessionId || !message) {
    return res.status(400).json({ error: 'missing_sessionId_or_message' });
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
      onTrace: (trace) => writeEvent(res, 'trace', trace),
    });
    writeEvent(res, 'result', result);
  } catch (error) {
    console.error('chat_stream_error', error);
    writeEvent(res, 'error', { error: 'internal_error' });
  } finally {
    res.end();
  }
});

app.post('/api/approve', async (req, res) => {
  try {
    const { sessionId, decision } = req.body || {};
    if (!sessionId || !['approve', 'reject'].includes(decision)) {
      return res.status(400).json({ error: 'missing_sessionId_or_decision' });
    }
    const result = await handleApprove(sessionId, decision);
    res.json(result);
  } catch (e) {
    console.error('approve_error', e);
    res.status(500).json({ error: 'internal_error', detail: e.message });
  }
});

app.post('/api/approve/stream', async (req, res) => {
  const { sessionId, decision } = req.body || {};
  if (!sessionId || !['approve', 'reject'].includes(decision)) {
    return res.status(400).json({ error: 'missing_sessionId_or_decision' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  res.flushHeaders();

  try {
    const result = await handleApprove(sessionId, decision, (trace) => writeEvent(res, 'trace', trace));
    writeEvent(res, 'result', result);
  } catch (error) {
    console.error('approve_stream_error', error);
    writeEvent(res, 'error', { error: 'internal_error' });
  } finally {
    res.end();
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`AdzHubOrchestrator proto ouvindo na porta ${PORT}`);
});
