# AdzOrchestrator: Um Harness Agêntico Híbrido, Modular e Baseado em Roteamento para a Orquestração do Ecossistema de AdTech da AdzHub

**Autor:** Ítalo Polazzi Ferreira  
*Candidato · Desafio Harness Agêntico · AdzHub Núcleo Fundacional (2026)*

---

### Abstract
Este artigo apresenta o **AdzOrchestrator**, um *harness* agêntico híbrido e modular projetado especificamente para sanar a fragilidade dos sistemas de inteligência artificial aplicados à gestão de campanhas de marketing de alta performance. Atualmente, estimativas apontam que até 88% dos projetos corporativos de agentes de IA falham em atingir a produção [4, 475], sendo que 65% dessas falhas decorrem diretamente de defeitos no nível de *harness* (infraestrutura de controle) e não de déficits cognitivos dos modelos base [12, 12]. No domínio da **AdzHub**, que demanda cruzamentos complexos entre investimentos publicitários (Meta/Google Ads), dados de conversão de CRM e históricos temporais, a exposição direta de ferramentas ou a dependência de prompts reativos gera degradação severa por *Context Rot* [16, 480]. Para resolver este gargalo, propõe-se uma arquitetura baseada no paradigma *Back-end for Agents* (BFA) [384] e no *Model Context Protocol* (MCP) [18, 475], integrando de forma híbrida e dinâmica as cinco abordagens baselines (ReAct, CodeAct, Sessão-Permissões, Grafo e RLM) por meio de um barramento de microsserviços e roteamento semântico. O eventual protótipo web ilustra a tese executando fluxos reais de UTM e análise de criativos via *OpenRouter* e hospedado na plataforma *Railway*, enquanto o controle transacional e a sincronização assíncrona profunda permanecem documentados como contribuições conceituais deste trabalho.

**Keywords:** *agent harness, paradigma híbrido, domínio AdzHub, Back-end for Agents, Model Context Protocol, Plan-Execute-Verify.*

---

## 1. Introduction
O desenvolvimento de agentes autônomos de Inteligência Artificial para a engenharia de software e operações empresariais alcançou maturidade significativa com o advento de modelos de linguagem (LLMs) de larga escala [193, 201]. Contudo, a transição de protótipos acadêmicos ou demonstrativos interativos para sistemas resilientes em produção revela um gap de 88% de taxa de falha [4, 475]. A raiz desta vulnerabilidade reside na negligência da camada que circunda o modelo cognitivo: o *harness* [12, 12; 14, 560]. Enquanto o LLM funciona como um motor probabilístico de predição de tokens (o "cérebro" ou o cavalo de tração), o *harness* constitui o exoesqueleto de runtime (a "taca" ou o sistema operacional) responsável por estruturar loops de execução, gerenciar memórias virtuais, isolar credenciais e impor restrições determinísticas de segurança [5, 475; 14, 561]. Essa dinâmica é formalizada pela equação fundamental:

$$\text{\{Agent\}} = \text{\{Model\}} + \text{\{Harness\}} \quad [5, 475]$$

No contexto de produtos da **AdzHub**, o usuário típico é um gestor de tráfego pago que opera sob forte pressão competitiva, onde alucinações de dados ou análises incorretas de UTMs podem resultar em alocações indevidas de orçamento e sérios prejuízos financeiros [380]. O ecossistema pré-existente da AdzHub dispõe de um robusto "Supercérebro" (alimentado por *Mem0* e *Graphiti* para controle de histórico de conta e contexto temporal [475]), além de Apps de metodologia (diagnóstico, briefing e *insights*) e APIs de plataformas reais (Meta, Google Ads, CRM) [385]. O desafio técnico não reside em substituir este ecossistema, mas em projetar o *harness* ideal que sirva de plano de controle para orquestrar essa infraestrutura [385].

Propor um único tipo de *harness* puro (como apenas loops de *ReAct* ou grafos estáticos de transição) impõe *trade-offs* inaceitáveis entre custo, latência, segurança e flexibilidade. Por exemplo, loops puros de ReAct sofrem de *Context Rot* acelerado devido à sobrecarga de schemas de ferramentas injetados [16, 480], enquanto grafos puramente determinísticos eliminam a flexibilidade adaptativa de agentes autônomos [14, 585]. 

