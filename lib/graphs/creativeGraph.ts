// Grafo de Estados determinístico (LangGraph) para o ranking de criativos.
import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { rankCreativesByScore } from '../tools';

const CreativeState = Annotation.Root({
  ranking: Annotation<any[]>({ reducer: (_p, n) => n, default: () => [] }),
});

const graph = new StateGraph(CreativeState)
  .addNode('rankCreatives', async () => ({ ranking: rankCreativesByScore() }))
  .addEdge(START, 'rankCreatives')
  .addEdge('rankCreatives', END)
  .compile();

async function runCreativeGraph() {
  return graph.invoke({});
}

export { runCreativeGraph };
