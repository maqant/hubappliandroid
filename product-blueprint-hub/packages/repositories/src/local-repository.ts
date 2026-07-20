import type { EntityId } from "@pbh/domain";
import type {
  IRepository,
  IProjectRepository,
  ISourceRepository,
  IBriefItemRepository,
  IDecisionRepository,
  IChangeRequestRepository,
  IConflictRepository,
  IMissionRepository,
  ITaskRepository,
  IRunRepository,
  IRunEventRepository,
  IFindingRepository,
  IGateRepository,
  IArtifactRepository,
  IBaselineRepository,
  IPackageRepository,
  IModelUsageRepository,
  IAuditEventRepository,
  IUserRepository,
  IDesignProposalRepository,
  IDesignGraphRepository,
  IDesignBaselineRepository,
  IPromptRepository,
  RepositoryRegistry,
} from "./interfaces";
import type {
  Project,
  Source,
  BriefItem,
  Decision,
  ChangeRequest,
  Conflict,
  MissionManifest,
  TaskDefinition,
  Run,
  RunEvent,
  Finding,
  ValidationGate,
  Artifact,
  Baseline,
  ExecutionPackage,
  ModelUsage,
  AuditEvent,
  User,
  DesignProposal,
  DesignGraph,
  DesignBaseline,
  PromptTemplate,
} from "@pbh/domain";

// ============================================
// Schema version for local storage migrations
// ============================================

const SCHEMA_VERSION = 1;
const STORAGE_PREFIX = "pbh_v" + SCHEMA_VERSION + "_";

// ============================================
// Generic LocalStorage-backed repository
// ============================================

class LocalRepo<T extends { id: EntityId }> implements IRepository<T> {
  constructor(protected readonly storageKey: string) {}

  protected getStore(): Map<string, T> {
    if (typeof window === "undefined") return new Map();
    const raw = localStorage.getItem(STORAGE_PREFIX + this.storageKey);
    if (!raw) return new Map();
    try {
      const entries: [string, T][] = JSON.parse(raw);
      return new Map(entries);
    } catch {
      return new Map();
    }
  }

  protected setStore(store: Map<string, T>): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(
      STORAGE_PREFIX + this.storageKey,
      JSON.stringify(Array.from(store.entries())),
    );
  }

  async getById(id: EntityId): Promise<T | null> {
    return this.getStore().get(id) ?? null;
  }

  async getAll(): Promise<T[]> {
    return Array.from(this.getStore().values());
  }

  async save(entity: T): Promise<void> {
    const store = this.getStore();
    store.set(entity.id, entity);
    this.setStore(store);
  }

  async delete(id: EntityId): Promise<void> {
    const store = this.getStore();
    store.delete(id);
    this.setStore(store);
  }

  protected async filter(predicate: (item: T) => boolean): Promise<T[]> {
    return Array.from(this.getStore().values()).filter(predicate);
  }
}

// ============================================
// Specialized repositories
// ============================================

class LocalProjectRepository extends LocalRepo<Project> implements IProjectRepository {
  constructor() {
    super("projects");
  }
  async getByStatus(status: string): Promise<Project[]> {
    return this.filter((p) => p.status === status);
  }
  async search(query: string): Promise<Project[]> {
    const q = query.toLowerCase();
    return this.filter(
      (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q),
    );
  }
}

class LocalSourceRepository extends LocalRepo<Source> implements ISourceRepository {
  constructor() {
    super("sources");
  }
  async getByProjectId(projectId: EntityId): Promise<Source[]> {
    return this.filter((s) => s.projectId === projectId);
  }
}

class LocalBriefItemRepository extends LocalRepo<BriefItem> implements IBriefItemRepository {
  constructor() {
    super("briefItems");
  }
  async getByProjectId(projectId: EntityId): Promise<BriefItem[]> {
    return this.filter((b) => b.projectId === projectId);
  }
  async getByStatus(projectId: EntityId, status: string): Promise<BriefItem[]> {
    return this.filter((b) => b.projectId === projectId && b.status === status);
  }
}

class LocalDecisionRepository extends LocalRepo<Decision> implements IDecisionRepository {
  constructor() {
    super("decisions");
  }
  async getByProjectId(projectId: EntityId): Promise<Decision[]> {
    return this.filter((d) => d.projectId === projectId);
  }
}

