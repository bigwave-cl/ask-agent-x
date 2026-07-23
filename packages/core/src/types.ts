export type DetectionStatus = 'ok' | 'warning' | 'blocked'

export interface DetectionIssue {
  code: string
  message: string
  path?: string
}

export interface DetectionReport<T = unknown> {
  moduleId: string
  status: DetectionStatus
  observedAt: string
  fingerprint: string
  issues: DetectionIssue[]
  data: T
}

export interface ModuleContext {
  homeDir: string
  dataDir: string
}

export interface FileOperation {
  kind: 'create' | 'copy' | 'link' | 'remove' | 'replace'
  source?: string
  target: string
}

export interface ActionPlan<T = unknown> {
  id: string
  moduleId: string
  action: string
  createdAt: string
  detectionFingerprint: string
  operations: FileOperation[]
  input: T
  hash: string
}

export interface UserConsent {
  planHash: string
  confirmedAt: string
}

export interface ActionReceipt {
  id: string
  planHash: string
  moduleId: string
  action: string
  appliedAt: string
  contentHash?: string
}

export interface RollbackResult {
  receiptId: string
  rolledBack: boolean
  restoredPaths: string[]
  warnings: string[]
}

export interface AskXModule {
  id: string
  name: string
  detect(context: ModuleContext): Promise<DetectionReport>
  plan(action: string, input: unknown): Promise<ActionPlan>
  apply(plan: ActionPlan, consent: UserConsent): Promise<ActionReceipt>
  rollback(receipt: ActionReceipt): Promise<RollbackResult>
}

