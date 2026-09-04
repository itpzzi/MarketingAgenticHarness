// Tipos compartilhados entre os módulos do harness (BFA, roteador, flows, grafos).
export type Paradigm =
  | 'ReAct'
  | 'Grafo de Estados'
  | 'CodeSandbox'
  | 'RLM'
  | 'Sessão & Permissões'
  | 'Coordenação A2A'
  | 'Planejamento (ReAct)';

export type ActivityType = 'routing' | 'resource' | 'tool' | 'reasoning' | 'plan';

export interface TraceEvent {
  paradigm: string;
  label: string;
  detail?: string | null;
  activityType: ActivityType;
  at: string;
  // Anexado sempre que o evento representa o plano (criação ou passo concluído):
  // snapshot completo do plano nesse instante, para a UI renderizar o checklist
  // ao vivo em vez de só no final do turno.
  plan?: PlanStep[];
}

export type PlanStepStatus = 'pending' | 'done';

export interface PlanStep {
  id: string;
  label: string;
  paradigm: Paradigm;
  status: PlanStepStatus;
}

export type BlockType = 'text' | 'table' | 'chart' | 'code' | 'approval_result' | 'plan';

export interface Block {
  type: BlockType;
  // Identidade estável do artefato entre turnos (ex.: 'cpl_cac_table'), usada
  // pela UI para versionar em vez de duplicar cartões de artefato a cada turno.
  key?: string;
  title?: string;
  content?: string;
  columns?: string[];
  rows?: Record<string, unknown>[];
  points?: { label: string; value: number }[];
  language?: string;
  decision?: 'approved' | 'rejected';
  ad_name?: string;
  result?: unknown;
  steps?: PlanStep[];
}

export interface ApprovalRequest {
  type: 'approval';
  tool: string;
  args: Record<string, unknown>;
  description: string;
}

export interface FlowCtx {
  trace: TraceEvent[];
  blocks: Block[];
  onTrace?: ((event: TraceEvent) => void) | null;
  memory?: string;
  plan?: PlanStep[];
}

export interface FlowInput {
  message: string;
  apiKey?: string;
  model?: string;
}

export type FlowGenerator = AsyncGenerator<ApprovalRequest, string, 'approve' | 'reject' | undefined>;

export interface AdRow {
  ad_id: string;
  ad_name: string;
  campaign_name: string;
  status: string;
  spend: number;
  leads: number;
  vendas: number;
  receita: number;
  cpl: number | null;
  cac: number | null;
  motivo?: string;
}

export interface LlmResult {
  text: string | null;
  offline: boolean;
  provider?: string;
  error?: string;
}

export type ModelTier = 'frontier' | 'fast';

export interface SafeLlmArgs {
  apiKey?: string;
  model?: string;
  tier?: ModelTier;
  system: string;
  user: string;
  maxTokens?: number;
}
