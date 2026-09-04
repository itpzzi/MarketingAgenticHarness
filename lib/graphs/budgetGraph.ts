// Grafo de Estados determinístico (LangGraph) para identificar a campanha
// com maior orçamento diário — rotina simples, sem necessidade de LLM.
import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { findBudgetLeader } from '../tools';
import type { MetaCampaign } from '../data';

const BudgetState = Annotation.Root({
  leader: Annotation<MetaCampaign | null>({ reducer: (_p, n) => n, default: () => null }),
});

const graph = new StateGraph(BudgetState)
  .addNode('findBudgetLeader', async () => ({ leader: findBudgetLeader() }))
  .addEdge(START, 'findBudgetLeader')
  .addEdge('findBudgetLeader', END)
  .compile();

async function runBudgetGraph() {
  return graph.invoke({});
}

export { runBudgetGraph };
