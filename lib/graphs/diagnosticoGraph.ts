// Grafo de Estados determinístico (LangGraph) para o diagnóstico de conta.
// Três nós independentes (métricas, conversas, linha do tempo) rodam em
// paralelo — fan-out real do LangGraph (mesmo superstep) — e convergem num
// nó de detecção de anomalias antes da síntese final (feita fora do grafo,
// no fluxo ReAct, que é quem decide se/quando chamar o LLM).
import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { readResource } from '../resources';
import { computeCplCac, detectInconsistentLeads, detectCpaAnomalies } from '../tools';
import type { AdRow } from '../types';

const DiagnosticoState = Annotation.Root({
  rows: Annotation<AdRow[]>({ reducer: (_p, n) => n, default: () => [] }),
  conversations: Annotation<any[]>({ reducer: (_p, n) => n, default: () => [] }),
  timeline: Annotation<any[]>({ reducer: (_p, n) => n, default: () => [] }),
  inconsistentLeads: Annotation<any[]>({ reducer: (_p, n) => n, default: () => [] }),
  anomalies: Annotation<any[]>({ reducer: (_p, n) => n, default: () => [] }),
});

const graph = new StateGraph(DiagnosticoState)
  .addNode('fetchMetrics', async () => ({ rows: computeCplCac() }))
  .addNode('fetchConversations', async () => ({ conversations: readResource('conversations', { query: 'cpa' }).items }))
  .addNode('fetchTimeline', async () => ({ timeline: readResource('timeline', { since: '2026-08-10T00:00:00-03:00' }).events }))
  .addNode('detectAnomalies', async (state) => ({
    inconsistentLeads: detectInconsistentLeads(),
    anomalies: detectCpaAnomalies(state.rows),
  }))
  // fan-out: as três consultas partem do START no mesmo superstep (paralelas)
  .addEdge(START, 'fetchMetrics')
  .addEdge(START, 'fetchConversations')
  .addEdge(START, 'fetchTimeline')
  // fan-in: detectAnomalies só roda depois que as três terminarem
  .addEdge('fetchMetrics', 'detectAnomalies')
  .addEdge('fetchConversations', 'detectAnomalies')
  .addEdge('fetchTimeline', 'detectAnomalies')
  .addEdge('detectAnomalies', END)
  .compile();

async function runDiagnosticoGraph() {
  return graph.invoke({});
}

export { runDiagnosticoGraph };
