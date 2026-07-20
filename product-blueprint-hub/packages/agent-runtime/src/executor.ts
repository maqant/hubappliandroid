import type {
  EntityId,
  TaskDefinition,
  Run,
  RunEvent,
  MissionManifest,
  BlueprintSection,
  Artifact,
  Conflict,
} from "@pbh/domain";
import { createId } from "@pbh/domain";
import type { IModelProvider, ModelRequest } from "@pbh/model-gateway";
import type { RepositoryRegistry } from "@pbh/repositories";

// ============================================
// Mission Executor — runs task graph
// ============================================

export interface ExecutionCallbacks {
  onTaskStarted?: (task: TaskDefinition) => void;
  onTaskCompleted?: (task: TaskDefinition, run: Run) => void;
  onTaskFailed?: (task: TaskDefinition, error: string) => void;
  onEvent?: (event: RunEvent) => void;
  onProgress?: (completed: number, total: number) => void;
}

export class MissionExecutor {
  constructor(
    private readonly provider: IModelProvider,
    private readonly repos: RepositoryRegistry,
  ) {}

  async execute(
    mission: MissionManifest,
    callbacks?: ExecutionCallbacks,
  ): Promise<MissionManifest> {
    const tasks = [...mission.tasks];
    const completed = new Set<string>();
    let totalTokens = 0;
    let totalCalls = 0;
    const allEvents: RunEvent[] = [];
    const updatedTasks: TaskDefinition[] = [];

    // Emit mission start
    const startEvent = createEvent(
      mission.id,
      null,
      null,
      "TASK_STARTED",
      "Mission execution started",
      {},
    );
    allEvents.push(startEvent);
    callbacks?.onEvent?.(startEvent);

    // Execute in phases (respecting dependencies)
    let iterations = 0;
    const maxIterations = tasks.length * 2; // Safety limit

    while (completed.size < tasks.length && iterations < maxIterations) {
      iterations++;
      const readyTasks = tasks.filter(
        (t) => !completed.has(t.id) && t.dependencies.every((dep) => completed.has(dep)),
      );

      if (readyTasks.length === 0 && completed.size < tasks.length) {
        // Deadlock
        break;
      }

      // Execute ready tasks (simulate parallel)
      for (const task of readyTasks) {
        const updatedTask: TaskDefinition = {
          ...task,
          status: "RUNNING",
          updatedAt: new Date().toISOString(),
        };
        callbacks?.onTaskStarted?.(updatedTask);

        try {
          const run = await this.executeTask(mission.id, updatedTask);
          totalTokens += run.tokensUsed;
          totalCalls++;

          const completedTask: TaskDefinition = {
            ...updatedTask,
            status: "COMPLETED",
            updatedAt: new Date().toISOString(),
          };

          completed.add(task.id);
          updatedTasks.push(completedTask);
          callbacks?.onTaskCompleted?.(completedTask, run);
          callbacks?.onProgress?.(completed.size, tasks.length);

          // Save run
          await this.repos.runs.save(run);

          // Create completion event
          const evt = createEvent(
            mission.id,
            task.id,
            run.id,
            "TASK_COMPLETED",
            `Task "${task.name}" completed (${run.tokensUsed} tokens)`,
            { tokensUsed: run.tokensUsed, modelTier: run.modelTier },
          );
          allEvents.push(evt);
          await this.repos.runEvents.save(evt);
          callbacks?.onEvent?.(evt);
        } catch (err) {
          const failedTask: TaskDefinition = {
            ...updatedTask,
            status: "FAILED",
            updatedAt: new Date().toISOString(),
          };
          updatedTasks.push(failedTask);
          completed.add(task.id); // Mark as done (failed)
          callbacks?.onTaskFailed?.(failedTask, String(err));
        }
      }
    }

    try {
      // Generate artifacts from completed tasks
      await this.generateArtifacts(mission);

      // Formalize locked brief items into decisions
      await this.formalizeDecisions(mission);

      // Detect conflicts deterministically
      await this.detectConflicts(mission);

      const hasFailedTasks = updatedTasks.some((t) => t.status === "FAILED");

      // Update mission to COMPLETED or PARTIAL_FAILURE
      const completedMission: MissionManifest = {
        ...mission,
        status: hasFailedTasks ? "PARTIAL_FAILURE" : "COMPLETED",
        tasks:
          updatedTasks.length > 0
            ? updatedTasks
            : tasks.map((t) => ({
                ...t,
                status: "COMPLETED" as const,
                updatedAt: new Date().toISOString(),
              })),
        usedBudgetTokens: totalTokens,
        totalCalls,
        version: mission.version + 1,
        updatedAt: new Date().toISOString(),
      };

      await this.repos.missions.save(completedMission);
      return completedMission;
    } catch (err) {
      // Rollback created deliverables to prevent partial/inconsistent states
      await this.rollbackMissionExecution(mission.id, mission.projectId);

      const failedMission: MissionManifest = {
        ...mission,
        status: "PARTIAL_FAILURE",
        tasks: updatedTasks.map((t) =>
          t.status === "RUNNING" ? { ...t, status: "FAILED" as const } : t,
        ),
        usedBudgetTokens: totalTokens,
        totalCalls,
        version: mission.version + 1,
        updatedAt: new Date().toISOString(),
      };
      await this.repos.missions.save(failedMission);
      throw err;
    }
  }

