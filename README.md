# AdzHubOrchestrator — Protótipo

Protótipo de chat agêntico que **ilustra** a tese do paper *AdzHubOrchestrator*: um harness híbrido que roteia cada pedido do gestor de marketing para a topologia mais adequada — **ReAct**, **Grafo de Estados determinístico (LangGraph)**, **CodeAct/Sandbox** (simulado), **Sessão & Permissões (deny-first / HITL)** e **RLM** (sumarização recursiva) — em vez de usar sempre o mesmo loop.

> Stack: **backend em TypeScript** (Express + [LangGraph](https://github.com/langchain-ai/langgraphjs) para os nós determinísticos) e **frontend em Vue 3 + Vite + TypeScript + Tailwind CSS** (ícones via [lucide-vue-next](https://lucide.dev)). Não reimplementa a infraestrutura completa descrita no paper (BFA com event-sourcing real, A2A entre múltiplos processos, MCP com logits masking em produção); ele demonstra o *comportamento observável* dessas ideias com dados mockados, deixando claro no trace da UI o que é real e o que é simulado.

## Como rodar localmente

```bash
npm install                 # dependências do backend
npm run dev                 # backend (tsx watch, porta 8080) — API + fallback estático

# em outro terminal, para o frontend com hot-reload:
cd web && npm install && npm run dev   # Vite dev server (porta 5173, faz proxy de /api para 8080)
```

Para rodar a build de produção completa (backend + frontend compilados, um único processo Express servindo tudo):

```bash
npm run build   # builda web/ (vue-tsc + vite) e depois o backend (tsc)
npm start       # node dist/server.js — abre em http://localhost:8080
```

Cole sua `OPENROUTER_API_KEY` no campo no topo da tela (fica só em `sessionStorage` do navegador, nunca é enviada para disco no servidor — cada chamada ao OpenRouter usa a key só naquela requisição HTTP). **Sem chave**, o backend tenta automaticamente um **Ollama local** (`http://localhost:11434`, modelos `gemma3:4b` para o papel de fronteira e `qwen2.5:3b` para o papel rápido/barato do Reasoning Sandwich) — isso é só uma conveniência de desenvolvimento para testar o harness com LLM real sem precisar de uma key de produção; no deploy do Railway avaliado, o caminho esperado é o avaliador colar a `OPENROUTER_API_KEY`. Se nem a key nem o Ollama estiverem disponíveis, cai para respostas determinísticas (marcadas como "offline" no trace).

> Nota de performance: em modo local/CPU, o fluxo completo (que aciona o RLM com 4 subchamadas + síntese final) pode levar de 2 a 5 minutos, contra poucos segundos via OpenRouter. Isso é esperado — o objetivo do fallback local é testar a lógica de recursão real, não velocidade de produção.

## Deploy no Railway

1. Suba este diretório como repositório Git e conecte no Railway (New Project → Deploy from GitHub).
2. Configure o comando de build como `npm run build` (builda `web/` com Vite e o backend com `tsc`) e o start como `npm start` (já definidos no `Procfile`).
3. Não defina `OPENROUTER_API_KEY` como variável de ambiente do serviço — a chave é inserida pelo avaliador na UI, por requisição, e nunca fica no servidor.
4. Depois do deploy, a URL pública do Railway já serve o front-end estático compilado (`web/dist`) e a API (`/api/*`) no mesmo serviço Express.

## O que é real vs. simulado

| Peça | Status no protótipo |
|---|---|
| Roteador do BFA escolhendo a topologia por pedido | **Real** — heurística em [`lib/router.ts`](lib/router.ts), visível no trace da sidebar |
| Planejamento explícito (todo list) com alocação de subagente/paradigma | **Real** — [`lib/planner.ts`](lib/planner.ts) monta o plano por fluxo, riscado passo a passo em [`lib/flows.ts`](lib/flows.ts) |
| Memória de curto/longo prazo do chat | **Real** — [`lib/memory.ts`](lib/memory.ts): janela rolante + até 20 fatos persistentes por sessão, injetados em toda chamada de LLM |
| Grafo de Estados (LangGraph) — cruzamento UTM, diagnóstico, pauta, ranking de criativos, orçamento líder | **Real** — grafos determinísticos em [`lib/graphs/`](lib/graphs/) usando `@langchain/langgraph` (`StateGraph`/`Annotation`), com fan-out/fan-in paralelo real (ex.: diagnóstico busca métricas + conversas + timeline no mesmo superstep) |
| CodeAct / Sandbox (script Python de cruzamento) | **Simulado** — mostra o snippet equivalente; a computação real roda em TS no processo do servidor, não em Docker |
| RLM (chunk + sumarização recursiva do manual de marca) | **Real, em escala reduzida** — `manual_marca.txt` é bem menor que os "500k tokens" do paper, e os chunks agora rodam **em paralelo** (`Promise.all`) já que são independentes entre si |
| Sessão & Permissões (deny-first / HITL para `pause_ad`/`resume_ad`) | **Real** — a sessão fica de fato pausada (async generator) até o gestor clicar em Autorizar/Rejeitar na UI |
| Supercérebro (grafo + linha do tempo) | **Simulado** — JSON estático em `data/`, sem Mem0/Graphiti reais |
| Reasoning Sandwich (modelo de fronteira vs. modelo pequeno) | **Real** — a síntese final usa o modelo escolhido na UI (via OpenRouter) ou, sem chave, o Ollama local (`gemma3:4b`/`qwen2.5:3b`); a sumarização intermediária do RLM sempre usa o modelo "rápido" do provedor ativo |
| Fallback local via Ollama (`lib/llm.ts`) | **Conveniência de dev**, não faz parte da tese — só existe para testar o harness com LLM real sem depender de uma OPENROUTER_API_KEY em mãos |
| Event-sourcing / state replay < 20ms do paper | **Só no paper** — a sessão aqui é um objeto em memória por processo, não um log de eventos persistido |

## Tools expostas (Gateway MCP simulado)

O gateway distingue fontes de contexto imutáveis de comandos com efeito colateral, além de expor tools determinísticas (classificadas como paradigma "Grafo") usadas como nós dos grafos LangGraph. As regras de arquitetura estão em [`docs/architecture.md`](docs/architecture.md).

### Resources (somente leitura)

Implementados em [`lib/resources.ts`](lib/resources.ts), lendo os mocks em [`data/`](data/):

| Resource | Camada simulada |
|---|---|---|
| `client_context` / `timeline` | Supercérebro · grafo e linha do tempo |
| `ads` / `ad_insights` | API Meta Ads |
| `leads` | API CRM |
| `creative_ranking` / `solution_map` | App de metodologia |
| `conversations` | Memória de canal |

### Tools determinísticas (paradigma Grafo, sem LLM)

Implementadas em [`lib/tools.ts`](lib/tools.ts) e orquestradas como nós de [`lib/graphs/`](lib/graphs/):

| Tool | Efeito |
|---|---|
| `computeCplCac` | Cruza Meta Ads × CRM por `utm_content` e calcula CPL/CAC |
| `computeRoi` | Calcula ROI (receita/spend) por anúncio |
| `detectInconsistentLeads` | Sinaliza leads com origem declarada divergente do UTM |
| `detectCpaAnomalies` | Sinaliza anúncios com CAC acima de 2x a mediana da conta |
| `findBudgetLeader` | Identifica a campanha com maior orçamento diário |
| `rankCreativesByScore` | Pontua o ranking de criativos por hook+CTA |

### Tools mutáveis (sempre via Sessão & Permissões)

| Tool | Efeito |
|---|---|
| `pause_ad` | Pausa anúncio e sempre passa pelo portão deny-first |
| `resume_ad` | Reativa anúncio e sempre passa pelo portão deny-first |

## Prompts de teste

1. **Fluxo completo (o "mental turn" do paper, Seção 4.1):**
   > "Quero cruzar os gastos de Meta Ads com as UTMs de leads no CRM para calcular o CPL, pausar o criativo ineficaz e sugerir variações de copy baseadas no manual de marca."
   
   Aciona: ReAct (planejamento) → Grafo (cruzamento) → CodeAct simulado → Sessão&Permissões (card de aprovação) → RLM (copies).

2. **Diagnóstico:**
   > "Faça um diagnóstico da conta, tem alguma anomalia?"
   
   Aciona: ReAct em loop chamando múltiplas tools (leads, conversas, timeline) e sintetizando causa + próximos passos.

3. **Pauta de reunião:**
   > "Monta a pauta da próxima call com o cliente."
   
   Aciona: Supercérebro (timeline + conversas) + App de criativos, sintetizados em pauta.

Outros pedidos úteis: *"cruze o CPL das campanhas"*, *"pause o criativo Omega3_Depoimento_v2"*, *"gere variações de copy para o criativo mais fraco"*.

## Estrutura

```
server.ts              # Express: rotas /api/chat, /api/approve, /api/session + estático do build do Vue
lib/router.ts           # BFA: roteador semântico (heurístico) por pedido
lib/planner.ts          # Plano explícito (todo list) por fluxo, com alocação de paradigma
lib/memory.ts           # Memória de curto prazo (janela) e longo prazo (até 20 fatos) por sessão
lib/flows.ts            # Os fluxos híbridos (ReAct/Grafo/CodeAct/RLM/Permissões)
lib/graphs/             # Grafos determinísticos (LangGraph StateGraph) usados pelos flows
lib/orchestrator.ts     # Sessões em memória + condução dos async generators
lib/prompts.ts          # Instruções centralizadas para LLM
lib/resources.ts        # Contexto somente leitura
lib/tools.ts            # Tools determinísticas + comandos com efeito colateral (pause_ad/resume_ad)
lib/llm.ts              # Cliente OpenRouter/Ollama
lib/data.ts             # Carga dos mocks em memória
lib/types.ts            # Tipos compartilhados do harness
data/*.json, *.txt       # Dataset mockado (cliente Housewhey)
web/                     # Front-end Vue 3 + Vite + TypeScript + Tailwind CSS (ícones lucide-vue-next)
  src/App.vue            # Layout raiz (topbar + chat + artefatos)
  src/components/        # ChatMessage, ActivityFeed, PlanChecklist, ApprovalCard, ArtifactsPanel...
  src/lib/                # useChat.ts (estado reativo), api.ts (fetch/SSE), types.ts
  dist/                   # Build de produção (gerado por `npm run build`, servido pelo Express)
```
