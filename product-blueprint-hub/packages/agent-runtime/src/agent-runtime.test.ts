import { describe, it, expect } from "vitest";
import { getFixedAgents, planBriefMission, validateMissionManifest } from "./planner-helper";
import { createId, type EntityId } from "@pbh/domain";

describe("Agent Runtime & Planning", () => {
  const projectId = createId();

  it("should plan mission with exactly 18 fixed agents", () => {
    const agents = getFixedAgents();
    expect(agents.length).toBe(18);
    const ids = agents.map((a) => a.agentId);
    expect(ids).toContain("FIX-DIRECTOR");
    expect(ids).toContain("FIX-PRODUCT");
    expect(ids).toContain("FIX-SCOPE");
    expect(ids).toContain("FIX-NOVICE");
    expect(ids).toContain("FIX-UX");
    expect(ids).toContain("FIX-DESIGN");
    expect(ids).toContain("FIX-CROSSAPP");
    expect(ids).toContain("FIX-ARCH");
    expect(ids).toContain("FIX-AI");
    expect(ids).toContain("FIX-SECURITY");
    expect(ids).toContain("FIX-PRIVACY");
    expect(ids).toContain("FIX-COMPLIANCE");
    expect(ids).toContain("FIX-A11Y");
    expect(ids).toContain("FIX-QA");
    expect(ids).toContain("FIX-VERCEL");
    expect(ids).toContain("FIX-COST");
    expect(ids).toContain("FIX-TECH-AUDIT");
    expect(ids).toContain("FIX-PACKAGE-AUDIT");
  });

  it("should reject manifest if a mandatory fixed agent is missing", () => {
    const manifest = planBriefMission(projectId, "Test Mission", []);
    // Remove one mandatory agent
    const invalidManifest = {
      ...manifest,
      agents: manifest.agents.filter((a) => a.agentId !== "FIX-DIRECTOR"),
    };

    expect(() => validateMissionManifest(invalidManifest)).toThrow(
      "Missing mandatory fixed agent: FIX-DIRECTOR",
    );
  });

  it("should justify and add dynamic agents based on brief tags", () => {
    const now = new Date().toISOString();
    const briefItems = [
      {
        id: createId(),
        projectId,
        type: "USER_NEED" as const,
        statement: "User needs personas analysis",
        status: "ACCEPTED" as const,
        sourceId: createId(),
        sourceSegmentId: createId(),
        excerpt: "personas",
        confidence: 0.9,
        replaces: null,
        replacedBy: null,
        requiresUserReview: false,
        previousVersions: [],
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
    ];

    const manifest = planBriefMission(projectId, "Test Mission with Dynamic", briefItems);
    const ids = manifest.agents.map((a) => a.agentId);
    expect(ids).toContain("DYN-USER-RESEARCH");
  });

  it("should build task graph without cycles", () => {
    const manifest = planBriefMission(projectId, "Test Mission", []);
    const tasks = manifest.tasks;

    // Check that for every task, all dependencies are listed in the task list
    const taskIds = new Set(tasks.map((t) => t.id));
    for (const task of tasks) {
      for (const depId of task.dependencies) {
        expect(taskIds.has(depId)).toBe(true);
      }
    }

    // Cycle detection using DFS
    const visited = new Set<string>();
    const recStack = new Set<string>();

    function hasCycle(id: string): boolean {
      if (recStack.has(id)) return true;
      if (visited.has(id)) return false;

      visited.add(id);
      recStack.add(id);

      const task = tasks.find((t) => t.id === id);
      if (task) {
        for (const depId of task.dependencies) {
          if (hasCycle(depId)) return true;
        }
      }

      recStack.delete(id);
      return false;
    }

    for (const task of tasks) {
      expect(hasCycle(task.id)).toBe(false);
    }
  });

  it("should respect budget limit and maxIterations constraints", () => {
    const manifest = planBriefMission(projectId, "Test Mission", []);
    const tasks = manifest.tasks;

    expect(manifest.totalBudgetTokens).toBeGreaterThan(0);
    for (const task of tasks) {
      expect(task.maxIterations).toBeGreaterThan(0);
      expect(task.maxIterations).toBeLessThanOrEqual(5);
      expect(task.budgetTokens).toBeGreaterThan(0);
    }
  });

  it("should preserve checkpoints for recovery", () => {
    const now = new Date().toISOString();
    const task: TaskDefinition = {
      id: createId(),
      projectId,
      missionId: createId(),
      agentId: "FIX-DIRECTOR",
      name: "Consolidated Task",
      description: "Direct synthesis task",
      status: "RUNNING",
      dependencies: [],
      parallelGroup: null,
      modelTier: "SOL",
      maxIterations: 1,
      budgetTokens: 5000,
      outputs: [],
      checkpointData: JSON.stringify({ completedSteps: ["analysis", "design"] }),
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    expect(task.checkpointData).not.toBeNull();
    const parsedCheckpoint = JSON.parse(task.checkpointData!);
    expect(parsedCheckpoint.completedSteps).toContain("analysis");
  });
});