  private async rollbackMissionExecution(missionId: EntityId, projectId: EntityId): Promise<void> {
    // 1. Rollback artifacts
    const allArtifacts = await this.repos.artifacts.getAll();
    const missionArtifacts = allArtifacts.filter((a) => a.missionId === missionId);
    for (const a of missionArtifacts) {
      await this.repos.artifacts.delete(a.id);
    }

    // 2. Rollback decisions formalized during this run
    const allDecisions = await this.repos.decisions.getByProjectId(projectId);
    const lockedBriefItems = (await this.repos.briefItems.getByProjectId(projectId)).filter(
      (bi) => bi.status === "LOCKED",
    );
    const lockedIds = new Set(lockedBriefItems.map((bi) => bi.id));
    for (const d of allDecisions) {
      if (d.sourceBriefItemId && lockedIds.has(d.sourceBriefItemId)) {
        await this.repos.decisions.delete(d.id);
      }
    }

    // 3. Rollback conflicts
    const allConflicts = await this.repos.conflicts.getByProjectId(projectId);
    for (const c of allConflicts) {
      if (c.status === "DETECTED") {
        await this.repos.conflicts.delete(c.id);
      }
    }
  }

  private async executeTask(missionId: EntityId, task: TaskDefinition): Promise<Run> {
    const now = new Date().toISOString();

    const request: ModelRequest = {
      prompt: `Execute task: ${task.name}\nDescription: ${task.description}\nAgent: ${task.agentId}`,
      systemPrompt: `You are agent ${task.agentId}. Analyze and produce structured output for: ${task.description}`,
      tier: task.modelTier,
      maxTokens: task.budgetTokens,
      correlationId: `${missionId}-${task.id}`,
      metadata: {
        missionId,
        taskId: task.id,
        agentId: task.agentId,
        agentName: task.name,
      },
    };

    try {
      const response = await this.provider.complete(request);
      return {
        id: createId(),
        taskId: task.id,
        missionId,
        status: "COMPLETED",
        startedAt: now,
        completedAt: new Date().toISOString(),
        tokensUsed: response.tokensUsed,
        modelTier: response.tier,
        error: null,
        diagnostic: response.diagnostic,
        version: 1,
        createdAt: now,
        updatedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      // Create a FAILED run to track diagnostic
      const diagnostic = err.diagnostic || null;
      return {
        id: createId(),
        taskId: task.id,
        missionId,
        status: "FAILED",
        startedAt: now,
        completedAt: new Date().toISOString(),
        tokensUsed: 0,
        modelTier: task.modelTier,
        error: err.message || String(err),
        diagnostic,
        version: 1,
        createdAt: now,
        updatedAt: new Date().toISOString(),
      };
    }
  }

  private async generateArtifacts(mission: MissionManifest): Promise<void> {
    const now = new Date().toISOString();
    const sections: BlueprintSection[] = [
      "PRODUCT_VISION",
      "USERS_NEEDS",
      "MVP_SCOPE",
      "USER_JOURNEYS",
      "SCREEN_MAP",
      "DESIGN_SYSTEM",
      "FUNCTIONAL_RULES",
      "DATA_MODEL",
      "ARCHITECTURE",
      "API_CONTRACTS",
      "AI_ARCHITECTURE",
      "SECURITY_PRIVACY",
      "DEPLOYMENT",
      "BACKLOG",
      "TEST_PLAN",
      "DECISION_REGISTER",
      "TRACEABILITY_MATRIX",
    ];

    const lockedBriefItems = await this.repos.briefItems.getByProjectId(mission.projectId);
    const lockedItems = lockedBriefItems.filter((bi) => bi.status === "LOCKED");
    const decisions = await this.repos.decisions.getByProjectId(mission.projectId);

    const contextStr = `
Locked References:
${lockedItems.map((item) => `- [${item.type}] ${item.statement} (Source excerpt: "${item.excerpt}")`).join("\n")}
Decisions:
${decisions.map((d) => `- [DECISION] ${d.title}: ${d.statement}`).join("\n")}
`;

    for (const section of sections) {
      const request: ModelRequest = {
        prompt: `Generate blueprint section: ${section} for mission "${mission.name}". Context: ${contextStr}`,
        systemPrompt: `Generate comprehensive blueprint content for section: ${section}`,
        tier: "TERRA",
        correlationId: `${mission.id}-blueprint-${section}`,
        metadata: {
          missionId: mission.id,
          taskId: `artifact-${section}`,
          agentId: "FIX-DIRECTOR",
          agentName: "Blueprint Generator",
        },
      };

      const response = await this.provider.complete(request);

      const artifact: Artifact = {
        id: createId(),
        projectId: mission.projectId,
        missionId: mission.id,
        section,
        title: formatSectionTitle(section),
        content: response.content,
        status: "DRAFT",
        agentId: "FIX-DIRECTOR",
        version: 1,
        createdAt: now,
        updatedAt: now,
      };

      await this.repos.artifacts.save(artifact);
    }
  }

  private async formalizeDecisions(mission: MissionManifest): Promise<void> {
    const allBriefItems = await this.repos.briefItems.getByProjectId(mission.projectId);
    const lockedBriefItems = allBriefItems.filter((bi) => bi.status === "LOCKED");

    const existingDecisions = await this.repos.decisions.getByProjectId(mission.projectId);

    for (const bi of lockedBriefItems) {
      const decisionExists = existingDecisions.some((d) => d.sourceBriefItemId === bi.id);
      if (!decisionExists) {
        const titleFr = `Décision : ${bi.type} - ${bi.statement.slice(0, 40)}`;
        const rationaleFr = `Formalisé automatiquement lors de la mission à partir de la référence stable : "${bi.excerpt}"`;
        const decision: import("@pbh/domain").Decision = {
          id: createId(),
          projectId: mission.projectId,
          title: titleFr,
          statement: bi.statement,
          status: "ACCEPTED",
          rationale: rationaleFr,
          relatedBriefItemIds: [bi.id],
          relatedConflictId: null,
          sourceBriefItemId: bi.id,
          sourceId: bi.sourceId,
          sourceExcerpt: bi.excerpt,
          createdByAgentId: "DESIGN-DIRECTOR",
          affectedArtifacts: [],
          previousVersions: [],
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await this.repos.decisions.save(decision);
      }
    }
  }

  private async detectConflicts(mission: MissionManifest): Promise<void> {
    const now = new Date().toISOString();

    // Create one deterministic demo conflict
    const conflict: Conflict = {
      id: createId(),
      projectId: mission.projectId,
      title: "Arbitrage : Périmètre vs Délai",
      description:
        "Le périmètre de fonctionnalités demandées pour la garde-robe connectée dépasse le calendrier envisagé pour le MVP. Cet arbitrage a été détecté lors de la phase d'analyse de la mission.",
      status: "DETECTED",
      sourceItemIds: [],
      options: [
        {
          id: createId(),
          label: "Réduire le périmètre du MVP",
          description:
            "Se concentrer uniquement sur les fonctionnalités clés pour le premier lancement.",
          impact: "Livraison plus rapide mais moins de fonctionnalités en v1.",
        },
        {
          id: createId(),
          label: "Repousser la date de livraison",
          description: "Conserver l'ensemble du périmètre en allongeant la durée du projet.",
          impact: "Périmètre complet mais lancement retardé.",
        },
      ],
      chosenOptionId: null,
      resolutionDecisionId: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    await this.repos.conflicts.save(conflict);
  }
}

// ============================================
// Helpers
// ============================================

function createEvent(
  missionId: EntityId,
  taskId: EntityId | null,
  runId: EntityId | null,
  type: RunEvent["type"],
  message: string,
  data: Record<string, unknown>,
): RunEvent {
  const now = new Date().toISOString();
  return {
    id: createId(),
    missionId,
    taskId,
    runId,
    type,
    message,
    data,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

function formatSectionTitle(section: BlueprintSection): string {
  return section
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}
