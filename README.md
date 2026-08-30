# AdzHubOrchestrator — Protótipo

Protótipo de chat agêntico que **ilustra** a tese do paper *AdzHubOrchestrator*: um harness híbrido que roteia cada pedido do gestor de marketing para a topologia mais adequada — **ReAct**, **Grafo de Estados determinístico**, **CodeAct/Sandbox** (simulado), **Sessão & Permissões (deny-first / HITL)** e **RLM** (sumarização recursiva) — em vez de usar sempre o mesmo loop.

> Este protótipo é intencionalmente simples (Node/Express + HTML/CSS/JS puro, sem build step) para caber no prazo do desafio. Ele **não** reimplementa a infraestrutura completa descrita no paper (BFA com event-sourcing real, A2A entre múltiplos processos, MCP com logits masking em produção); ele demonstra o *comportamento observável* dessas ideias com dados mockados, deixando claro no trace da UI o que é real e o que é simulado.

## Como rodar localmente

```bash
npm install
npm start
# abre em http://localhost:8080
```

Cole sua `OPENROUTER_API_KEY` no campo no topo da tela (fica só em `sessionStorage` do navegador, nunca é enviada para disco no servidor — cada chamada ao OpenRouter usa a key só naquela requisição HTTP). **Sem chave**, o backend tenta automaticamente um **Ollama local** (`http://localhost:11434`, modelos `gemma3:4b` para o papel de fronteira e `qwen2.5:3b` para o papel rápido/barato do Reasoning Sandwich) — isso é só uma conveniência de desenvolvimento para testar o harness com LLM real sem precisar de uma key de produção; no deploy do Railway avaliado, o caminho esperado é o avaliador colar a `OPENROUTER_API_KEY`. Se nem a key nem o Ollama estiverem disponíveis, cai para respostas determinísticas (marcadas como "offline" no trace).

> Nota de performance: em modo local/CPU, o fluxo completo (que aciona o RLM com 4 subchamadas + síntese final) pode levar de 2 a 5 minutos, contra poucos segundos via OpenRouter. Isso é esperado — o objetivo do fallback local é testar a lógica de recursão real, não velocidade de produção.

## Deploy no Railway

1. Suba este diretório como repositório Git e conecte no Railway (New Project → Deploy from GitHub).
2. Railway detecta o `package.json` e roda `npm install && npm start` automaticamente (Node ≥ 18, usa `fetch` nativo).
3. Não defina `OPENROUTER_API_KEY` como variável de ambiente do serviço — a chave é inserida pelo avaliador na UI, por requisição, e nunca fica no servidor.
4. Depois do deploy, a URL pública do Railway já serve o front-end estático (`/public`) e a API (`/api/*`) no mesmo serviço.

## O que é real vs. simulado

| Peça | Status no protótipo |
|---|---|
| Roteador do BFA escolhendo a topologia por pedido | **Real** — heurística em [`lib/router.js`](lib/router.js), visível no trace da sidebar |
| Grafo de Estados (cruzamento UTM Meta Ads × CRM) | **Real** — função determinística em [`lib/flows.js`](lib/flows.js), sem LLM no meio |
| CodeAct / Sandbox (script Python de cruzamento) | **Simulado** — mostra o snippet equivalente; a computação real roda em JS no processo do servidor, não em Docker |
| RLM (chunk + sumarização recursiva do manual de marca) | **Real, em escala reduzida** — `manual_marca.txt` é bem menor que os "500k tokens" do paper, mas o padrão de map-reduce recursivo com múltiplas chamadas de LLM é executado de verdade |
| Sessão & Permissões (deny-first / HITL para `pause_ad`) | **Real** — a sessão fica de fato pausada (async generator) até o gestor clicar em Autorizar/Rejeitar na UI |
| Supercérebro (grafo + linha do tempo) | **Simulado** — JSON estático em `data/`, sem Mem0/Graphiti reais |
| Reasoning Sandwich (modelo de fronteira vs. modelo pequeno) | **Real** — a síntese final usa o modelo escolhido na UI (via OpenRouter) ou, sem chave, o Ollama local (`gemma3:4b`/`qwen2.5:3b`); a sumarização intermediária do RLM sempre usa o modelo "rápido" do provedor ativo |
| Fallback local via Ollama (`lib/llm.js`) | **Conveniência de dev**, não faz parte da tese — só existe para testar o harness com LLM real sem depender de uma OPENROUTER_API_KEY em mãos |
| Event-sourcing / state replay < 20ms do paper | **Só no paper** — a sessão aqui é um objeto em memória por processo, não um log de eventos persistido |

## Tools expostas (Gateway MCP simulado)

O gateway distingue fontes de contexto imutáveis de comandos com efeito colateral. As regras de arquitetura estão em [`docs/architecture.md`](docs/architecture.md).

### Resources (somente leitura)

Implementados em [`lib/resources.js`](lib/resources.js), lendo os mocks em [`data/`](data/):

| Resource | Camada simulada |
|---|---|---|
| `client_context` / `timeline` | Supercérebro · grafo e linha do tempo |
| `ads` / `ad_insights` | API Meta Ads |
| `leads` | API CRM |
| `creative_ranking` / `solution_map` | App de metodologia |
| `conversations` | Memória de canal |

### Tools (comando mutável)

| Tool | Efeito |
|---|---|
| `pause_ad` | Pausa anúncio e sempre passa pelo portão deny-first |

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
server.js            # Express: rotas /api/chat, /api/approve, /api/session
lib/router.js         # BFA: roteador semântico (heurístico) por pedido
lib/flows.js          # Os fluxos híbridos (ReAct/Grafo/CodeAct/RLM/Permissões)
lib/orchestrator.js   # Sessões em memória + condução dos async generators
lib/prompts.js         # Instruções centralizadas para LLM
lib/resources.js       # Contexto somente leitura
lib/tools.js           # Comandos com efeito colateral
lib/llm.js             # Cliente OpenRouter
lib/data.js            # Carga dos mocks em memória
data/*.json, *.txt      # Dataset mockado (cliente Housewhey)
public/                # Front-end (HTML/CSS/JS puro, sem build)
```
