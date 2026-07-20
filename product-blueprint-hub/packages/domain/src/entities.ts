// ============================================
// Domain Types — Shared primitives
// ============================================

/** Branded type for unique identifiers */
export type EntityId = string & { readonly __brand: unique symbol };

export function createId(): EntityId {
  return crypto.randomUUID() as EntityId;
}

export interface Timestamped {
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Versioned {
  readonly version: number;
}

export interface Owned {
  readonly projectId: EntityId;
}

export interface BaseEntity extends Timestamped, Versioned {
  readonly id: EntityId;
}

// ============================================
export type TargetPlatform = 'MOBILE_IOS' | 'MOBILE_ANDROID' | 'WEB_APP' | 'WEB_RESPONSIVE' | 'WEB_NEXTJS' | 'ANDROID_EXPO';

export type ProjectStatus = "DRAFT" | "ACTIVE" | "ARCHIVED" | "DELETED";

export interface Project extends BaseEntity {
  readonly name: string;
  readonly description: string;
  readonly status: ProjectStatus;
  readonly ideaText: string;
  readonly targetPlatforms: TargetPlatform[];
  readonly designStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'VALIDATED';
  readonly activeBaselineId?: EntityId | null;
}

export function createProject(params: {
  name: string;
  description?: string;
  ideaText?: string;
  targetPlatforms: TargetPlatform[];
}): Project {
  const now = new Date().toISOString();
  return {
    id: createId(),
    name: params.name,
    description: params.description ?? "",
    ideaText: params.ideaText ?? "",
    targetPlatforms: params.targetPlatforms,
    status: "DRAFT",
    designStatus: 'NOT_STARTED',
    activeBaselineId: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

// ============================================
// Source
// ============================================

export type SourceType = "TEXT" | "FILE_TXT" | "FILE_MD" | "CONVERSATION";

export interface Source extends BaseEntity, Owned {
  readonly type: SourceType;
  readonly label: string;
  readonly content: string;
  readonly segments: SourceSegment[];
}

export interface SourceSegment {
  readonly id: EntityId;
  readonly sourceId: EntityId;
  readonly index: number;
  readonly content: string;
  readonly startOffset: number;
  readonly endOffset: number;
}

export function createSource(params: {
  projectId: EntityId;
  type: SourceType;
  label: string;
  content: string;
}): Source {
  const now = new Date().toISOString();
  const segments = segmentContent(params.content, createId());
  return {
    id: segments.length > 0 ? (segments[0]!.sourceId as unknown as EntityId) : createId(),
    projectId: params.projectId,
    type: params.type,
    label: params.label,
    content: params.content,
    segments,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

function segmentContent(content: string, sourceId: EntityId): SourceSegment[] {
  const paragraphs = content.split(/\n\n+/).filter((p) => p.trim().length > 0);
  let offset = 0;
  return paragraphs.map((p, i) => {
    const start = content.indexOf(p, offset);
    const seg: SourceSegment = {
      id: createId(),
      sourceId,
      index: i,
      content: p.trim(),
      startOffset: start,
      endOffset: start + p.length,
    };
    offset = start + p.length;
    return seg;
  });
}

// ============================================
// BriefItem
// ============================================

export type BriefItemType =
  | "VISION"
  | "OBJECTIVE"
  | "USER_NEED"
  | "DECISION"
  | "SUGGESTION"
  | "ASSUMPTION"
  | "CONSTRAINT"
  | "RISK"
  | "QUESTION"
  | "EXAMPLE"
  | "REJECTION"
  | "CORRECTION"
  | "SUPERSESSION"
  | "OUT_OF_SCOPE";

export type BriefItemStatus = "PROPOSED" | "ACCEPTED" | "CORRECTED" | "REJECTED" | "LOCKED";

export interface BriefItem extends BaseEntity, Owned {
  readonly type: BriefItemType;
  readonly statement: string;
  readonly status: BriefItemStatus;
  readonly sourceId: EntityId;
  readonly sourceSegmentId: EntityId;
  readonly excerpt: string;
  readonly confidence: number;
  readonly replaces: EntityId | null;
  readonly replacedBy: EntityId | null;
  readonly requiresUserReview: boolean;
  readonly previousVersions: BriefItemVersion[];
}

export interface BriefItemVersion {
  readonly version: number;
  readonly statement: string;
  readonly status: BriefItemStatus;
  readonly updatedAt: string;
}

export function createBriefItem(params: {
  projectId: EntityId;
  type: BriefItemType;
  statement: string;
  sourceId: EntityId;
  sourceSegmentId: EntityId;
  excerpt: string;
  confidence: number;
}): BriefItem {
  const now = new Date().toISOString();
  return {
    id: createId(),
    projectId: params.projectId,
    type: params.type,
    statement: params.statement,
    status: "PROPOSED",
    sourceId: params.sourceId,
    sourceSegmentId: params.sourceSegmentId,
    excerpt: params.excerpt,
    confidence: Math.max(0, Math.min(1, params.confidence)),
    replaces: null,
    replacedBy: null,
    requiresUserReview: true,
    previousVersions: [],
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

/** Transition: accept a proposed item */
export function acceptBriefItem(item: BriefItem): BriefItem {
  if (item.status === "LOCKED") {
    throw new Error("Cannot modify a LOCKED BriefItem without a Change Request");
  }
  if (item.status === "ACCEPTED") {
    return item;
  }
  return {
    ...item,
    status: "ACCEPTED",
    requiresUserReview: false,
    version: item.version + 1,
    updatedAt: new Date().toISOString(),
    previousVersions: [
      ...item.previousVersions,
      {
        version: item.version,
        statement: item.statement,
        status: item.status,
        updatedAt: item.updatedAt,
      },
    ],
  };
}

/** Transition: correct a brief item (preserves old version) */
export function correctBriefItem(item: BriefItem, newStatement: string): BriefItem {
  if (item.status === "LOCKED") {
    throw new Error("Cannot modify a LOCKED BriefItem without a Change Request");
  }
  if (item.statement.trim() === newStatement.trim()) {
    throw new Error("Aucune modification à enregistrer");
  }
  return {
    ...item,
    statement: newStatement,
    status: "CORRECTED",
    requiresUserReview: false,
    version: item.version + 1,
    updatedAt: new Date().toISOString(),
    previousVersions: [
      ...item.previousVersions,
      {
        version: item.version,
        statement: item.statement,
        status: item.status,
        updatedAt: item.updatedAt,
      },
    ],
  };
}

/** Transition: reject a brief item */
export function rejectBriefItem(item: BriefItem): BriefItem {
  if (item.status === "LOCKED") {
    throw new Error("Cannot modify a LOCKED BriefItem without a Change Request");
  }
  if (item.status === "REJECTED") {
    return item;
  }
  return {
    ...item,
    status: "REJECTED",
    requiresUserReview: false,
    version: item.version + 1,
    updatedAt: new Date().toISOString(),
    previousVersions: [
      ...item.previousVersions,
      {
        version: item.version,
        statement: item.statement,
        status: item.status,
        updatedAt: item.updatedAt,
      },
    ],
  };
}

/** Transition: lock a brief item (immutable without Change Request) */
export function lockBriefItem(item: BriefItem): BriefItem {
  if (item.status === "LOCKED") {
    return item;
  }
  if (item.status !== "ACCEPTED" && item.status !== "CORRECTED") {
    throw new Error("Only ACCEPTED or CORRECTED items can be LOCKED");
  }
  return {
    ...item,
    status: "LOCKED",
    version: item.version + 1,
    updatedAt: new Date().toISOString(),
    previousVersions: [
      ...item.previousVersions,
      {
        version: item.version,
        statement: item.statement,
        status: item.status,
        updatedAt: item.updatedAt,
      },
    ],
  };
}

// ============================================
// Decision
// ============================================

export type DecisionStatus = "DRAFT" | "ACCEPTED" | "LOCKED";

export interface Decision extends BaseEntity, Owned {
  readonly title: string;
  readonly statement: string;
  readonly status: DecisionStatus;
  readonly rationale: string;
  readonly relatedBriefItemIds: EntityId[];
  readonly relatedConflictId: EntityId | null;
  readonly sourceBriefItemId?: EntityId | null;
  readonly sourceId?: EntityId | null;
  readonly sourceExcerpt?: string;
  readonly createdByAgentId?: string;
  readonly affectedArtifacts?: string[];
  readonly previousVersions: DecisionVersion[];
}

export interface DecisionVersion {
  readonly version: number;
  readonly statement: string;
  readonly status: DecisionStatus;
  readonly updatedAt: string;
  readonly sourceBriefItemId?: EntityId | null;
  readonly sourceId?: EntityId | null;
  readonly sourceExcerpt?: string;
  readonly createdByAgentId?: string;
  readonly affectedArtifacts?: string[];
}

export function createDecision(params: {
  projectId: EntityId;
  title: string;
  statement: string;
  rationale: string;
  relatedBriefItemIds?: EntityId[];
  relatedConflictId?: EntityId | null;
  sourceBriefItemId?: EntityId | null;
  sourceId?: EntityId | null;
  sourceExcerpt?: string;
  createdByAgentId?: string;
  affectedArtifacts?: string[];
}): Decision {
  const now = new Date().toISOString();
  return {
    id: createId(),
    projectId: params.projectId,
    title: params.title,
    statement: params.statement,
    status: "DRAFT",
    rationale: params.rationale,
    relatedBriefItemIds: params.relatedBriefItemIds ?? [],
    relatedConflictId: params.relatedConflictId ?? null,
    sourceBriefItemId: params.sourceBriefItemId ?? null,
    sourceId: params.sourceId ?? null,
    sourceExcerpt: params.sourceExcerpt ?? "",
    createdByAgentId: params.createdByAgentId ?? "SYSTEM",
    affectedArtifacts: params.affectedArtifacts ?? [],
    previousVersions: [],
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

export function acceptDecision(d: Decision): Decision {
  if (d.status === "LOCKED") {
    throw new Error("Cannot modify a LOCKED Decision without a Change Request");
  }
  return {
    ...d,
    status: "ACCEPTED",
    version: d.version + 1,
    updatedAt: new Date().toISOString(),
    previousVersions: [
      ...d.previousVersions,
      { version: d.version, statement: d.statement, status: d.status, updatedAt: d.updatedAt },
    ],
  };
}

export function lockDecision(d: Decision): Decision {
  if (d.status !== "ACCEPTED") {
    throw new Error("Only ACCEPTED decisions can be LOCKED");
  }
  return {
    ...d,
    status: "LOCKED",
    version: d.version + 1,
    updatedAt: new Date().toISOString(),
    previousVersions: [
      ...d.previousVersions,
      { version: d.version, statement: d.statement, status: d.status, updatedAt: d.updatedAt },
    ],
  };
}

// ============================================
// ChangeRequest
// ============================================

export type ChangeRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface ChangeRequest extends BaseEntity, Owned {
  readonly targetType: "BriefItem" | "Decision";
  readonly targetId: EntityId;
  readonly reason: string;
  readonly proposedChange: string;
  readonly status: ChangeRequestStatus;
  readonly reviewedAt: string | null;
}

export function createChangeRequest(params: {
  projectId: EntityId;
  targetType: "BriefItem" | "Decision";
  targetId: EntityId;
  reason: string;
  proposedChange: string;
}): ChangeRequest {
  const now = new Date().toISOString();
  return {
    id: createId(),
    projectId: params.projectId,
    targetType: params.targetType,
    targetId: params.targetId,
    reason: params.reason,
    proposedChange: params.proposedChange,
    status: "PENDING",
    reviewedAt: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

// ============================================
// Conflict
// ============================================

export type ConflictStatus = "DETECTED" | "RESOLVED" | "DISMISSED";

export interface ConflictOption {
  readonly id: EntityId;
  readonly label: string;
  readonly description: string;
  readonly impact: string;
}

export interface Conflict extends BaseEntity, Owned {
  readonly title: string;
  readonly description: string;
  readonly status: ConflictStatus;
  readonly sourceItemIds: EntityId[];
  readonly options: ConflictOption[];
  readonly chosenOptionId: EntityId | null;
  readonly resolutionDecisionId: EntityId | null;
}

export function createConflict(params: {
  projectId: EntityId;
  title: string;
  description: string;
  sourceItemIds: EntityId[];
  options: ConflictOption[];
}): Conflict {
  const now = new Date().toISOString();
  return {
    id: createId(),
    projectId: params.projectId,
    title: params.title,
    description: params.description,
    status: "DETECTED",
    sourceItemIds: params.sourceItemIds,
    options: params.options,
    chosenOptionId: null,
    resolutionDecisionId: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

export function resolveConflict(
  conflict: Conflict,
  chosenOptionId: EntityId,
  decisionId: EntityId,
): Conflict {
  return {
    ...conflict,
    status: "RESOLVED",
    chosenOptionId,
    resolutionDecisionId: decisionId,
    version: conflict.version + 1,
    updatedAt: new Date().toISOString(),
  };
}

// ============================================
// Mission & Agents
// ============================================

export type AgentType = "FIXED" | "DYNAMIC";

export interface AgentDefinition extends BaseEntity {
  readonly agentId: string;
  readonly name: string;
  readonly type: AgentType;
  readonly removable: boolean;
  readonly purpose: string;
  readonly failureMode: string;
}

export type ModelTier = "LUNA" | "TERRA" | "SOL";

export type TaskStatus =
  "PENDING" | "READY" | "RUNNING" | "BLOCKED" | "FAILED" | "COMPLETED" | "CANCELLED" | "NOT_RUN";

export interface TaskDefinition extends BaseEntity, Owned {
  readonly missionId: EntityId;
  readonly agentId: string;
  readonly name: string;
  readonly description: string;
  readonly status: TaskStatus;
  readonly dependencies: EntityId[];
  readonly parallelGroup: string | null;
  readonly modelTier: ModelTier;
  readonly maxIterations: number;
  readonly budgetTokens: number;
  readonly outputs: TaskOutput[];
  readonly checkpointData: string | null;
}

export interface TaskOutput {
  readonly id: EntityId;
  readonly type: string;
  readonly content: string;
  readonly createdAt: string;
}

export type MissionStatus = "DRAFT" | "PLANNED" | "RUNNING" | "PAUSED" | "COMPLETED" | "FAILED" | "PARTIAL_FAILURE";

export interface MissionManifest extends BaseEntity, Owned {
  readonly name: string;
  readonly status: MissionStatus;
  readonly agents: AgentDefinition[];
  readonly tasks: TaskDefinition[];
  readonly totalBudgetTokens: number;
  readonly usedBudgetTokens: number;
  readonly totalCalls: number;
  readonly risks: string[];
  readonly assumptions: string[];
  readonly gates: string[];
}

// ============================================
// Run & Events
// ============================================

export type RunStatus = "STARTED" | "COMPLETED" | "FAILED" | "RETRIED";

export interface Run extends BaseEntity {
  readonly taskId: EntityId;
  readonly missionId: EntityId;
  readonly status: RunStatus;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly tokensUsed: number;
  readonly modelTier: ModelTier;
  readonly error: string | null;
  readonly diagnostic?: Record<string, unknown> | null;
}

export type RunEventType =
  | "TASK_STARTED"
  | "TASK_COMPLETED"
  | "TASK_FAILED"
  | "TASK_RETRIED"
  | "CHECKPOINT_SAVED"
  | "GATE_CHECKED"
  | "CONFLICT_DETECTED"
  | "BUDGET_WARNING"
  | "MODEL_CALLED"
  | "ARTIFACT_PRODUCED";

export interface RunEvent extends BaseEntity {
  readonly missionId: EntityId;
  readonly taskId: EntityId | null;
  readonly runId: EntityId | null;
  readonly type: RunEventType;
  readonly message: string;
  readonly data: Record<string, unknown>;
}

// ============================================
// Finding & Evidence (Audits)
// ============================================

export type FindingSeverity = "INFO" | "WARNING" | "BLOCKING";

export interface Finding extends BaseEntity, Owned {
  readonly missionId: EntityId;
  readonly auditType: string;
  readonly title: string;
  readonly description: string;
  readonly severity: FindingSeverity;
  readonly proof: string;
  readonly impact: string;
  readonly correction: string;
  readonly allowedToProceed: boolean;
}

export interface Evidence extends BaseEntity, Owned {
  readonly findingId: EntityId;
  readonly type: string;
  readonly content: string;
}

// ============================================
// Assumptions & Risks
// ============================================

export type AssumptionStatus = "ACTIVE" | "VALIDATED" | "INVALIDATED";

export interface Assumption extends BaseEntity, Owned {
  readonly statement: string;
  readonly status: AssumptionStatus;
  readonly validatedBy: EntityId | null;
}

export type RiskSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type RiskStatus = "IDENTIFIED" | "MITIGATED" | "ACCEPTED" | "OCCURRED";

export interface Risk extends BaseEntity, Owned {
  readonly title: string;
  readonly description: string;
  readonly severity: RiskSeverity;
  readonly status: RiskStatus;
  readonly mitigation: string;
}

// ============================================
// Validation Gate
// ============================================

export type GateStatus = "PENDING" | "PASSED" | "FAILED" | "BLOCKED";

export interface ValidationGate extends BaseEntity, Owned {
  readonly missionId: EntityId;
  readonly name: string;
  readonly status: GateStatus;
  readonly blocking: boolean;
  readonly passCondition: string;
  readonly findings: EntityId[];
  readonly checkedAt: string | null;
}

// ============================================
// Review
// ============================================

export type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED" | "NEEDS_CHANGES";

export interface Review extends BaseEntity, Owned {
  readonly targetType: string;
  readonly targetId: EntityId;
  readonly status: ReviewStatus;
  readonly comments: string;
  readonly reviewedAt: string | null;
}

// ============================================
// Model Policy & Usage
// ============================================

export interface ModelPolicy extends BaseEntity {
  readonly tier: ModelTier;
  readonly modelId: string;
  readonly maxTokensPerCall: number;
  readonly maxCallsPerTask: number;
  readonly budgetLimit: number;
}

export interface ModelUsage extends BaseEntity {
  readonly missionId: EntityId;
  readonly taskId: EntityId;
  readonly runId: EntityId;
  readonly tier: ModelTier;
  readonly modelId: string;
  readonly tokensUsed: number;
  readonly cost: number;
  readonly correlationId: string;
}

// ============================================
// Artifact (Blueprint sections)
// ============================================

export type ArtifactStatus = "DRAFT" | "REVIEW" | "PUBLISHED";

export type BlueprintSection =
  | "PRODUCT_VISION"
  | "USERS_NEEDS"
  | "MVP_SCOPE"
  | "USER_JOURNEYS"
  | "SCREEN_MAP"
  | "DESIGN_SYSTEM"
  | "FUNCTIONAL_RULES"
  | "DATA_MODEL"
  | "ARCHITECTURE"
  | "API_CONTRACTS"
  | "AI_ARCHITECTURE"
  | "SECURITY_PRIVACY"
  | "DEPLOYMENT"
  | "BACKLOG"
  | "TEST_PLAN"
  | "DECISION_REGISTER"
  | "TRACEABILITY_MATRIX";

export interface Artifact extends BaseEntity, Owned {
  readonly missionId: EntityId;
  readonly section: BlueprintSection;
  readonly title: string;
  readonly content: string;
  readonly status: ArtifactStatus;
  readonly agentId: string;
}

// ============================================
// Baseline
// ============================================

export type BaselineStatus = "FROZEN" | "SUPERSEDED";

export interface Baseline extends BaseEntity, Owned {
  readonly missionId: EntityId;
  readonly name: string;
  readonly status: BaselineStatus;
  readonly frozenAt: string;
  readonly gateIds: EntityId[];
  readonly artifactIds: EntityId[];
  readonly snapshot: Record<string, unknown>;
}

// ============================================
// ExecutionPackage
// ============================================

export type PackageStatus = "GENERATING" | "READY" | "FAILED";

export interface PackageFile {
  readonly filename: string;
  readonly content: string;
  readonly sizeBytes: number;
}

export interface ExecutionPackage extends BaseEntity, Owned {
  readonly baselineId: EntityId;
  readonly missionId: EntityId;
  readonly status: PackageStatus;
  readonly files: PackageFile[];
  readonly masterConsolidated: string;
  readonly manifest: Record<string, unknown>;
  readonly generatedAt: string;
}

// ============================================
// AuditEvent
// ============================================

export interface AuditEvent extends BaseEntity {
  readonly entityType: string;
  readonly entityId: EntityId;
  readonly action: string;
  readonly details: string;
  readonly performedBy: string;
}

// ============================================
// User & Organization (simplified for local mode)
// ============================================

export interface User extends BaseEntity {
  readonly displayName: string;
  readonly email: string;
  readonly isDemo: boolean;
}

export interface Organization extends BaseEntity {
  readonly name: string;
}

export interface Membership extends BaseEntity {
  readonly userId: EntityId;
  readonly organizationId: EntityId;
  readonly role: string;
}

export function createDemoUser(): User {
  const now = new Date().toISOString();
  return {
    id: "demo-user-001" as EntityId,
    displayName: "Demo User",
    email: "demo@blueprint-hub.local",
    isDemo: true,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}