class LocalChangeRequestRepository
  extends LocalRepo<ChangeRequest>
  implements IChangeRequestRepository
{
  constructor() {
    super("changeRequests");
  }
  async getByProjectId(projectId: EntityId): Promise<ChangeRequest[]> {
    return this.filter((cr) => cr.projectId === projectId);
  }
  async getByTargetId(targetId: EntityId): Promise<ChangeRequest[]> {
    return this.filter((cr) => cr.targetId === targetId);
  }
}

class LocalConflictRepository extends LocalRepo<Conflict> implements IConflictRepository {
  constructor() {
    super("conflicts");
  }
  async getByProjectId(projectId: EntityId): Promise<Conflict[]> {
    return this.filter((c) => c.projectId === projectId);
  }
}

class LocalMissionRepository extends LocalRepo<MissionManifest> implements IMissionRepository {
  constructor() {
    super("missions");
  }
  async getByProjectId(projectId: EntityId): Promise<MissionManifest[]> {
    return this.filter((m) => m.projectId === projectId);
  }
}

class LocalTaskRepository extends LocalRepo<TaskDefinition> implements ITaskRepository {
  constructor() {
    super("tasks");
  }
  async getByMissionId(missionId: EntityId): Promise<TaskDefinition[]> {
    return this.filter((t) => t.missionId === missionId);
  }
}

class LocalRunRepository extends LocalRepo<Run> implements IRunRepository {
  constructor() {
    super("runs");
  }
  async getByTaskId(taskId: EntityId): Promise<Run[]> {
    return this.filter((r) => r.taskId === taskId);
  }
  async getByMissionId(missionId: EntityId): Promise<Run[]> {
    return this.filter((r) => r.missionId === missionId);
  }
}

class LocalRunEventRepository extends LocalRepo<RunEvent> implements IRunEventRepository {
  constructor() {
    super("runEvents");
  }
  async getByMissionId(missionId: EntityId): Promise<RunEvent[]> {
    return this.filter((e) => e.missionId === missionId);
  }
  async getByTaskId(taskId: EntityId): Promise<RunEvent[]> {
    return this.filter((e) => e.taskId === taskId);
  }
}

class LocalFindingRepository extends LocalRepo<Finding> implements IFindingRepository {
  constructor() {
    super("findings");
  }
  async getByMissionId(missionId: EntityId): Promise<Finding[]> {
    return this.filter((f) => f.missionId === missionId);
  }
  async getBlockingFindings(missionId: EntityId): Promise<Finding[]> {
    return this.filter((f) => f.missionId === missionId && f.severity === "BLOCKING");
  }
}

class LocalGateRepository extends LocalRepo<ValidationGate> implements IGateRepository {
  constructor() {
    super("gates");
  }
  async getByMissionId(missionId: EntityId): Promise<ValidationGate[]> {
    return this.filter((g) => g.missionId === missionId);
  }
}

class LocalArtifactRepository extends LocalRepo<Artifact> implements IArtifactRepository {
  constructor() {
    super("artifacts");
  }
  async getByMissionId(missionId: EntityId): Promise<Artifact[]> {
    return this.filter((a) => a.missionId === missionId);
  }
}

class LocalBaselineRepository extends LocalRepo<Baseline> implements IBaselineRepository {
  constructor() {
    super("baselines");
  }
  async getByMissionId(missionId: EntityId): Promise<Baseline[]> {
    return this.filter((b) => b.missionId === missionId);
  }
}

class LocalPackageRepository extends LocalRepo<ExecutionPackage> implements IPackageRepository {
  constructor() {
    super("packages");
  }
  async getByBaselineId(baselineId: EntityId): Promise<ExecutionPackage | null> {
    const all = await this.filter((p) => p.baselineId === baselineId);
    return all[0] ?? null;
  }
}

class LocalModelUsageRepository extends LocalRepo<ModelUsage> implements IModelUsageRepository {
  constructor() {
    super("modelUsage");
  }
  async getByMissionId(missionId: EntityId): Promise<ModelUsage[]> {
    return this.filter((u) => u.missionId === missionId);
  }
  async getTotalCost(missionId: EntityId): Promise<number> {
    const usages = await this.getByMissionId(missionId);
    return usages.reduce((sum, u) => sum + u.cost, 0);
  }
}