Defendemos, portanto, a tese do **AdzOrchestrator**: uma arquitetura de *harness* híbrida, modular e orientada a microsserviços. Ao encapsular as lógicas do *Supercérebro* e das APIs de AdTech em portas padronizadas através do *Model Context Protocol* (MCP) [18, 475], implementamos um roteador semântico de runtime que altera dinamicamente a topologia do agente de acordo com a complexidade do *workflow* de marketing. O restante deste artigo descreve os fundamentos teóricos dos cinco baselines (Seção 2), detalha o design arquitetural do AdzOrchestrator (Seção 3), demonstra sua aplicabilidade em casos concretos da AdzHub (Seção 4), estabelece as notas de execução do protótipo (Seção 5) e mapeia as limitações e trabalhos futuros da proposta (Seção 6).

---

## 2. Preliminaries & Baseline Taxonomy
Antes de estruturar a defesa do paradigma híbrido, faz-se necessário conceituar o *harness agêntico* e suas fronteiras. Como definido por Macedo (2026), um *harness* de agente de software não se confunde com SDKs de desenvolvimento ou IDEs passivas; ele é, de forma constitutiva, o plano de controle que executa, gerencia a janela de contexto, predispõe ferramentas e valida transições de estado *em tempo de execução* [14, 560, 574]. No ecossistema agêntico, identificam-se cinco categorias fundamentais de *harness*, cada qual apresentando vantagens específicas e severos gargalos quando aplicadas de forma isolada ao domínio da AdzHub:

### 2.1 Loop and Tool-Calling (ReAct)
O loop padrão de *Reasoning and Acting* (ReAct) intercala ciclos de pensamento, chamada de ferramentas e observação de retorno diretamente no mesmo canal conversacional [59, 428].
*   **Vantagens:** Extrema simplicidade de implementação e flexibilidade de raciocínio dinâmico [59, 428].
*   **Limitações no Domínio AdzHub:** Apresenta rápida obsolescência por *Context Rot* [16, 394]. O acúmulo de logs brutos vindos de relatórios volumosos de campanhas degrada a atenção do modelo (decaimento de atenção quadrático), induzindo-o a alucinar parâmetros ou ignorar restrições de verba [16, 479; 394].

### 2.2 Runtime Sandbox (CodeAct)
Este paradigma substitui as chamadas JSON estruturadas pela emissão direta de trechos de código executável (e.g., Python ou JavaScript) executados em um ambiente de isolamento seguro (sandbox microVM ou Docker) [45, 378].
*   **Vantagens:** Flexibilidade ilimitada. Se o agente precisa cruzar dados, ele simplesmente escreve um script *pandas* que manipula e filtra as tabelas de anúncios diretamente [12, 31].
*   **Limitações no Domínio AdzHub:** Alto risco de segurança se não houver um *Gateway de Segurança* [14, 597], além de consumir excessiva janela de contexto ao tentar trafegar dados pesados (como matrizes de dados de UTMs e leads do CRM) para dentro do modelo de linguagem [11, 501].

### 2.3 Sessão com Permissões e Skills
Foca na governança da sessão de runtime, empregando hooks de ciclo de vida (pré e pós-execução), autenticação multifator e provisionamento granular de ferramentas de acordo com a autorização [12, 104].
*   **Vantagens:** Segurança robusta de privilégio mínimo (*deny-first*) [12, 35], blindando credenciais sensíveis de Meta/Google Ads de serem vazadas em prompts maliciosos [16, 395].
*   **Limitações no Domínio AdzHub:** A alta frequência de portões de aprovação humana (*Human-in-the-Loop*) pode gerar fadiga de decisão no gestor de tráfego, atrasando tomadas de decisão urgentes em orçamentos dinâmicos [12, 35].

### 2.4 Orquestração Baseada em Grafo (Graph-Oriented)
Os fluxos de execução são modelados como Directed Acyclic Graphs (DAGs) estáticos de transição de estados determinísticos, onde cada nó representa uma etapa rígida da metodologia [14, 585].
*   **Vantagens:** Máxima previsibilidade e controle estruturado de etapas, como forçar a passagem obrigatória de um *Briefing* por um *Portão de Validação* antes da chamada de execução de anúncios [9, 19].
*   **Limitações no Domínio AdzHub:** Rigidez estrutural. Se uma anomalia em Meta Ads demandar uma consulta ad-hoc a um lead no CRM que não estava mapeada nas arestas originais do grafo, o agente falhará por incapacidade de ramificação dinâmica [14, 227].

