import { describe, it, expect } from "vitest";
import { computePlatformConsistency } from "./platform-consistency";
import type { Project, EntityId, TargetPlatform } from "./entities";
import type { DesignProposal } from "./design-proposals";

describe("Platform Consistency Engine - Chantier 9", () => {
  const createMockProject = (targetPlatforms: TargetPlatform[] = [], ideaText: string = ""): Project => ({
    id: "proj-1" as EntityId,
    name: "Garde Manger",
    description: "App de gestion de garde manger",
    ideaText,
    targetPlatforms,
    status: "ACTIVE",
    designStatus: "IN_PROGRESS",
    activeBaselineId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
  });

  const createMockProposal = (idStr: string, targetPlatforms: TargetPlatform[] = []): DesignProposal => ({
    id: idStr as EntityId,
    projectId: "proj-1" as EntityId,
    layer: "FEATURE",
    title: `Feature ${idStr}`,
    description: "Desc",
    shortPitch: "Pitch",
    rationale: "Rationale",
    status: "ACCEPTED",
    targetPlatforms,
    generationBatchId: "batch-1",
    variationIndex: 0,
    layerData: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
  } as unknown as DesignProposal);

  it("1. Returns MISSING when project has no targetPlatforms", () => {
    const proj = createMockProject([]);
    const report = computePlatformConsistency(proj, []);
    expect(report.status).toBe("MISSING");
    expect(report.canonicalPlatform).toBeNull();
    expect(report.warnings.length).toBeGreaterThan(0);
  });

  it("2. Returns CONFIRMED when project and proposals match canonical platform ANDROID_EXPO", () => {
    const proj = createMockProject(["ANDROID_EXPO"], "Application Android Expo de garde manger");
    const p1 = createMockProposal("p1", ["ANDROID_EXPO"]);
    const p2 = createMockProposal("p2", ["ANDROID_EXPO"]);

    const report = computePlatformConsistency(proj, [p1, p2]);
    expect(report.status).toBe("CONFIRMED");
    expect(report.canonicalPlatform).toBe("ANDROID_EXPO");
    expect(report.incompatibleCount).toBe(0);
  });

  it("3. Returns CONTRADICTORY when a proposal declares a different platform", () => {
    const proj = createMockProject(["WEB_NEXTJS"], "App web de recettes");
    const p1 = createMockProposal("p1", ["WEB_NEXTJS"]);
    const p2 = createMockProposal("p2", ["ANDROID_EXPO"]); // Contradiction!

    const report = computePlatformConsistency(proj, [p1, p2]);
    expect(report.status).toBe("CONTRADICTORY");
    expect(report.canonicalPlatform).toBe("WEB_NEXTJS");
    expect(report.incompatibleCount).toBe(1);
    expect(report.incompatibleProposalIds).toContain("p2" as EntityId);
  });

  it("4. Reproduces historical 'garde manger' project mismatch (WEB_NEXTJS project + ANDROID_EXPO proposals & brief)", () => {
    const proj = createMockProject(["WEB_NEXTJS"], "Concevoir une application mobile Android Expo pour gérer le garde manger");
    const p1 = createMockProposal("p1", ["ANDROID_EXPO"]);
    const p2 = createMockProposal("p2", ["ANDROID_EXPO"]);
    const p3 = createMockProposal("p3", ["WEB_NEXTJS"]);

    const report = computePlatformConsistency(proj, [p1, p2, p3]);
    expect(report.status).toBe("CONTRADICTORY");
    expect(report.canonicalPlatform).toBe("WEB_NEXTJS");
    expect(report.incompatibleCount).toBe(2);
    expect(report.incompatibleProposalIds).toEqual(["p1" as EntityId, "p2" as EntityId]);
    expect(report.conflictingSources.some((s) => s.source === "BRIEF")).toBe(true);
  });
});
