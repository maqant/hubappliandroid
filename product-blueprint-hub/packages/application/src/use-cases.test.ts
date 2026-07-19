// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PackageUseCases, BaselineUseCases, AuditUseCases } from "./use-cases";
import { createLocalRepositoryRegistry } from "../../repositories/src/local-repository";
import { createProject, createId } from "../../domain/src/entities";
import { planMission } from "../../agent-runtime/src/planner";
import { MissionExecutor } from "../../agent-runtime/src/executor";
import { FakeModelProvider } from "../../model-gateway/src/providers";

let mockStorage: Record<string, string> = {};
beforeEach(() => {
  mockStorage = {};
  global.window = {
    localStorage: {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        mockStorage = {};
      },
      length: 0,
      key: (_index: number) => null,
    },
  } as any;
  global.localStorage = global.window.localStorage;
  FakeModelProvider.setDelayMode("instant");
  FakeModelProvider.setScenario("DEMO_PASSING");
});

afterEach(() => {
  delete (global as any).window;
  delete (global as any).localStorage;
});

describe("Package Generation Use Cases", () => {
  const projectId = createId();

  it("should generate all 20 required package files, including MASTER-CONSOLIDATED.txt", async () => {
    const repos = createLocalRepositoryRegistry();
    const pkgUseCases = new PackageUseCases(repos);

    // Setup base mock data
    const mission = planBriefMissionHelper(projectId);
    await repos.missions.save(mission);

    const baseline: import("@pbh/domain").Baseline = {
      id: createId(),
      projectId,
      missionId: mission.id,
      name: "Baseline v1",
      status: "FROZEN",
      frozenAt: new Date().toISOString(),
      gateIds: [],
      artifactIds: [],
      snapshot: {},
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await repos.baselines.save(baseline);

    const pkg = await pkgUseCases.generatePackage(baseline.id);

    expect(pkg.status).toBe("READY");
    expect(pkg.files.length).toBe(19); // 19 sub-files
    expect(pkg.masterConsolidated).toBeDefined();
    expect(pkg.masterConsolidated.length).toBeGreaterThan(0);

    const filenames = pkg.files.map((f) => f.filename);
    expect(filenames).toContain("00-READ-FIRST.txt");
    expect(filenames).toContain("01-EXECUTION-CONTRACT.txt");
    expect(filenames).toContain("02-PRODUCT-VISION.txt");
    expect(filenames).toContain("16-DECISION-REGISTER.txt");
    expect(filenames).toContain("18-ANTIGRAVITY-INSTRUCTIONS.txt");

    // All files must have content (no empty allowed)
    for (const f of pkg.files) {
      expect(f.content.length).toBeGreaterThan(0);
      expect(f.sizeBytes).toBeGreaterThan(0);
    }
  });

  it("should reject package generation if baseline has blocking gates", async () => {
    const repos = createLocalRepositoryRegistry();
    const baselineUseCases = new BaselineUseCases(repos);

    const mission = planBriefMissionHelper(projectId);
    await repos.missions.save(mission);

    // Create a blocking gate
    const gate: import("@pbh/domain").ValidationGate = {
      id: createId(),
      projectId,
      missionId: mission.id,
      name: "Gate G01",
      status: "BLOCKED",
      blocking: true,
      passCondition: "Pass condition",
      findings: [],
      checkedAt: new Date().toISOString(),
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await repos.gates.save(gate);

    await expect(baselineUseCases.freezeBaseline(mission.id)).rejects.toThrow(
      "Cannot freeze baseline: blocking gates exist",
    );
  });

  it("should exclude superseded decisions from active decision register", async () => {
    const repos = createLocalRepositoryRegistry();
    const pkgUseCases = new PackageUseCases(repos);

    const mission = planBriefMissionHelper(projectId);
    await repos.missions.save(mission);

    // Create one active decision and one superseded/draft decision
    const d1: import("@pbh/domain").Decision = {
      id: createId(),
      projectId,
      title: "Decision A",
      statement: "Use Next.js",
      status: "LOCKED",
      rationale: "Stability",
      relatedBriefItemIds: [],
      relatedConflictId: null,
      previousVersions: [],
      version: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const d2: import("@pbh/domain").Decision = {
      id: createId(),
      projectId,
      title: "Decision B",
      statement: "Use Angular",
      status: "DRAFT", // Not locked or accepted (e.g. bypassed/superseded)
      rationale: "Bypassed",
      relatedBriefItemIds: [],
      relatedConflictId: null,
      previousVersions: [],
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await repos.decisions.save(d1);
    await repos.decisions.save(d2);

    const baseline: import("@pbh/domain").Baseline = {
      id: createId(),
      projectId,
      missionId: mission.id,
      name: "Baseline v1",
      status: "FROZEN",
      frozenAt: new Date().toISOString(),
      gateIds: [],
      artifactIds: [],
      snapshot: {},
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await repos.baselines.save(baseline);

    const pkg = await pkgUseCases.generatePackage(baseline.id);
    const decisionRegister = pkg.files.find((f) => f.filename === "16-DECISION-REGISTER.txt")!;

    expect(decisionRegister.content).toContain("Decision A");
    expect(decisionRegister.content).not.toContain("Decision B");
  });
});

describe("Validation Gates & Baseline Blocking Behavior", () => {
  const projectId = createId();

  it("should create a BLOCKED gate when there is a BLOCKING finding", async () => {
    const repos = createLocalRepositoryRegistry();
    const provider = new FakeModelProvider();
    FakeModelProvider.setScenario("DEMO_BLOCKING");

    const auditUseCases = new AuditUseCases(repos, provider);
    const mission = planBriefMissionHelper(projectId);
    await repos.missions.save(mission);

    const { findings, gate } = await auditUseCases.runAudits(mission.id);

    expect(findings.some((f) => f.severity === "BLOCKING")).toBe(true);
    expect(gate.status).toBe("BLOCKED");
  });

  it("should prevent freezeBaseline when a gate is BLOCKED", async () => {
    const repos = createLocalRepositoryRegistry();
    const baselineUseCases = new BaselineUseCases(repos);
    const mission = planBriefMissionHelper(projectId);
    await repos.missions.save(mission);

    // Create a BLOCKED gate
    const gate: import("@pbh/domain").ValidationGate = {
      id: createId(),
      projectId,
      missionId: mission.id,
      name: "Pre-Baseline Gate",
      status: "BLOCKED",
      blocking: true,
      passCondition: "Pass condition",
      findings: [],
      checkedAt: new Date().toISOString(),
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await repos.gates.save(gate);

    await expect(baselineUseCases.freezeBaseline(mission.id)).rejects.toThrow(
      "Cannot freeze baseline: blocking gates exist",
    );
  });

  it("should prevent generatePackage when a gate is BLOCKED", async () => {
    const repos = createLocalRepositoryRegistry();
    const pkgUseCases = new PackageUseCases(repos);
    const mission = planBriefMissionHelper(projectId);
    await repos.missions.save(mission);

    // Create a baseline and a BLOCKED gate
    const gate: import("@pbh/domain").ValidationGate = {
      id: createId(),
      projectId,
      missionId: mission.id,
      name: "Pre-Baseline Gate",
      status: "BLOCKED",
      blocking: true,
      passCondition: "Pass condition",
      findings: [],
      checkedAt: new Date().toISOString(),
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await repos.gates.save(gate);

    const baseline: import("@pbh/domain").Baseline = {
      id: createId(),
      projectId,
      missionId: mission.id,
      name: "Baseline v1",
      status: "FROZEN",
      frozenAt: new Date().toISOString(),
      gateIds: [gate.id],
      artifactIds: [],
      snapshot: {},
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await repos.baselines.save(baseline);

    await expect(pkgUseCases.generatePackage(baseline.id)).rejects.toThrow(
      "Cannot generate package: blocking gates exist",
    );
  });

  it("should allow freezeBaseline and generatePackage when gate is PASSED", async () => {
    const repos = createLocalRepositoryRegistry();
    const baselineUseCases = new BaselineUseCases(repos);
    const pkgUseCases = new PackageUseCases(repos);
    const mission = planBriefMissionHelper(projectId);
    await repos.missions.save(mission);

    // Create a PASSED gate
    const gate: import("@pbh/domain").ValidationGate = {
      id: createId(),
      projectId,
      missionId: mission.id,
      name: "Pre-Baseline Gate",
      status: "PASSED",
      blocking: true,
      passCondition: "Pass condition",
      findings: [],
      checkedAt: new Date().toISOString(),
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await repos.gates.save(gate);

    // Create some artifacts so package has content (must be APPROVED to allow freeze)
    const artifact: import("@pbh/domain").Artifact = {
      id: createId(),
      projectId,
      missionId: mission.id,
      section: "PRODUCT_VISION",
      title: "Product Vision",
      content: "Test Content",
      status: "APPROVED",
      agentId: "FIX-DIRECTOR",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await repos.artifacts.save(artifact);

    const baseline = await baselineUseCases.freezeBaseline(mission.id);
    expect(baseline.status).toBe("FROZEN");

    const pkg = await pkgUseCases.generatePackage(baseline.id);
    expect(pkg.status).toBe("READY");
  });

  it("should allow baseline when findings are only WARNING or INFO", async () => {
    const repos = createLocalRepositoryRegistry();
    const provider = new FakeModelProvider();
    FakeModelProvider.setScenario("DEMO_PASSING");

    const auditUseCases = new AuditUseCases(repos, provider);
    const baselineUseCases = new BaselineUseCases(repos);
    const mission = planBriefMissionHelper(projectId);
    await repos.missions.save(mission);

    const { findings, gate } = await auditUseCases.runAudits(mission.id);

    // Verify finding levels are WARNING or INFO
    const hasBlocking = findings.some((f) => f.severity === "BLOCKING");
    expect(hasBlocking).toBe(false);
    expect(gate.status).toBe("PASSED");

    // Save a approved artifact to pass the check
    const artifact: import("@pbh/domain").Artifact = {
      id: createId(),
      projectId,
      missionId: mission.id,
      section: "PRODUCT_VISION",
      title: "Product Vision",
      content: "Test Content",
      status: "APPROVED",
      agentId: "FIX-DIRECTOR",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await repos.artifacts.save(artifact);

    const baseline = await baselineUseCases.freezeBaseline(mission.id);
    expect(baseline.status).toBe("FROZEN");
  });

  it("should block freezeBaseline if DRAFT artifacts exist, and succeed after approving them", async () => {
    const repos = createLocalRepositoryRegistry();
    const baselineUseCases = new BaselineUseCases(repos);
    const mission = planBriefMissionHelper(projectId);
    await repos.missions.save(mission);

    // Create DRAFT artifact
    const artifact: import("@pbh/domain").Artifact = {
      id: createId(),
      projectId,
      missionId: mission.id,
      section: "MVP_SCOPE",
      title: "MVP Scope",
      content: "Draft Content",
      status: "DRAFT",
      agentId: "FIX-DIRECTOR",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await repos.artifacts.save(artifact);

    // Should throw blocking error
    await expect(baselineUseCases.freezeBaseline(mission.id)).rejects.toThrow(
      "Cannot freeze baseline: draft artifacts exist",
    );

    // Approve the artifact
    const updated = await baselineUseCases.approveArtifact(artifact.id);
    expect(updated.status).toBe("PUBLISHED");

    // Should succeed now
    const baseline = await baselineUseCases.freezeBaseline(mission.id);
    expect(baseline.status).toBe("FROZEN");
  });

  it("should formalize Decisions from LOCKED brief items during mission execution without duplication", async () => {
    const repos = createLocalRepositoryRegistry();
    const provider = new FakeModelProvider();
    const { MissionExecutor } = await import("../../agent-runtime/src/executor");

    const briefItem: import("@pbh/domain").BriefItem = {
      id: createId(),
      projectId,
      type: "VISION",
      statement: "Garde-robe intelligente météo",
      excerpt: "météo",
      confidence: 0.9,
      status: "LOCKED",
      sourceId: createId(),
      sourceSegmentId: createId(),
      previousVersions: [],
      version: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const rejectedItem: import("@pbh/domain").BriefItem = {
      id: createId(),
      projectId,
      type: "CONSTRAINT",
      statement: "This requirement was rejected",
      excerpt: "rejected text",
      confidence: 0.85,
      status: "REJECTED",
      sourceId: createId(),
      sourceSegmentId: createId(),
      previousVersions: [],
      version: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const proposedItem: import("@pbh/domain").BriefItem = {
      id: createId(),
      projectId,
      type: "USER_NEED",
      statement: "This requirement is still proposed",
      excerpt: "proposed text",
      confidence: 0.95,
      status: "PROPOSED",
      sourceId: createId(),
      sourceSegmentId: createId(),
      previousVersions: [],
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await repos.briefItems.save(briefItem);
    await repos.briefItems.save(rejectedItem);
    await repos.briefItems.save(proposedItem);

    const mission = planBriefMission(projectId, "Exec Mission", [
      briefItem,
      rejectedItem,
      proposedItem,
    ]);
    await repos.missions.save(mission);

    const executor = new MissionExecutor(provider, repos);
    await executor.execute(mission);

    // Decision should have been created ONLY for LOCKED brief item
    let decisions = await repos.decisions.getByProjectId(projectId);
    expect(decisions.length).toBe(1);
    expect(decisions[0]!.sourceBriefItemId).toBe(briefItem.id);
    expect(decisions[0]!.statement).toBe(briefItem.statement);
    expect(decisions[0]!.sourceId).toBe(briefItem.sourceId);
    expect(decisions[0]!.sourceExcerpt).toBe(briefItem.excerpt);

    // Re-execute: decision should NOT be duplicated
    await executor.execute(mission);
    decisions = await repos.decisions.getByProjectId(projectId);
    expect(decisions.length).toBe(1);

    // Reload checks persistence
    const reloadedDecisions = await repos.decisions.getByProjectId(projectId);
    expect(reloadedDecisions.length).toBe(1);
  });

  it("should detect clothing app domain and return French specific brief item descriptions from FakeModelProvider", async () => {
    const provider = new FakeModelProvider();
    const request = {
      prompt: "vêtement pluie météo garde-robe connectée",
      systemPrompt: "analyze brief content",
      tier: "SOL" as const,
    };
    const response = await provider.complete(request);
    const parsed = JSON.parse(response.content);

    expect(parsed.items).toBeDefined();
    expect(parsed.items.length).toBeGreaterThan(0);
    // Verified that it returns French statements related to smart wardrobe
    const matches = parsed.items.some(
      (item: any) =>
        item.statement.includes("garde-robe") ||
        item.statement.includes("tenue") ||
        item.statement.includes("vêtements"),
    );
    expect(matches).toBe(true);
  });

  it("should rollback all artifacts and decisions and set mission to FAILED when an execution error occurs (atomicity check)", async () => {
    const repos = createLocalRepositoryRegistry();
    // Simulate error on model completion
    const throwingProvider: import("@pbh/model-gateway").IModelProvider = {
      name: "throwing",
      isConfigured: true,
      checkHealth: async () => ({ status: "ok", message: "ok" }),
      complete: async (req) => {
        if (req.prompt.includes("MVP_SCOPE")) {
          throw new Error("Simulated model failure for atomic rollback test");
        }
        return {
          content: JSON.stringify({ title: "Section content", sections: [] }),
          tokensUsed: 10,
          modelId: "fake",
          tier: "TERRA",
          provider: "fake",
          durationMs: 1,
        };
      },
    };

    const briefItem: import("@pbh/domain").BriefItem = {
      id: createId(),
      projectId,
      type: "VISION",
      statement: "Garde-robe connectée météo",
      excerpt: "météo",
      confidence: 0.9,
      status: "LOCKED",
      sourceId: createId(),
      sourceSegmentId: createId(),
      previousVersions: [],
      version: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await repos.briefItems.save(briefItem);

    const mission = planBriefMission(projectId, "Exec Mission", [briefItem]);
    await repos.missions.save(mission);

    const executor = new MissionExecutor(throwingProvider, repos);
    await expect(executor.execute(mission)).rejects.toThrow(
      "Simulated model failure for atomic rollback test",
    );

    // 1. Mission status should be FAILED
    const reloadedMission = await repos.missions.getById(mission.id);
    expect(reloadedMission?.status).toBe("FAILED");

    // 2. Decisons created during execution should have been rolled back
    const decisions = await repos.decisions.getByProjectId(projectId);
    expect(decisions.length).toBe(0);

    // 3. Artifacts created during execution should have been rolled back
    const allArtifacts = await repos.artifacts.getAll();
    expect(allArtifacts.length).toBe(0);
  });

  describe("Artifact Approvals & Baseline Workflow Checks", () => {
    it("should handle draft visibility, approvals, repeated approvals, audit logs, double freeze prevention, and package baseline requirement", async () => {
      const repos = createLocalRepositoryRegistry();
      const baselineUseCases = new BaselineUseCases(repos);
      const pkgUseCases = new PackageUseCases(repos);

      const mission = planBriefMissionHelper(projectId);
      await repos.missions.save(mission);

      // 1. Create a DRAFT artifact
      const artifact: import("@pbh/domain").Artifact = {
        id: createId(),
        projectId,
        missionId: mission.id,
        section: "MVP_SCOPE",
        title: "MVP Scope",
        content: "Draft Specs",
        status: "DRAFT",
        agentId: "FIX-DIRECTOR",
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await repos.artifacts.save(artifact);

      // Verify draft status
      let loaded = await repos.artifacts.getById(artifact.id);
      expect(loaded?.status).toBe("DRAFT");

      // 2. Approve the artifact -> status becomes PUBLISHED
      const approved = await baselineUseCases.approveArtifact(artifact.id);
      expect(approved.status).toBe("PUBLISHED");

      // 3. Repeated approval -> no-op
      const t1 = approved.updatedAt;
      const approved2 = await baselineUseCases.approveArtifact(artifact.id);
      expect(approved2.status).toBe("PUBLISHED");

      // 4. Verify audit event trace was recorded
      const auditEvents = await repos.auditEvents.getAll();
      expect(auditEvents.length).toBeGreaterThan(0);
      expect(
        auditEvents.some(
          (e) => e.action === "ARTIFACT_APPROVED" && e.details.includes(artifact.title),
        ),
      ).toBe(true);

      // 5. Freeze baseline
      const baseline = await baselineUseCases.freezeBaseline(mission.id);
      expect(baseline.status).toBe("FROZEN");

      // Verify audit event for freeze was recorded
      const freezeAudit = (await repos.auditEvents.getAll()).find(
        (e) => e.action === "BASELINE_FROZEN",
      );
      expect(freezeAudit).toBeDefined();

      // 6. Prevent double freeze on same mission
      await expect(baselineUseCases.freezeBaseline(mission.id)).rejects.toThrow(
        "Cannot freeze baseline: baseline already exists for this mission",
      );

      // 7. Verify package is generated successfully with valid baseline
      const pkg = await pkgUseCases.generatePackage(baseline.id);
      expect(pkg.status).toBe("READY");

      // 8. Prevent package generation with invalid/unfrozen baseline id
      const fakeBaselineId = createId();
      await expect(pkgUseCases.generatePackage(fakeBaselineId)).rejects.toThrow(
        "Cannot generate package: valid frozen baseline required",
      );
    });
  });
});

function planBriefMissionHelper(projectId: EntityId) {
  return planBriefMission(projectId, "Synthesis Mission", []);
}

function planBriefMission(projectId: EntityId, name: string, briefItems: any[]) {
  return planMission({ projectId, name, briefItems });
}
