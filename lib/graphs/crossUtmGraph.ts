// Grafo de Estados determinístico (LangGraph) para o cruzamento Meta Ads × CRM.
// Cada nó é uma função pura, sem chamada de LLM — o paradigma "Grafo" do paper.
import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { computeCplCac, computeRoi } from '../tools';
import type { AdRow } from '../types';

const CrossUtmState = Annotation.Root({
  rows: Annotation<AdRow[]>({ reducer: (_prev, next) => next, default: () => [] }),
  roi: Annotation<{ ad_id: string; ad_name: string; roi: number | null }[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
});

const graph = new StateGraph(CrossUtmState)
  .addNode('crossAdsAndLeads', async () => ({ rows: computeCplCac() }))
  .addNode('computeRoi', async (state) => ({ roi: computeRoi(state.rows) }))
  .addEdge(START, 'crossAdsAndLeads')
  .addEdge('crossAdsAndLeads', 'computeRoi')
  .addEdge('computeRoi', END)
  .compile();

async function runCrossUtmGraph(): Promise<{ rows: AdRow[]; roi: { ad_id: string; ad_name: string; roi: number | null }[] }> {
  return graph.invoke({});
}

export { runCrossUtmGraph };