### 2.5 Recursive Language Models (RLM)
O modelo de linguagem trata o prompt longo como um objeto externo dentro de um interpretador REPL interativo, segmentando-o recursivamente através de subchamadas internas programáticas e simbólicas [8, 411, 412].
*   **Vantagens:** Capacidade de escalar o processamento de contextos extremamente longos (acima de 10 milhões de tokens), mitigando o *Context Rot* clássico e reduzindo custos de KV-cache [8, 412, 422].
*   **Limitações no Domínio AdzHub:** Altíssima latência e consumo de tokens por recursão em tarefas simples que poderiam ser resolvidas por um único microsserviço ou consulta direta de banco de dados [8, 421].

---

## 3. The AdzOrchestrator Architecture
Para orquestrar eficientemente o ecossistema AdzHub sem herdar os gargalos das abordagens isoladas, o **AdzOrchestrator** adota um design híbrido e modular estruturado em cinco dimensões integradas sob o paradigma de microsserviços. Em vez de ser construído sob uma única abordagem rígida, o AdzOrchestrator funciona como um envelope de runtime dinâmico que coordena de forma integrada lógicas baseadas em ReAct, CodeAct, Sessão-Permissões, Grafos de Estados e Recursive Language Models (RLM), alocando cada recurso de acordo com o padrão de tráfego e a complexidade da tarefa publicitária.

```
   [ Gestor de Tráfego Paid ] 
               │  (Input Conversacional / Agência Digital)
               ▼
┌────────────────────────────────────────────────────────┐
│               Agentic UI (AG-UI)                       │
│  - Renderização Desacoplada de Componentes de AdTech   │
└──────────────────────┬─────────────────────────────────┘
                       │ Event-Sourced Protocol (WS)
                       ▼
┌────────────────────────────────────────────────────────┐
│          Back-end for Agents (BFA) (Control Plane)     │
│  - Event-Sourcing State Replay (< 20ms Recovery)       │
│  - Roteador Semântico / Reasoning Sandwich             │
└──────┬───────────────────┬───────────────────┬─────────┘
       │                   │                   │
       │ (A2A Protocol)    │ (MCP Protocol)    │ (RAG Pipeline)
       ▼                   ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────────┐
│ Subagentes   │   │ Gateway MCP  │   │  Supercérebro    │
│ Especialistas│   │ (Logits      │   │  Mem0 + Graphiti │
│ - Planner    │   │  Masking &   │   │  (Contexto e     │
│ - Executor   │   │  Isolation)  │   │   Histórico)     │
│ - Verificador│   │ - Meta/Google│   └──────────────────┘
│              │   │ - CRM API    │
└──────────────┘   └──────────────┘
```

### 3.1 O Chassis de Execução: BFA com Event-Sourcing e Reasoning Sandwich
O AdzOrchestrator baseia seu plano de controle em um BFA altamente desacoplado, modelado a partir dos aprendizados do OpenHands V1 [7, 566]. Em vez de manter estados mutáveis acoplados em processos de LLM propensos a travamentos, o sistema adota **Event-Sourced State Management** [7, 570]. Apenas o evento bruto (mensagens, ações propostas e observações recebidas) é persistido de forma imutável [7, 570].
*   **Resiliência a Falhas:** Este barramento permite um mecanismo de *state replay* ultrarrápido: em caso de colapso de infraestrutura, a sessão agêntica é recuperada de forma idêntica em menos de **20 ms** [7, 602].
*   **Reasoning Sandwich (Sanduíche de Raciocínio):** O BFA delega o planejamento de longo horizonte e a validação crítica final a modelos de raciocínio de alta capacidade (como o GPT-5 ou Claude Opus) que formam as "bordas" (*Reasoning Sandwich*), enquanto o trabalho intermediário de processamento de planilhas e chamadas de API é encaminhado para modelos menores, mais rápidos e de baixo custo [4, 535; 11, 488].

