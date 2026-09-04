// Grafo de Estados determinístico (LangGraph) para a pauta de reunião:
// linha do tempo, conversas e ranking de criativos são buscados em paralelo.
import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { readResource } from '../resources';
import { store } from '../data';
import { rankCreativesByScore } from '../tools';

const PautaState = Annotation.Root({
  timeline: Annotation<any[]>({ reducer: (_p, n) => n, default: () => [] }),
  conversations: Annotation<any[]>({ reducer: (_p, n) => n, default: () => [] }),
  ranking: Annotation<any[]>({ reducer: (_p, n) => n, default: () => [] }),
});

const graph = new StateGraph(PautaState)
  .addNode('fetchTimeline', async () => ({ timeline: readResource('timeline', { since: '2026-08-14T00:00:00-03:00' }).events }))
  .addNode('fetchConversations', async () => ({ conversations: store.conversas.items }))
  .addNode('fetchRanking', async () => ({ ranking: rankCreativesByScore() }))
  .addEdge(START, 'fetchTimeline')
  .addEdge(START, 'fetchConversations')
  .addEdge(START, 'fetchRanking')
  .addEdge('fetchTimeline', END)
  .addEdge('fetchConversations', END)
  .addEdge('fetchRanking', END)
  .compile();

async function runPautaGraph() {
  return graph.invoke({});
}

export { runPautaGraph };
