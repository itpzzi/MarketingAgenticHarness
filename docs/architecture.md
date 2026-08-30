# Architecture Rules

## Module boundaries

- `lib/prompts.js` owns all LLM instruction text. Flows provide only dynamic context.
- `lib/resources.js` exposes read-only context. Resource functions must not mutate `store`.
- `lib/tools.js` exposes actions with side effects. Every mutable tool must be listed in `MUTABLE_TOOLS` and remain behind the approval gate.
- `lib/flows.js` composes resources, tools, prompts, and LLM calls. A flow is an async generator so approval can suspend and resume its state.
- `lib/orchestrator.js` owns session lifecycle and is the only component that drives flow generators.

## Design patterns in use

- **Backend for Agents:** `router` selects a specialized execution flow for each request.
- **Command:** mutable operations are isolated as tools, currently `pause_ad`.
- **Repository/Resource gateway:** resources provide stable read-only contracts over mock data.
- **Human-in-the-loop:** `yield` creates a deny-first approval boundary before a command runs.
- **Strategy:** provider fallback selects OpenRouter, Ollama, or deterministic output.
- **Map-reduce:** RLM splits the brand manual, summarizes chunks, then synthesizes copies.
- **Activity streaming:** `POST /api/chat/stream` emits public execution milestones over SSE. These events describe routing, resource access, tool use, and task progress; they never expose hidden model reasoning, prompts, credentials, or internal context.

## Implementation constraints

- Use ES6+ collection methods (`map`, `filter`, `reduce`, `find`) when they express the operation clearly.
- Keep data access out of flows except through resources; keep mutations out of resources.
- Do not add prompts inline to flow logic.
- UI provider status is informational: the API key remains browser-session scoped and is not persisted server-side.