### 3.2 Decomposição de Tarefas e Paralelização (A2A e Equipes Heterogêneas)
O AdzOrchestrator quebra a dependência de um agente único e generalista ao implementar o protocolo **A2A** da *Linux Foundation* para delegação horizontal [1, 167; 7, 588]. 
Como fundamentado no *roadmap* de engenharia de software agêntica de Anonymous (2025) [1, 1], a orquestração de longo horizonte em problemas complexos exige a **decomposição de tarefas e a paralelização** (Task Decomposition and Parallelization) por meio de equipes agênticas heterogêneas de subagentes especializados. Sob esse paradigma, um plano ou script de planejamento complexo (*BriefingScript*) pode ser quebrado em nós independentes de processamento e atribuído em paralelo a múltiplos subagentes, os quais podem rodar em instâncias de diferentes modelos otimizados para suas forças específicas (e.g., Gemini 2.5 Pro para estruturação lógica e planejamento, e Claude 3.5 Sonnet ou o1 para geração e validação de código detalhado) [1, 1]. Esse design de controle viabiliza o uso rotineiro de técnicas de tolerância a falhas baseadas em Programação de N-Versões (*N-version programming*), onde múltiplas variações de *pull requests* (PRs) ou estratégias de campanha são testadas simultaneamente (gerando, por exemplo, 4 PRs em paralelo por ticket de tráfego) [1, 1]. A métrica chave do *harness* desloca-se da latência de uma chamada isolada para o *throughput* geral do sistema (*overall system throughput*) [1, 1].
Assim, o MainAgent instancia subagentes altamente especializados com contextos isolados e orçamentos de tokens restritos [7, 588]:
1.  **Planner Agent:** Foca exclusivamente na formulação de planos em arquivos estruturados Markdown (e.g., `~/.opendev/plans/marketing_strategy.md`), operando de forma estritamente isolada do ambiente de escrita para evitar mutações indesejadas [8, 410, 430].
2.  **Executor Agent (CodeAct com Sandbox):** Responsável por escrever scripts locais e interagir com APIs reais de anúncios sob sandbox contido, munido exclusivamente de permissões de alteração restritas [7, 569, 588]. Ele executa o código em ambientes virtualizados isolados para mitigar riscos de segurança e falhas de runtime [7, 569; 10, 544].
3.  **Verificador Agent:** Um script determinístico ou LLM especializado que compara as respostas de alteração com oráculos rígidos de marketing antes de cometer qualquer modificação nos orçamentos reais [7, 591].

### 3.3 Sessão Centrada em Governança: Políticas Deny-First, Skills e Gateway MCP
O vertical de ferramentas do AdzOrchestrator adota o protocolo MCP aberto, padronizando como o Supercérebro e as APIs expõem suas capacidades [2, 16; 7, 575]. 
*   **Combate ao Context Rot:** Conectar múltiplos canais de Ads e CRMs expõe dezenas de ferramentas simultaneamente, o que geraria um custo proibitivo de tokens por chamada (*Orientation Tax*) e destruiria a atenção da LLM [4, 538, 539].
*   **Logits Masking Dinâmico:** O harness MCP do AdzOrchestrator realiza *Logits Masking* em tempo de execução: com base no nó do checklist ativo (determinado na etapa de planejamento), o harness mascara os logits de predição do modelo ou filtra dinamicamente as definições JSON injetadas na janela de contexto [4, 538; 12, 463]. O modelo só "enxerga" as ferramentas de Meta Ads se estiver na fase de gerenciamento de criativos, reduzindo o custo fixo de tokens de MCP de **40% para menos de 5%** [8, 124].
*   **Políticas Deny-First:** Nenhuma ferramenta mutável ou destrutiva (como pausar anúncios, alterar orçamentos ou enviar e-mails de cobrança) possui permissão implícita de execução. O sistema opera sob um portão rígido de segurança de privilégio mínimo (*deny-first*), onde cada chamada mutável é interceptada, congelada em status `WAITING_FOR_APPROVAL` e enviada à AG-UI para autorização explícita do gestor humano [7, 569; 12, 460].

### 3.4 Orquestração de Fluxo por Grafo para Tarefas Rotineiras
Para rotinas operacionais conhecidas e repetitivas — tais como o cruzamento diário de planilhas de UTM, cálculos básicos de CPL (Custo por Lead) ou compilação de relatórios de fechamento —, o AdzOrchestrator desativa a tomada de decisão agêntica probabilística.
*   **Workflows Orientados a Grafos:** O harness orquestra essas tarefas através de uma topologia de Grafo de Estados (*Graph-Oriented Workflow*) determinístico [4, 535]. Cada etapa vira um nó fixo no barramento de microsserviços do BFA, garantindo que o agente transite entre os estados de forma linear, previsível e sem latência ou risco de alucinação de modelo [4, 535].

