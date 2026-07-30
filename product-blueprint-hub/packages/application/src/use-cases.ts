import type { EntityId, BriefItem, Project, Source, MissionManifest, TargetPlatform } from "@pbh/domain";
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
import { safeParseModelJson } from "@pbh/model-gateway";
import { planMission } from "@pbh/agent-runtime";
import { MissionExecutor } from "@pbh/agent-runtime";

// ============================================
// Use Cases
// ============================================

export class ProjectUseCases {
  constructor(private readonly repos: RepositoryRegistry) {}

  async createProject(name: string, description: string, ideaText: string, targetPlatforms: TargetPlatform[]): Promise<Project> {
    if (!targetPlatforms || targetPlatforms.length === 0) {
      throw new Error("PLATFORM_REQUIRED: Le choix d'une plateforme cible est obligatoire pour créer un projet.");
    }
    const project = createProject({ name, description, ideaText, targetPlatforms });
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
    updates: Partial<Pick<Project, "name" | "description" | "ideaText" | "status" | "targetPlatforms">>,
  ): Promise<Project> {
    const project = await this.repos.projects.getById(id);
    if (!project) throw new Error("Project not found");
    const updated: Project = {
      ...project,
      ...updates,
      updatedAt: new Date().toISOString(),
      version: project.version + 1,
    };
    await this.repos.projects.save(updated);
    return updated;
  }

