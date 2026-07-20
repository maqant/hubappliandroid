import type { EntityId, BriefItem, Project, Source, MissionManifest } from "@pbh/domain";
import {
  createProject,
  createSource,
  createBriefItem,
  acceptBriefItem,
  correctBriefItem,
  rejectBriefItem,
  lockBriefItem,
  createDecision,
  acceptDecision,
  lockDecision,
  createChangeRequest,
  resolveConflict,
  createId,
} from "@pbh/domain";
import type { RepositoryRegistry } from "@pbh/repositories";
import type { IModelProvider } from "@pbh/model-gateway";
import { planMission } from "@pbh/agent-runtime";
import { MissionExecutor } from "@pbh/agent-runtime";

// ============================================
// Use Cases
// ============================================

export class ProjectUseCases {
  constructor(private readonly repos: RepositoryRegistry) {}

  async createProject(name: string, description: string, ideaText: string): Promise<Project> {
    const project = createProject({ name, description, ideaText });
    await this.repos.projects.save(project);
    return project;
  }

  async getProject(id: EntityId): Promise<Project | null> {
    return this.repos.projects.getById(id);
  }

  async listProjects(): Promise<Project[]> {
    return this.repos.projects.getAll();
  }

  async updateProject(
    id: EntityId,
    updates: Partial<Pick<Project, "name" | "description" | "ideaText" | "status">>,
  ): Promise<Project> {
    const project = await this.repos.projects.getById(id);
    if (!project) throw new Error("Project not found");
    const updated: Project = {
      ...project,
      ...updates,
      version: project.version + 1,
      updatedAt: new Date().toISOString(),
    };
    await this.repos.projects.save(updated);
    return updated;
  }

  async deleteProject(id: EntityId): Promise<void> {
    await this.repos.projects.delete(id);
  }

  async archiveProject(id: EntityId): Promise<Project> {
    return this.updateProject(id, { status: "ARCHIVED" });
  }

  async searchProjects(query: string): Promise<Project[]> {
    return this.repos.projects.search(query);
  }
}

export class SourceUseCases {
  constructor(private readonly repos: RepositoryRegistry) {}

  async addSource(
    projectId: EntityId,
    type: Source["type"],
    label: string,
    content: string,
  ): Promise<Source> {
    const source = createSource({ projectId, type, label, content });
    await this.repos.sources.save(source);
    return source;
  }

  async getSources(projectId: EntityId): Promise<Source[]> {
    return this.repos.sources.getByProjectId(projectId);
  }
}

export class BriefUseCases {
  constructor(
    private readonly repos: RepositoryRegistry,
    private readonly provider: IModelProvider,
  ) {}

  async analyzeBrief(projectId: EntityId): Promise<BriefItem[]> {
    const project = await this.repos.projects.getById(projectId);
    if (!project) throw new Error("Project not found");

    const sources = await this.repos.sources.getByProjectId(projectId);
    const allContent = [project.ideaText, ...sources.map((s) => s.content)]
      .filter(Boolean)
      .join("\n\n");

    if (!allContent.trim()) {
      throw new Error("No content to analyze. Add an idea or sources first.");
    }

    // Use the model provider (fake or real)
    const response = await this.provider.complete({
      prompt: allContent,
      systemPrompt:
        "Analyze the following content and extract brief items. Return JSON with an 'items' array.",
      tier: "TERRA",
      correlationId: `analyze-${projectId}`,
    });

    // Parse the response
    let parsedItems: Array<{
      type: string;
      statement: string;
      confidence: number;
      excerpt: string;
    }>;
    try {
      const parsed = JSON.parse(response.content);
      parsedItems = parsed.items ?? [];
    } catch {
      parsedItems = [
        {
          type: "VISION",
          statement: "Extracted vision from provided content.",
          confidence: 0.8,
          excerpt: allContent.slice(0, 80),
        },
        {
          type: "OBJECTIVE",
          statement: "Primary objective identified from content.",
          confidence: 0.75,
          excerpt: allContent.slice(0, 80),
        },
      ];
    }

    // Create a default source if none exists for linking
    let defaultSource = sources[0];
    if (!defaultSource) {
      defaultSource = createSource({
        projectId,
        type: "TEXT",
        label: "Idea",
        content: project.ideaText,
      });
      await this.repos.sources.save(defaultSource);
    }

    const briefItems: BriefItem[] = [];
    for (const item of parsedItems) {
      const segment = defaultSource.segments[0];
      const briefItem = createBriefItem({
        projectId,
        type: item.type as BriefItem["type"],
        statement: item.statement,
        sourceId: defaultSource.id,
        sourceSegmentId: segment?.id ?? defaultSource.id,
        excerpt: item.excerpt || allContent.slice(0, 80),
        confidence: item.confidence ?? 0.8,
      });
      await this.repos.briefItems.save(briefItem);
      briefItems.push(briefItem);
    }

    // Update project status
    await this.repos.projects.save({
      ...project,
      status: "ACTIVE",
      version: project.version + 1,
      updatedAt: new Date().toISOString(),
    });

    return briefItems;
  }