### 3.5 Recursive Language Models (RLM) para Contextos de Alta Densidade
Quando o gestor solicita análises que exigem processar históricos temporais longos, briefs de campanhas concorrentes ou manuais extensos de tom de marca (cenários de 10M+ de tokens), o sistema sofre de severa degradação de atenção (*Context Rot* [4, 536; 11, 480]).
*   **Processamento por Recursão:** O AdzOrchestrator contorna esse gargalo roteando essas requisições para um loop de RLM [11, 479]. O RLM trata o contexto denso como uma variável amarrada no REPL [11, 483]. Ele programa e executa pequenos scripts Python que dividem o contexto em pedaços e realizam subchamadas programáticas (recursivas) a modelos menores de sumarização (e.g., GPT-5-mini), costurando as respostas em uma saída unificada [11, 484, 488]. Isso permite resolver a tarefa com custo e latência controlados e sem perder detalhes críticos por compactações malfeitas [11, 492].

---

## 4. System Architecture (O que existiria / O que o chat ilustra)
Nesta seção, detalhamos como a arquitetura do **AdzOrchestrator** se comporta na prática perante o usuário. Apresentamos primeiro o experimento mental de um ciclo conversacional completo e, em seguida, o catálogo de componentes e ferramentas que integram a solução.

### 4.1 O Experimento Mental de um Turno (Mental Turn Simulation)
Para ilustrar a dinâmica híbrida do AdzOrchestrator, simulamos um turno prático de trabalho de um gestor de marketing da AdzHub. O usuário digita a seguinte solicitação no chat:
> *"Quero cruzar os gastos de Meta Ads das campanhas ativas com as UTMs de leads no CRM para calcular o custo real por lead (CPL). Pause os criativos ineficazes e sugira variações de copy baseadas no manual de marca do cliente."*

O harness intercepta essa intenção e executa as seguintes fases de forma transparente e controlada:

1.  **Intent & Planning (ReAct Loop Chassis):** O BFA recebe a entrada. Através da interface conversacional do ReAct, ele instancia o *Planner Agent* [7, 588]. O Planner analisa o repositório, define os arquivos necessários para o cruzamento, cria o checklist em `todo.md` e o plano estruturado em `PLAN.md` [8, 410, 430]. O processo utiliza o modelo Claude 3.5 Sonnet para garantir rigidez lógica na fronteira (*Reasoning Sandwich*) [4, 535].
2.  **Sessão & Permissões (Constant Security Guard):** Durante a criação do checklist, o harness detecta o comando de alta criticidade `pause_ad(ad_id)`. Sob a política *deny-first*, o *harness* bloqueia preventivamente qualquer execução automática dessa ferramenta, alterando o status da tarefa no checklist para `WAITING_FOR_APPROVAL` e gerando um portão de segurança [7, 569; 12, 460].
3.  **Cruzamento de UTMs (Grafo de Estados & CodeAct Sandbox):** 
    *   Como a tarefa de "cruzar planilhas de UTM" é uma rotina repetitiva e estruturada, o BFA desvia sua execução do loop probabilístico para um **Grafo de Estados determinístico** para acelerar o processo [4, 535].
    *   O harness dispara o subagente *Executor* [7, 588] dentro de uma sandbox Docker isolada [10, 544]. O Executor escreve e executa um script em Python (*pandas*) que carrega e associa a tabela de leads do CRM às métricas baixadas da API de Meta Ads [7, 569; 11, 553].
    *   Para evitar carregar 200.000 registros e estourar a janela de contexto, o harness grava o resultado final cruzado em um arquivo Parquet temporário no filesystem da sandbox e expõe um amigável **Memory Pointer** (ponteiro de memória) [5, 553].
    *   A **Agentic UI (AG-UI)** intercepta o ponteiro e renderiza um gráfico de dispersão interativo do custo por lead real diretamente na tela do chat, sem enviar uma única linha da planilha para o contexto da LLM [6, 452; 7, 570].