class LocalAuditEventRepository extends LocalRepo<AuditEvent> implements IAuditEventRepository {
  constructor() {
    super("auditEvents");
  }
  async getByEntityId(entityId: EntityId): Promise<AuditEvent[]> {
    return this.filter((e) => e.entityId === entityId);
  }
}

class LocalUserRepository extends LocalRepo<User> implements IUserRepository {
  constructor() {
    super("users");
  }
  async getByEmail(email: string): Promise<User | null> {
    const all = await this.filter((u) => u.email === email);
    return all[0] ?? null;
  }
}

class LocalDesignProposalRepository extends LocalRepo<DesignProposal> implements IDesignProposalRepository {
  constructor() {
    super(STORAGE_PREFIX + "design_proposals");
  }

  async getByProjectId(projectId: EntityId): Promise<DesignProposal[]> {
    return this.filter((p) => p.projectId === projectId);
  }

  async getByLayer(projectId: EntityId, layer: string): Promise<DesignProposal[]> {
    return this.filter((p) => p.projectId === projectId && p.layer === layer);
  }
}

class LocalDesignGraphRepository extends LocalRepo<DesignGraph> implements IDesignGraphRepository {
  constructor() {
    super(STORAGE_PREFIX + "design_graphs");
  }

  async getByProjectId(projectId: EntityId): Promise<DesignGraph | null> {
    const all = await this.filter((g) => g.projectId === projectId);
    return all[0] ?? null;
  }
}

class LocalDesignBaselineRepository extends LocalRepo<DesignBaseline> implements IDesignBaselineRepository {
  constructor() {
    super(STORAGE_PREFIX + "design_baselines");
  }

  async getByProjectId(projectId: EntityId): Promise<DesignBaseline[]> {
    return this.filter((b) => b.projectId === projectId);
  }

  async getActive(projectId: EntityId): Promise<DesignBaseline | null> {
    const all = await this.filter((b) => b.projectId === projectId && b.status === "ACTIVE");
    return all[0] ?? null;
  }
}

class LocalPromptRepository extends LocalRepo<PromptTemplate> implements IPromptRepository {
  constructor() {
    super(STORAGE_PREFIX + "prompts");
  }

  async getByAgentId(agentId: string): Promise<PromptTemplate[]> {
    return this.filter((p) => p.agentId === agentId);
  }

  async getByPromptIdAndVersion(promptId: string, version: number): Promise<PromptTemplate | null> {
    const all = await this.filter((p) => p.promptId === promptId && p.version === version);
    return all[0] ?? null;
  }

  async getActivePrompt(agentId: string): Promise<PromptTemplate | null> {
    // Retours le prompt actif avec la plus haute version
    const all = await this.filter((p) => p.agentId === agentId && p.enabled);
    if (all.length === 0) return null;
    all.sort((a, b) => b.version - a.version);
    return all[0];
  }
}

// ============================================
// Registry factory
// ============================================

export function createLocalRepositoryRegistry(): RepositoryRegistry {
  return {
    projects: new LocalProjectRepository(),
    designProposals: new LocalDesignProposalRepository(),
    designGraphs: new LocalDesignGraphRepository(),
    designBaselines: new LocalDesignBaselineRepository(),
    sources: new LocalSourceRepository(),
    briefItems: new LocalBriefItemRepository(),
    decisions: new LocalDecisionRepository(),
    changeRequests: new LocalChangeRequestRepository(),
    conflicts: new LocalConflictRepository(),
    missions: new LocalMissionRepository(),
    tasks: new LocalTaskRepository(),
    runs: new LocalRunRepository(),
    runEvents: new LocalRunEventRepository(),
    findings: new LocalFindingRepository(),
    gates: new LocalGateRepository(),
    artifacts: new LocalArtifactRepository(),
    baselines: new LocalBaselineRepository(),
    packages: new LocalPackageRepository(),
    modelUsage: new LocalModelUsageRepository(),
    auditEvents: new LocalAuditEventRepository(),
    users: new LocalUserRepository(),
    prompts: new LocalPromptRepository(),
  };
}

export { SCHEMA_VERSION, STORAGE_PREFIX };
