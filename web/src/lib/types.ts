// Tipos espelhando lib/types.ts do backend (contrato da API REST/SSE).
export type ActivityType = 'routing' | 'resource' | 'tool' | 'reasoning' | 'plan';

export interface TraceEvent {
  paradigm: string;
  label: string;
  detail?: string | null;
  activityType: ActivityType;
  at: string;
}

export type PlanStepStatus = 'pending' | 'done';

export interface PlanStep {
  id: string;
  label: string;
  paradigm: string;
  status: PlanStepStatus;
}

export type BlockType = 'text' | 'table' | 'chart' | 'code' | 'approval_result' | 'plan';

export interface Block {
  type: BlockType;
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

export interface ChatResult {
  flow: string | null;
  trace: TraceEvent[];
  blocks: Block[];
  message: string | null;
  pendingApproval: ApprovalRequest | null;
  error?: string;
}

export interface Artifact {
  block: Block;
  id: string;
  index: number;
  label: string;
  kind: string;
}

export interface ActivityState {
  status: 'working' | 'complete' | 'pending';
  steps: TraceEvent[];
}

export interface ChatEntry {
  id: string;
  role: 'user' | 'assistant';
  text?: string;
  activity?: ActivityState;
  planBlock?: Block | null;
  resultBlocks?: Block[];
  blocks?: Artifact[];
  pendingApproval?: ApprovalRequest | null;
  resolved?: boolean;
}