4.  **Pausa de Anúncios e HITL (Sessão & Permissões):** A análise do Executor aponta três criativos com CPL 300% acima do teto tolerado. O agente propõe pausá-los. O harness intercepta a ferramenta e exibe um Card de Confirmação na UI (*Human-in-the-Loop*). O processo congela até que o gestor de tráfego clique em "Autorizar Pausa" [7, 569; 12, 460].
5.  **Geração de Copys (RLM para Contexto Denso):** Para substituir os criativos pausados, o agente precisa analisar o manual de tom de marca do cliente, um documento PDF de 500.000 tokens [11, 480]. Para processar essa carga densa sem alucinar, o BFA ativa o **Recursive Language Model (RLM)** [11, 479]. O RLM REPL executa loops no código, fatiando o manual e resumindo recursivamente suas diretrizes de redação sem estourar o limite ativo do modelo [11, 484]. O MainAgent sintetiza o aprendizado e exibe três novas variações de copy textual otimizadas no chat.

### 4.2 Catálogo de Componentes e Ferramentas (Tool and Component Catalog)
A Tabela 1 detalha os componentes e ferramentas do ecossistema AdzHub integrados ou orquestrados pelo AdzOrchestrator, explicitando seu papel teórico e o status de visibilidade no protótipo:

**Table 1. Catálogo de Componentes e Ferramentas do AdzOrchestrator**
| Peça / Componente | Papel na Tese | No paper / no chat / mock | Função / O que resolve | Status de Implementação |
| :--- | :--- | :--- | :--- | :--- |
| **Back-end for Agents (BFA)** | Control Plane & Event-Sourcing | No paper (Conceitual) | Gerenciamento de estado imutável, resiliência a falhas, roteamento de subagentes e restauração de sessão em <20ms [7]. | Só Tese (Conceitual) |
| **Planner Agent (A2A)** | Decomposição e Planejamento [1] | No chat / simulado | Lê a base e formula o plano de marketing estruturado no arquivo local `PLAN.md` antes de qualquer execução [1, 8]. | Simulado |
| **Executor Agent (CodeAct)** | Execução de Código em Sandbox [7, 10] | No chat / virtual | Escreve e roda scripts Python (e.g., cruzamento pandas) em containers Docker virtualizados e controlados [7, 10]. | Simulado (Terminal Virtual) |
| **Sessão & Permissões** | Segurança e Governança Deny-First [12] | No chat (Gated UI) | Intercepta chamadas de alto risco (e.g., pausar campanhas), pausando a execução e exigindo aprovação humana explícita [7, 12]. | Visível na UI (Card de Aprovação) |
| **Memory Pointers (AG-UI)** | Otimização de Janela de Contexto [5] | No chat / visual | Evita carregar planilhas de 200 mil leads no contexto da LLM, trafegando apenas o ponteiro do dado processado na sandbox para renderização direta na UI [5, 6]. | Visível na UI (Gráficos Reativos) |
| **Recursive Language Model (RLM)** | Processamento de Contexto Denso [11] | No paper (Conceitual) | Segmenta recursivamente documentos de alta densidade (briefings e tom de marca) através de subchamadas internas programáticas e REPL [11]. | Só Tese (Conceitual) |
| **Supercérebro (RAG)** | Memória Semântica e Histórico [9] | No chat (Simulado) | Recupera histórico contextual e contexto temporal do cliente usando Mem0 e Graphiti [9]. | Simulado |

---

Para ilustrar a viabilidade da tese aos avaliadores, desenvolvemos um protótipo conversacional funcional e simplificado que expõe os fundamentos da orquestração do AdzOrchestrator.

### 5.1 Especificações da Demo Conversacional
*   **Hospedagem e Deployment:** Hospedado na plataforma de nuvem **Railway**, garantindo um runtime estável e isolado para a execução do back-end baseado em microsserviços.
*   **Motor Cognitivo:** Utiliza o motor **OpenRouter** para roteamento de modelos [59, 417]. Em conformidade com o *Reasoning Sandwich*, as chamadas de planejamento e verificação final utilizam modelos de alto raciocínio (e.g., GPT-4o ou Claude 3.5 Sonnet), enquanto as gerações rápidas e formatações de tabela são encaminhadas para modelos menores de baixo custo (e.g., Llama 3.1 8B).
*   **O que é Funcional (Real) no Protótipo:**
    *   O chat conversacional imita uma interface estilo *Cursor* com histórico de transição de estado gerenciado via *Event-Sourcing* assíncrono.
    *   Leitura de dados estáticos reais de campanhas de Ads mimetizados através de mocks locais ricos.
    *   Criação automática e persistência de arquivos Markdown do checklist de planejamento (e.g., `PLAN.md`) no filesystem virtual de simulação.
    *   Interface conversacional amigável que envia e renderiza portões de aprovação de segurança em tempo de execução para simular a pausa de campanhas de anúncios.