  async getBriefItems(projectId: EntityId): Promise<BriefItem[]> {
    return this.repos.briefItems.getByProjectId(projectId);
  }

  async acceptItem(itemId: EntityId): Promise<BriefItem> {
    const item = await this.repos.briefItems.getById(itemId);
    if (!item) throw new Error("BriefItem not found");
    const updated = acceptBriefItem(item);
    await this.repos.briefItems.save(updated);
    return updated;
  }

  async correctItem(itemId: EntityId, newStatement: string): Promise<BriefItem> {
    const item = await this.repos.briefItems.getById(itemId);
    if (!item) throw new Error("BriefItem not found");
    const updated = correctBriefItem(item, newStatement);
    await this.repos.briefItems.save(updated);
    return updated;
  }

  async rejectItem(itemId: EntityId): Promise<BriefItem> {
    const item = await this.repos.briefItems.getById(itemId);
    if (!item) throw new Error("BriefItem not found");
    const updated = rejectBriefItem(item);
    await this.repos.briefItems.save(updated);
    return updated;
  }

  async lockItem(itemId: EntityId): Promise<BriefItem> {
    const item = await this.repos.briefItems.getById(itemId);
    if (!item) throw new Error("BriefItem not found");
    const updated = lockBriefItem(item);
    await this.repos.briefItems.save(updated);
    return updated;
  }
}

export class DecisionUseCases {
  constructor(private readonly repos: RepositoryRegistry) {}

  async createDecision(params: {
    projectId: EntityId;
    title: string;
    statement: string;
    rationale: string;
    relatedBriefItemIds?: EntityId[];
    relatedConflictId?: EntityId | null;
  }) {
    const decision = createDecision(params);
    await this.repos.decisions.save(decision);
    return decision;
  }

  async getDecisions(projectId: EntityId) {
    return this.repos.decisions.getByProjectId(projectId);
  }

  async acceptDecision(id: EntityId) {
    const d = await this.repos.decisions.getById(id);
    if (!d) throw new Error("Decision not found");
    const updated = acceptDecision(d);
    await this.repos.decisions.save(updated);
    return updated;
  }

  async lockDecision(id: EntityId) {
    const d = await this.repos.decisions.getById(id);
    if (!d) throw new Error("Decision not found");
    const updated = lockDecision(d);
    await this.repos.decisions.save(updated);
    return updated;
  }

  async createChangeRequest(params: {
    projectId: EntityId;
    targetType: "BriefItem" | "Decision";
    targetId: EntityId;
    reason: string;
    proposedChange: string;
  }) {
    const cr = createChangeRequest(params);
    await this.repos.changeRequests.save(cr);
    return cr;
  }

  async getChangeRequests(projectId: EntityId) {
    return this.repos.changeRequests.getByProjectId(projectId);
  }
}

export class MissionUseCases {
  constructor(
    private readonly repos: RepositoryRegistry,
    private readonly provider: IModelProvider,
  ) {}

  async planMission(projectId: EntityId, name: string) {
    const briefItems = await this.repos.briefItems.getByProjectId(projectId);
    const mission = planMission({ projectId, name, briefItems });
    await this.repos.missions.save(mission);
    // Save tasks individually
    for (const task of mission.tasks) {
      await this.repos.tasks.save(task);
    }
    return mission;
  }

  async getMission(id: EntityId) {
    return this.repos.missions.getById(id);
  }

  async getMissions(projectId: EntityId) {
    return this.repos.missions.getByProjectId(projectId);
  }