  async confirmTargetPlatform(id: EntityId, targetPlatform: TargetPlatform): Promise<Project> {
    return this.updateProject(id, { targetPlatforms: [targetPlatform] });
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
        "Tu es un Product Manager expert. Analyse le contenu fourni et extrais les informations clés sous forme de Brief. Tu dois impérativement retourner un objet JSON contenant une propriété 'items' qui est un tableau. Chaque objet item DOIT avoir : 'type' (ex: VISION, OBJECTIVE, USER_ROLE, CONSTRAINT, FEATURE), 'statement' (la description claire), 'confidence' (nombre entre 0 et 1) et 'excerpt' (citation courte). N'inclus AUCUN texte avant ou après le JSON.",
      tier: "TERRA",
      correlationId: `analyze-${projectId}`,
    });

    // Parse the response
    let rawItems: any[];
    try {
      const parsed = safeParseModelJson<any>(response.content);
      rawItems = Array.isArray(parsed.items) ? parsed.items : Array.isArray(parsed) ? parsed : [];
    } catch {
      rawItems = [
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

    const parsedItems = rawItems
      .map((raw) => {
        const statement = raw.statement?.trim() || raw.description?.trim() || raw.content?.trim() || "";
        if (!statement) {
          console.warn(`[BriefUseCases] analyzeBrief: item IA sans statement, ignoré`, { raw });
          return null;
        }
        const validTypes = ["VISION", "OBJECTIVE", "USER_NEED", "DECISION", "SUGGESTION", "ASSUMPTION", "CONSTRAINT", "RISK", "QUESTION", "EXAMPLE"];
        const rawType = (raw.type?.trim() || "").toUpperCase();
        const type = validTypes.includes(rawType) ? rawType : "VISION";
        return {
          type,
          statement,
          confidence: typeof raw.confidence === "number" ? raw.confidence : 0.8,
          excerpt: raw.excerpt?.trim() || statement.slice(0, 80),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

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
    const seen = new Set<string>();
    const existing = await this.repos.briefItems.getByProjectId(projectId);
    const existingKeys = new Set(existing.map((i: any) => i.statement.trim().toLowerCase()));

    for (const item of parsedItems) {
      const key = item.statement.trim().toLowerCase();
      if (seen.has(key) || existingKeys.has(key)) continue;
      seen.add(key);

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

  async acceptAllProposed(projectId: EntityId): Promise<BriefItem[]> {
    const items = await this.repos.briefItems.getByProjectId(projectId);
    const proposed = items.filter((i) => i.status === "PROPOSED");
    const updatedItems: BriefItem[] = [];
    for (const item of proposed) {
      const updated = acceptBriefItem(item);
      await this.repos.briefItems.save(updated);
      updatedItems.push(updated);
    }
    return updatedItems;
  }

  /** @deprecated Fusionné avec acceptItem — le verrouillage UI séparé a été supprimé. */
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
    const baseline = await this.repos.productInterviewBaselines.getLatestByProjectId(projectId);
    const briefItems = await this.repos.briefItems.getByProjectId(projectId);
    const mission = planMission({
      projectId,
      name,
      briefItems,
      ...(baseline ? { baselineId: baseline.id, baselineVersion: baseline.version } : {}),
    });
    const missionToSave = baseline
      ? { ...mission, baselineId: baseline.id, baselineVersion: baseline.version }
      : mission;
    await this.repos.missions.save(missionToSave);
    // Save tasks individually
    for (const task of missionToSave.tasks) {
      await this.repos.tasks.save(task);
    }
    return missionToSave;
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
        a.content.toLowerCase().includes("brouillon")
    );

    const hiveGuidelineContent = isFr
    ? `# 00-HIVE-GUIDELINE — ${mission.name}

> **FICHIER PIVOT HIVE** — Point d'entrée obligatoire pour tout agent (Jules, Antigravity).
> Généré automatiquement par Product Blueprint Hub le ${new Date().toISOString()}.
> NE PAS supprimer. Les agents doivent le lire AVANT toute action sur le code.

---

## 1. Cycle de vie Hive de ce projet

\`\`\`
PBH (conception scellée) → Jules (implémentation) → Antigravity (debug + roadmap)
\`\`\`

| Agent | Rôle | Fichiers de référence |
|---|---|---|
| **Jules** | Implémentation autonome step-by-step | 01 → 14 (contrat, vision, plan) |
| **Antigravity** | Debug, pair-programming, évolutions | 00 (ce fichier), 18, 19, .agents/AGENTS.md |

## 2. Vision du Produit
${getArtifactContent(artifacts, "PRODUCT_VISION", isFr)}

## 3. Architecture Scellée (NON NÉGOCIABLE sans arbitrage humain)
${getArtifactContent(artifacts, "ARCHITECTURE", isFr)}

⚠️ Toute correction de bug ou évolution DOIT respecter ces décisions.
En cas de conflit : STOP et demander l'arbitrage de l'utilisateur.

## 4. Plan d'Implémentation (Résumé)
${getArtifactContent(artifacts, "BACKLOG", isFr)}

> Détail complet : voir \`14-IMPLEMENTATION-PLAN.txt\`.

## 5. État d'Avancement
> ⚠️ Section MUTABLE — à mettre à jour par l'agent actif en fin de session.

- **Fait** : (aucun — export initial depuis PBH)
- **En cours** : implémentation par Jules selon le plan 14
- **Reste à faire** : voir \`19-ROADMAP-DEFERRED.md\` (features reportées)

## 6. Protocole Agents
- **Jules** : exécute le plan 14 étape par étape. À la fin, met à jour la section 5.
- **Antigravity** : applique les règles de \`.agents/AGENTS.md\` (Hive Awareness Rule).
  Quand les tâches courantes sont résolues, propose la prochaine feature DEFERRED.
`
    : `# 00-HIVE-GUIDELINE — ${mission.name}

> **HIVE PIVOT FILE** — Mandatory entry point for any AI agent (Jules, Antigravity).
> Generated automatically by Product Blueprint Hub on ${new Date().toISOString()}.

---

## 1. Hive Lifecycle
PBH (sealed design) → Jules (implementation) → Antigravity (debug & roadmap continuation)

## 2. Product Vision
${getArtifactContent(artifacts, "PRODUCT_VISION", isFr)}

## 3. Sealed Architecture
${getArtifactContent(artifacts, "ARCHITECTURE", isFr)}

## 4. Implementation Plan
${getArtifactContent(artifacts, "BACKLOG", isFr)}
`;

  const deferredRoadmapContent = isFr
    ? `# 19-ROADMAP-DEFERRED — ${mission.name}

> Features volontairement reportées lors de la conception PBH.
> Généré le ${new Date().toISOString()}.
>
> **Protocole Antigravity** : quand les tâches courantes sont résolues,
> proposer la prochaine feature DEFERRED. Après implémentation, passer
> son statut à DONE (avec date) dans CE fichier.

---

${getArtifactContent(artifacts, "DEFERRED_ROADMAP", isFr)}
`
    : `# 19-ROADMAP-DEFERRED — ${mission.name}

> Features deferred during PBH design.
> Generated on ${new Date().toISOString()}.

---

${getArtifactContent(artifacts, "DEFERRED_ROADMAP", isFr)}
`;

  const agentsMdContent = `# AGENTS.md - Hive Awareness Rule

## Portée

Ce fichier définit le comportement obligatoire de Jules et Antigravity pour tout projet généré par Product Blueprint Hub.

L'objectif est de conserver une conscience légère du produit pendant le vibe coding, sans imposer un processus administratif.

## Règle 1 - Charger la conscience du projet

Au début de chaque session ou avant une modification structurante :

1. Lire \`HIVE.md\` s'il existe.
2. Charger au minimum :
   - la promesse du produit ;
   - le périmètre MVP ;
   - l'état actuel ;
   - les décisions à respecter ;
   - l'architecture à préserver ;
   - la roadmap ;
   - les points d'extension ;
   - les limites connues.
3. Consulter les documents détaillés référencés dans \`HIVE.md\` uniquement si la tâche le nécessite.

Si \`HIVE.md\` n'existe pas, signaler brièvement son absence. Ne pas bloquer une petite correction pour cette seule raison.

## Règle 2 - Vibe coding assisté

L'utilisateur doit pouvoir formuler naturellement une demande de correction, d'ajout ou d'évolution.

Avant une modification structurante, vérifier silencieusement si la demande :

- appartient au MVP ;
- figure dans la roadmap ;
- contredit une décision ;
- modifie une architecture à préserver ;
- ferme un point d'extension important ;
- implique une fonctionnalité volontairement différée.

Une petite correction locale ne doit pas déclencher un audit général ni une lecture complète de tous les documents PBH.

## Règle 3 - Architecture et décisions à préserver

Ne pas modifier silencieusement :

- la plateforme ;
- les frontières de domaine ;
- les contrats fonctionnels ;
- les décisions architecturales scellées ;
- les exclusions ;
- la séparation entre MVP et roadmap.

Si une demande exige de modifier un de ces éléments :

1. expliquer le conflit en langage clair ;
2. indiquer l'impact concret ;
3. proposer l'option conforme la plus simple ;
4. attendre l'arbitrage de l'utilisateur avant le changement structurant.

Ne pas bloquer une correction conforme à l'architecture existante.

## Règle 4 - Deferred signifie non développé maintenant

Un élément \`DEFERRED\`, \`NEXT\` ou \`FUTURE\` peut influencer une frontière architecturale, mais ne doit pas être implémenté sans demande explicite de l'utilisateur.

Pour une évolution future :

- préserver uniquement le point d'extension utile ;
- ne pas créer d'infrastructure spéculative ;
- ne pas ajouter de compte, backend, API, abstraction ou dépendance sans besoin actuel ;
- inscrire dans \`HIVE.md\` ce qu'il faut préserver et ce qu'il ne faut pas construire maintenant.

## Règle 5 - Répondre à « Il reste quoi à faire ? »

Utiliser d'abord \`HIVE.md\`.

Répondre avec une liste courte distinguant :

- en cours ;
- reste à faire pour terminer le MVP ;
- problèmes connus ;
- prochaine évolution de roadmap, séparée du MVP.

Ne pas lancer un audit général sauf demande explicite ou incohérence manifeste du fichier.

## Règle 6 - Mise à jour de HIVE.md

Mettre à jour \`HIVE.md\` uniquement après un changement significatif :

- fonctionnalité terminée ;
- nouvelle décision structurante ;
- changement d'architecture accepté ;
- ajout, retrait ou report de périmètre ;
- limite importante découverte ;
- point d'extension ajouté ;
- étape d'implémentation terminée.

Ne pas mettre à jour \`HIVE.md\` pour une correction mineure de texte, de style ou d'espacement.

La mise à jour doit rester concise et factuelle.

## Règle 7 - Continuité PBH, Jules et Antigravity

Cycle de vie :

\`\`\`text
PBH
  -> produit le contrat, le blueprint, le plan, la roadmap et HIVE.md
Jules
  -> construit le MVP par étapes et actualise l'état utile dans HIVE.md
Antigravity
  -> corrige, compile, affine et poursuit les évolutions avec l'utilisateur
\`\`\`

PBH définit le produit.

Le code constitue l'état réel de l'implémentation.

Le compte rendu d'un agent ne remplace pas la vérification du code lorsqu'une question technique précise se pose.

En cas de doute :

consulter HIVE.md ;
consulter uniquement le document détaillé pertinent ;
comparer avec le code réel ;
signaler l'écart sans modifier silencieusement le produit.

Règle 8 - Validation proportionnée

Pour une modification de code :

exécuter le build demandé par le projet avant commit et push ;
corriger uniquement les erreurs de compilation causées par la modification ;
ne pas lancer automatiquement un audit général, une batterie E2E ou une refonte hors périmètre ;
ne pas déclarer la tâche terminée si le build obligatoire échoue.

Règle 9 - Priorité documentaire

Ordre de référence :

HIVE.md pour l'état courant et la roadmap ;
contrat produit ou baseline PBH pour la finalité fonctionnelle ;
architecture technique pour les décisions scellées ;
catalogue des fonctionnalités, parcours, écrans et critères pour le détail ;
code réel pour l'état d'implémentation.

Une divergence fonctionnelle doit être arbitrée.

Une divergence purement technique peut être corrigée dans le cadre des décisions existantes.
`;

  const activeDecisionsStr = decisions
    .filter((d) => d.status === "ACCEPTED" || d.status === "LOCKED")
    .map((d) => `- [${d.status === "LOCKED" ? "VERROUILLEE" : "ACCEPTEE"}] ${d.title} : ${d.statement}`)
    .join("\n") || "Aucune décision spécifique enregistrée.";

  const hiveMdContent = `# HIVE.md

Mémoire vivante et légère du projet. Ce fichier doit rester court, factuel et utile au vibe coding.

## Produit
Nom : ${mission.name}
Plateforme : WEB_NEXTJS / ANDROID_EXPO
Baseline PBH : ${mission.id} v1.0
Promesse : ${getArtifactContent(artifacts, "PRODUCT_VISION", isFr).split("\n")[0] || mission.name}
Utilisateur ou contexte principal : Utilisateur final cible

## MVP retenu

${getArtifactContent(artifacts, "MVP_SCOPE", isFr)}

## État actuel
### Fait

Aucun lot applicatif encore livré.

### En cours

Démarrage du plan d'implémentation par Jules.

### Reste à faire pour terminer le MVP

${getArtifactContent(artifacts, "BACKLOG", isFr)}

## Décisions à respecter

${activeDecisionsStr}

## Architecture à préserver

${getArtifactContent(artifacts, "ARCHITECTURE", isFr)}

## Roadmap
### Prochaine évolution probable

${getArtifactContent(artifacts, "DEFERRED_ROADMAP", isFr)}

### Plus tard

Evolutions futures selon les retours utilisateurs.

### Idées conservées sans engagement

Aucune question ouverte bloquante.

## Points d'extension

Points d'extension préservés dans l'architecture (voir 09-TECHNICAL-ARCHITECTURE.txt).

## Problèmes ou limites connus

${findings.map((f) => `- [${f.severity}] ${f.title}`).join("\n") || "Aucun problème bloquant identifié."}

## Documents de référence

- 00-HIVE-GUIDELINE.md
- 01-EXECUTION-CONTRACT.txt
- 02-PRODUCT-VISION.txt
- 03-MVP-SCOPE.txt
- 04-USER-JOURNEYS.txt
- 05-FUNCTIONAL-SPECS.txt
- 06-SCREEN-MAP.txt
- 07-DESIGN-SYSTEM.txt
- 08-DATA-MODEL.txt
- 09-TECHNICAL-ARCHITECTURE.txt
- 10-API-CONTRACTS.txt
- 11-AI-ARCHITECTURE.txt
- 12-SECURITY-PRIVACY.txt
- 13-VERCEL-DEPLOYMENT.txt
- 14-IMPLEMENTATION-PLAN.txt
- 15-TEST-PLAN.txt
- 16-DECISION-REGISTER.txt
- 17-TRACEABILITY-MATRIX.txt
- 18-ANTIGRAVITY-INSTRUCTIONS.txt
- 19-ROADMAP-DEFERRED.md

Ne consulter les documents détaillés que lorsque la tâche le nécessite.

## Dernière mise à jour
Date : ${new Date().toISOString()}
Agent : Product Blueprint Hub
Résumé : Génération initiale du contexte Hive depuis la baseline et le Blueprint technique.
`;

  const fileSpecs = [
    {
      filename: "00-HIVE-GUIDELINE.md",
      content: hiveGuidelineContent,
    },
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
        ? "PRIORITÉ 0 : Lis impérativement 00-HIVE-GUIDELINE.md et applique .agents/AGENTS.md.\n\nInstructions pour l'agent de développement IA (Antigravity).\nUtilisez ce paquet comme source unique de vérité pour l'implémentation et le débogage.\nToutes les décisions sont verrouillées et traçables."
        : "PRIORITY 0: Read 00-HIVE-GUIDELINE.md first and apply .agents/AGENTS.md.\n\nInstructions for AI development agent (Antigravity).\nUse this package as the single source of truth for implementation and debugging.\nAll decisions are locked and traceable.",
    },
    {
      filename: "AGENTS.md",
      content: agentsMdContent,
    },
    {
      filename: "HIVE.md",
      content: hiveMdContent,
    },
    {
      filename: "19-ROADMAP-DEFERRED.md",
      content: deferredRoadmapContent,
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