*   **O que é Simulado (Fake/Mocked):**
    *   O sandbox não executa comandos diretos de shell mutáveis na máquina servidora do Railway para evitar riscos de vulnerabilidades cibernéticas locais; em vez disso, executa chamadas em um container Docker virtualizado controlado ou simula o terminal.
    *   As APIs de Meta e Google Ads consomem dados simulados coerentes do arquivo mock para evitar consumo financeiro real de faturamento durante o período de avaliação técnica.

---

## 6. Limitations and Future Work
Embora o AdzOrchestrator resolva de forma robusta a orquestração e mitigue as falhas sistêmicas de contexto e segurança de agentes autônomos, mapeamos limitações conscientes que delimitam o escopo atual da nossa tese acadêmica:

1.  **Divergência Concorrente de Estado Multitenant (SyncMind Constraint):** O sistema não soluciona em produção o problema de concorrência massiva e dessincronização de estado quando múltiplos gestores e agentes escrevem e pausam campanhas em paralelo na mesma conta de Ads [122, 286]. A resolução desse gap de consistência semântica é delegada para futuras investigações utilizando bancos de dados transacionais com travamentos semânticos [286].
2.  **Incompletude da Análise de Segurança via LLM:** O *Gateway de Segurança* que analisa e valida as chamadas de API de Ads propostas pelo Executor baseia-se em classificações semânticas e análise estática, as quais permanecem vulneráveis a ataques avançados de injeção de prompt ou comandos cifrados que burlam o interpretador base [12, 550; 10, 603].
3.  **Abstrações de Modelagem Temporal:** O cruzamento temporal complexo de dados de CRM baseia-se na estabilidade de logs fornecidos. Alterações drásticas e estruturais inesperadas nas tabelas de UTMs do cliente exigem uma intervenção manual do desenvolvedor humano para remapear o parser de dados, visto que o harness não realiza auto-reparação de schemas de banco de dados legados e instáveis em tempo de execução [385].

---

## References
*   [1] Anonymous (2025). Agentic Software Engineering: Foundational Pillars and a Research Roadmap. arXiv:2509.06216v3.
*   [2] Anthropic (2024). Model Context Protocol (MCP).
*   [3] Anthropic (2025). Best practices for Claude Code.
*   [4] Masood, A. (2026). Agent Harness Engineering — The Rise of the AI Control Plane. Enterprise AI Control Plane Journal.
*   [5] Bulle Labate, A., et al. (2025). Solving Context Window Overflow in AI Agents. IBM Research, arXiv:2511.22729v1.
*   [6] Oliveira de Macedo, S. (2026). What makes a harness a harness: necessary and sufficient conditions for an agent harness. Federal Institute of Goiás, arXiv:2606.10106v1.
*   [7] Wang, X., et al. (2026). The OpenHands Software Agent SDK: A Composable and Extensible Foundation for Production Agents. MLSys 2026, arXiv:2511.03690v2.
*   [8] Wang, R., et al. (2026). Harness Handbook: Making Evolving Agent Harnesses Readable, Navigable, and Editable. arXiv:2607.13285v1.
*   [9] Yao, Y., et al. (2026). ARC: Active and Reflection-driven Context Management for Long-Horizon Information Seeking Agents. Peking University, arXiv:2601.12030.
*   [10] Ning, X., et al. (2026). Code as Agent Harness: Toward Executable, Verifiable, and Stateful Agent Systems. University of Illinois Urbana-Champaign, arXiv:2605.18747v1.
*   [11] Recursive Language Models (2025). arXiv:2512.24601v3.
*   [12] Model Context Protocol (MCP) Security: How to Restrict Tool Access Using AI Gateways | Kong Inc. (2026).