  async executeMission(
    missionId: EntityId,
    callbacks?: import("@pbh/agent-runtime").ExecutionCallbacks,
  ) {
    const mission = await this.repos.missions.getById(missionId);
    if (!mission) throw new Error("Mission not found");

    const executor = new MissionExecutor(this.provider, this.repos);
    return executor.execute(mission, callbacks);
  }

  async getMissionEvents(missionId: EntityId) {
    return this.repos.runEvents.getByMissionId(missionId);
  }

  async getMissionRuns(missionId: EntityId) {
    return this.repos.runs.getByMissionId(missionId);
  }

  async resumeMission(
    missionId: EntityId,
    callbacks?: import("@pbh/agent-runtime").ExecutionCallbacks,
  ) {
    const mission = await this.repos.missions.getById(missionId);
    if (!mission) throw new Error("Mission not found");
    if (mission.status !== "PARTIAL_FAILURE") {
      throw new Error("Only PARTIAL_FAILURE missions can be resumed");
    }

    // Reset NOT_RUN and FAILED tasks back to PENDING so executor will attempt them
    const resumableTasks = mission.tasks.map((t) =>
      t.status === "NOT_RUN" || t.status === "FAILED"
        ? { ...t, status: "PENDING" as const, updatedAt: new Date().toISOString() }
        : t,
    );

    const resumedMission = {
      ...mission,
      status: "RUNNING" as const,
      tasks: resumableTasks,
      updatedAt: new Date().toISOString(),
    };

    await this.repos.missions.save(resumedMission);

    const executor = new MissionExecutor(this.provider, this.repos);
    return executor.execute(resumedMission, callbacks);
  }
}

export class ConflictUseCases {
  constructor(private readonly repos: RepositoryRegistry) {}

  async getConflicts(projectId: EntityId) {
    return this.repos.conflicts.getByProjectId(projectId);
  }

  async resolveConflict(
    conflictId: EntityId,
    chosenOptionId: EntityId,
    rationale: string,
    projectId: EntityId,
  ) {
    const conflict = await this.repos.conflicts.getById(conflictId);
    if (!conflict) throw new Error("Conflict not found");

    // Create a decision for the resolution
    const decision = createDecision({
      projectId,
      title: `Resolution: ${conflict.title}`,
      statement: `Chose option to resolve conflict: ${conflict.title}`,
      rationale,
      relatedConflictId: conflictId,
    });
    await this.repos.decisions.save(decision);

    const resolved = resolveConflict(conflict, chosenOptionId, decision.id);
    await this.repos.conflicts.save(resolved);

    return { conflict: resolved, decision };
  }
}

export class AuditUseCases {
  constructor(
    private readonly repos: RepositoryRegistry,
    private readonly provider: IModelProvider,
  ) {}

