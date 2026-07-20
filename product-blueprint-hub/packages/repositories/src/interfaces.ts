import type {
  EntityId,
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
} from "@pbh/domain";

// ============================================
// Generic Repository Interface
// ============================================

export interface IRepository<T extends { id: EntityId }> {
  getById(id: EntityId): Promise<T | null>;
  getAll(): Promise<T[]>;
  save(entity: T): Promise<void>;
  delete(id: EntityId): Promise<void>;
}

// ============================================
// Specialized Repository Interfaces
// ============================================

export interface IProjectRepository extends IRepository<Project> {
  getByStatus(status: string): Promise<Project[]>;
  search(query: string): Promise<Project[]>;
}

export interface IDesignProposalRepository extends IRepository<DesignProposal> {
  getByProjectId(projectId: EntityId): Promise<DesignProposal[]>;
  getByLayer(projectId: EntityId, layer: string): Promise<DesignProposal[]>;
}

export interface IDesignGraphRepository extends IRepository<DesignGraph> {
  getByProjectId(projectId: EntityId): Promise<DesignGraph | null>;
}

export interface IDesignBaselineRepository extends IRepository<DesignBaseline> {
  getByProjectId(projectId: EntityId): Promise<DesignBaseline[]>;
  getActive(projectId: EntityId): Promise<DesignBaseline | null>;
}

export interface ISourceRepository extends IRepository<Source> {
  getByProjectId(projectId: EntityId): Promise<Source[]>;
}

export interface IBriefItemRepository extends IRepository<BriefItem> {
  getByProjectId(projectId: EntityId): Promise<BriefItem[]>;
  getByStatus(projectId: EntityId, status: string): Promise<BriefItem[]>;
}

export interface IDecisionRepository extends IRepository<Decision> {
  getByProjectId(projectId: EntityId): Promise<Decision[]>;
}

export interface IChangeRequestRepository extends IRepository<ChangeRequest> {
  getByProjectId(projectId: EntityId): Promise<ChangeRequest[]>;
  getByTargetId(targetId: EntityId): Promise<ChangeRequest[]>;
}

export interface IConflictRepository extends IRepository<Conflict> {
  getByProjectId(projectId: EntityId): Promise<Conflict[]>;
}

export interface IMissionRepository extends IRepository<MissionManifest> {
  getByProjectId(projectId: EntityId): Promise<MissionManifest[]>;
}

export interface ITaskRepository extends IRepository<TaskDefinition> {
  getByMissionId(missionId: EntityId): Promise<TaskDefinition[]>;
}

export interface IRunRepository extends IRepository<Run> {
  getByTaskId(taskId: EntityId): Promise<Run[]>;
  getByMissionId(missionId: EntityId): Promise<Run[]>;
}

export interface IRunEventRepository extends IRepository<RunEvent> {
  getByMissionId(missionId: EntityId): Promise<RunEvent[]>;
  getByTaskId(taskId: EntityId): Promise<RunEvent[]>;
}

export interface IFindingRepository extends IRepository<Finding> {
  getByMissionId(missionId: EntityId): Promise<Finding[]>;
  getBlockingFindings(missionId: EntityId): Promise<Finding[]>;
}

export interface IGateRepository extends IRepository<ValidationGate> {
  getByMissionId(missionId: EntityId): Promise<ValidationGate[]>;
}

export interface IArtifactRepository extends IRepository<Artifact> {
  getByMissionId(missionId: EntityId): Promise<Artifact[]>;
}

export interface IBaselineRepository extends IRepository<Baseline> {
  getByMissionId(missionId: EntityId): Promise<Baseline[]>;
}

export interface IPackageRepository extends IRepository<ExecutionPackage> {
  getByBaselineId(baselineId: EntityId): Promise<ExecutionPackage | null>;
}

export interface IModelUsageRepository extends IRepository<ModelUsage> {
  getByMissionId(missionId: EntityId): Promise<ModelUsage[]>;
  getTotalCost(missionId: EntityId): Promise<number>;
}

export interface IAuditEventRepository extends IRepository<AuditEvent> {
  getByEntityId(entityId: EntityId): Promise<AuditEvent[]>;
}

export interface IUserRepository extends IRepository<User> {
  getByEmail(email: string): Promise<User | null>;
}

// ============================================
// Registry — single access point for all repos
// ============================================

export interface RepositoryRegistry {
  projects: IProjectRepository;
  designProposals: IDesignProposalRepository;
  designGraphs: IDesignGraphRepository;
  designBaselines: IDesignBaselineRepository;
  sources: ISourceRepository;
  briefItems: IBriefItemRepository;
  decisions: IDecisionRepository;
  changeRequests: IChangeRequestRepository;
  conflicts: IConflictRepository;
  missions: IMissionRepository;
  tasks: ITaskRepository;
  runs: IRunRepository;
  runEvents: IRunEventRepository;
  findings: IFindingRepository;
  gates: IGateRepository;
  artifacts: IArtifactRepository;
  baselines: IBaselineRepository;
  packages: IPackageRepository;
  modelUsage: IModelUsageRepository;
  auditEvents: IAuditEventRepository;
  users: IUserRepository;
}