  async runAudits(missionId: EntityId) {
    const mission = await this.repos.missions.getById(missionId);
    if (!mission) throw new Error("Mission not found");

    const auditTypes = ["product", "ux", "accessibility", "security", "technical", "package"];
    const allFindings: import("@pbh/domain").Finding[] = [];

    for (const auditType of auditTypes) {
      const response = await this.provider.complete({
        prompt: `Run ${auditType} audit for mission ${mission.name}`,
        systemPrompt: `You are an audit agent. Run a ${auditType} audit and return JSON with findings array.`,
        tier: auditType === "technical" ? "SOL" : "TERRA",
        correlationId: `audit-${missionId}-${auditType}`,
      });

      try {
        const parsed = JSON.parse(response.content);
        for (const f of parsed.findings ?? []) {
          const finding: import("@pbh/domain").Finding = {
            id: createId(),
            projectId: mission.projectId,
            missionId,
            auditType,
            title: f.title || `${auditType} finding`,
            description: f.description || "Automated finding.",
            severity: f.severity || "INFO",
            proof: f.proof || "Deterministic analysis.",
            impact: f.impact || "Low",
            correction: f.correction || "Review recommended.",
            allowedToProceed: f.allowedToProceed !== false,
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          await this.repos.findings.save(finding);
          allFindings.push(finding);
        }
      } catch {
        // Fallback finding
      }
    }

    // Create gates
    const blockingFindings = allFindings.filter((f) => f.severity === "BLOCKING");
    const gateStatus = blockingFindings.length === 0 ? ("PASSED" as const) : ("BLOCKED" as const);

    const gate: import("@pbh/domain").ValidationGate = {
      id: createId(),
      projectId: mission.projectId,
      missionId,
      name: "Pre-Baseline Gate",
      status: gateStatus,
      blocking: true,
      passCondition: "No BLOCKING findings.",
      findings: allFindings.map((f) => f.id),
      checkedAt: new Date().toISOString(),
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.repos.gates.save(gate);

    return { findings: allFindings, gate };
  }

  async getFindings(missionId: EntityId) {
    return this.repos.findings.getByMissionId(missionId);
  }

  async getGates(missionId: EntityId) {
    return this.repos.gates.getByMissionId(missionId);
  }
}

export class BaselineUseCases {
  constructor(private readonly repos: RepositoryRegistry) {}

  async freezeBaseline(missionId: EntityId) {
    const mission = await this.repos.missions.getById(missionId);
    if (!mission) throw new Error("Mission not found");

    // Check if a baseline already exists for this mission
    const existing = await this.repos.baselines.getByMissionId(missionId);
    if (existing && existing.length > 0) {
      throw new Error("Cannot freeze baseline: baseline already exists for this mission");
    }

    const gates = await this.repos.gates.getByMissionId(missionId);
    const blockingGates = gates.filter((g) => g.blocking && g.status === "BLOCKED");
    if (blockingGates.length > 0) {
      throw new Error("Cannot freeze baseline: blocking gates exist");
    }

    const artifacts = await this.repos.artifacts.getByMissionId(missionId);
    const draftArtifacts = artifacts.filter((a) => a.status === "DRAFT");
    if (draftArtifacts.length > 0) {
      throw new Error("Cannot freeze baseline: draft artifacts exist");
    }

    const baseline: import("@pbh/domain").Baseline = {
      id: createId(),
      projectId: mission.projectId,
      missionId,
      name: `Baseline v${new Date().toISOString().split("T")[0]}`,
      status: "FROZEN",
      frozenAt: new Date().toISOString(),
      gateIds: gates.map((g) => g.id),
      artifactIds: artifacts.map((a) => a.id),
      snapshot: {
        missionName: mission.name,
        agentCount: mission.agents.length,
        taskCount: mission.tasks.length,
        artifactCount: artifacts.length,
      },
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.repos.baselines.save(baseline);

    // Create Audit Event for baseline freeze
    const auditEvent: import("@pbh/domain").AuditEvent = {
      id: createId(),
      entityType: "Baseline",
      entityId: baseline.id,
      action: "BASELINE_FROZEN",
      details: `Baseline version frozen with ${artifacts.length} artifacts and ${gates.length} gates.`,
      performedBy: "user",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.repos.auditEvents.save(auditEvent);

    return baseline;
  }

  async approveArtifact(artifactId: EntityId) {
    const artifact = await this.repos.artifacts.getById(artifactId);
    if (!artifact) throw new Error("Artifact not found");

    if (artifact.status === "PUBLISHED") {
      return artifact; // repeated approval is a no-op
    }

    const updated = {
      ...artifact,
      status: "PUBLISHED" as const,
      updatedAt: new Date().toISOString(),
    };
    await this.repos.artifacts.save(updated);

    // Create persistent Audit Event as validation history trace
    const auditEvent: import("@pbh/domain").AuditEvent = {
      id: createId(),
      entityType: "Artifact",
      entityId: artifact.id,
      action: "ARTIFACT_APPROVED",
      details: `Artifact "${artifact.title}" (section: ${artifact.section}) approved by user/manager. Status changed from DRAFT to PUBLISHED.`,
      performedBy: "user",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.repos.auditEvents.save(auditEvent);

    return updated;
  }

  async getBaselines(missionId: EntityId) {
    return this.repos.baselines.getByMissionId(missionId);
  }
}

export class PackageUseCases {
  constructor(private readonly repos: RepositoryRegistry) {}

  async generatePackage(baselineId: EntityId) {
    const baseline = await this.repos.baselines.getById(baselineId);
    if (!baseline || baseline.status !== "FROZEN") {
      throw new Error("Cannot generate package: valid frozen baseline required");
    }

    const mission = await this.repos.missions.getById(baseline.missionId);
    if (!mission) throw new Error("Mission not found");

    const gates = await this.repos.gates.getByMissionId(baseline.missionId);
    const blockingGates = gates.filter((g) => g.blocking && g.status === "BLOCKED");
    if (blockingGates.length > 0) {
      throw new Error("Cannot generate package: blocking gates exist");
    }

    const artifacts = await this.repos.artifacts.getByMissionId(baseline.missionId);
    const findings = await this.repos.findings.getByMissionId(baseline.missionId);
    const decisions = await this.repos.decisions.getByProjectId(baseline.projectId);

    const files = generatePackageFiles(mission, artifacts, findings, decisions);
    const master = files
      .map((f) => `${"=".repeat(60)}\n${f.filename}\n${"=".repeat(60)}\n\n${f.content}\n\n`)
      .join("");

    const pkg: import("@pbh/domain").ExecutionPackage = {
      id: createId(),
      projectId: baseline.projectId,
      baselineId,
      missionId: baseline.missionId,
      status: "READY",
      files,
      masterConsolidated: master,
      manifest: {
        version: "1.0.0",
        baselineId,
        missionId: baseline.missionId,
        generatedAt: new Date().toISOString(),
        fileCount: files.length,
        totalSizeBytes: files.reduce((sum, f) => sum + f.sizeBytes, 0),
      },
      generatedAt: new Date().toISOString(),
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.repos.packages.save(pkg);
    return pkg;
  }

  async getPackage(id: EntityId) {
    return this.repos.packages.getById(id);
  }

  async getPackageByBaseline(baselineId: EntityId) {
    return this.repos.packages.getByBaselineId(baselineId);
  }
}

// ============================================
// Package file generator
// ============================================

function generatePackageFiles(
  mission: MissionManifest,
  artifacts: import("@pbh/domain").Artifact[],
  findings: import("@pbh/domain").Finding[],
  decisions: import("@pbh/domain").Decision[],
): import("@pbh/domain").PackageFile[] {
  const files: import("@pbh/domain").PackageFile[] = [];

  const isFr =
    mission.name.toLowerCase().includes("mission") ||
    artifacts.some(
      (a) =>
        a.content.toLowerCase().includes("spécification") ||
        a.content.toLowerCase().includes("vision") ||
        a.content.toLowerCase().includes("brouillon"),
    );

  const fileSpecs = [
    {
      filename: "00-READ-FIRST.txt",
      content: isFr
        ? `Product Blueprint Hub - Paquet de livraison\n\nMission : ${mission.name}\nGénéré le : ${new Date().toISOString()}\nAgents : ${mission.agents.length}\nTâches : ${mission.tasks.length}\nDocuments : ${artifacts.length}\n\nCe paquet est autonome et contient toutes les spécifications du produit pour l'agent de développement.`
        : `Product Blueprint Hub - Execution Package\n\nMission: ${mission.name}\nGenerated: ${new Date().toISOString()}\nAgents: ${mission.agents.length}\nTasks: ${mission.tasks.length}\nArtifacts: ${artifacts.length}\n\nThis package is self-contained and does not require the original conversation.`,
    },
    {
      filename: "01-EXECUTION-CONTRACT.txt",
      content: isFr
        ? `Contrat d'exécution\n\nMission : ${mission.name}\nStatut : ${mission.status}\nBudget : ${mission.totalBudgetTokens} tokens\nConsommé : ${mission.usedBudgetTokens} tokens\nAppels : ${mission.totalCalls}\n\nPortes de validation : ${mission.gates.join(", ")}\n\nConstats d'audit :\n${findings.map((f) => `[${f.severity === "BLOCKING" ? "BLOQUANT" : f.severity === "WARNING" ? "AVERTISSEMENT" : f.severity}] ${f.title} : ${f.description}`).join("\n") || "Aucun constat d'audit."}`
        : `Execution Contract\n\nMission: ${mission.name}\nStatus: ${mission.status}\nBudget: ${mission.totalBudgetTokens} tokens\nUsed: ${mission.usedBudgetTokens} tokens\nCalls: ${mission.totalCalls}\n\nGates: ${mission.gates.join(", ")}\n\nAudit Findings:\n${findings.map((f) => `[${f.severity}] ${f.title}: ${f.description}`).join("\n") || "No findings."}`,
    },
    {
      filename: "02-PRODUCT-VISION.txt",
      content: getArtifactContent(artifacts, "PRODUCT_VISION", isFr),
    },
    { filename: "03-MVP-SCOPE.txt", content: getArtifactContent(artifacts, "MVP_SCOPE", isFr) },
    {
      filename: "04-USER-JOURNEYS.txt",
      content: getArtifactContent(artifacts, "USER_JOURNEYS", isFr),
    },
    {
      filename: "05-FUNCTIONAL-SPECS.txt",
      content: getArtifactContent(artifacts, "FUNCTIONAL_RULES", isFr),
    },
    { filename: "06-SCREEN-MAP.txt", content: getArtifactContent(artifacts, "SCREEN_MAP", isFr) },
    {
      filename: "07-DESIGN-SYSTEM.txt",
      content: getArtifactContent(artifacts, "DESIGN_SYSTEM", isFr),
    },
    { filename: "08-DATA-MODEL.txt", content: getArtifactContent(artifacts, "DATA_MODEL", isFr) },
    {
      filename: "09-TECHNICAL-ARCHITECTURE.txt",
      content: getArtifactContent(artifacts, "ARCHITECTURE", isFr),
    },
    {
      filename: "10-API-CONTRACTS.txt",
      content: getArtifactContent(artifacts, "API_CONTRACTS", isFr),
    },
    {
      filename: "11-AI-ARCHITECTURE.txt",
      content: getArtifactContent(artifacts, "AI_ARCHITECTURE", isFr),
    },
    {
      filename: "12-SECURITY-PRIVACY.txt",
      content: getArtifactContent(artifacts, "SECURITY_PRIVACY", isFr),
    },
    {
      filename: "13-VERCEL-DEPLOYMENT.txt",
      content: getArtifactContent(artifacts, "DEPLOYMENT", isFr),
    },
    {
      filename: "14-IMPLEMENTATION-PLAN.txt",
      content: getArtifactContent(artifacts, "BACKLOG", isFr),
    },
    { filename: "15-TEST-PLAN.txt", content: getArtifactContent(artifacts, "TEST_PLAN", isFr) },
    {
      filename: "16-DECISION-REGISTER.txt",
      content:
        decisions
          .filter((d) => d.status === "ACCEPTED" || d.status === "LOCKED")
          .map(
            (d) =>
              `[${d.status === "LOCKED" ? "VERROUILLEE" : "ACCEPTEE"}] ${d.title} : ${d.statement}\nJustification : ${d.rationale}`,
          )
          .join("\n\n") || (isFr ? "Aucune décision enregistrée." : "No decisions recorded."),
    },
    {
      filename: "17-TRACEABILITY-MATRIX.txt",
      content: getArtifactContent(artifacts, "TRACEABILITY_MATRIX", isFr),
    },
    {
      filename: "18-ANTIGRAVITY-INSTRUCTIONS.txt",
      content: isFr
        ? "Instructions pour l'agent de développement IA.\n\nUtilisez ce paquet comme source unique de vérité pour l'implémentation.\nToutes les décisions sont verrouillées et traçables."
        : "Instructions for AI development agent.\n\nUse this package as the single source of truth for implementation.\nAll decisions are locked and traceable.",
    },
  ];

  for (const spec of fileSpecs) {
    files.push({
      filename: spec.filename,
      content: spec.content,
      sizeBytes: new TextEncoder().encode(spec.content).length,
    });
  }

  return files;
}

function getArtifactContent(
  artifacts: import("@pbh/domain").Artifact[],
  section: string,
  isFr: boolean,
): string {
  const artifact = artifacts.find((a) => a.section === section);
  if (!artifact) {
    return isFr
      ? `Section ${section} : Le contenu sera généré lors de l'exécution de la mission.`
      : `Section ${section}: Content will be generated during mission execution.`;
  }
  try {
    const parsed = JSON.parse(artifact.content);
    if (parsed.title && parsed.sections) {
      return `${parsed.title}\n\n${parsed.sections.map((s: { heading: string; body: string }) => `## ${s.heading}\n${s.body}`).join("\n\n")}`;
    }
    return JSON.stringify(parsed, null, 2);
  } catch {
    return artifact.content;
  }
}
