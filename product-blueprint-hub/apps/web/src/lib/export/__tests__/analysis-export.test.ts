import { describe, it, expect } from "vitest";
import { sanitizeAnalysisExport } from "../analysis-export-sanitizer";
import {
  buildCanonicalProposals,
  buildExperiencePathsJson,
  buildConceptionCompleteJson,
  buildExportManifestJson,
  type ExportBuildContext,
  type ExportFileRegistryEntry,
} from "../analysis-export-builders";
import type { DesignProposal, FeaturePath, EntityId } from "@pbh/domain";

describe("Analysis Export v2.0 - Chantier 8", () => {
  const createMockProposal = (idStr: string, layer: any = "FEATURE", status: string = "ACCEPTED"): DesignProposal => {
    const id = idStr as EntityId;
    return {
      id,
      projectId: "proj-123" as EntityId,
      layer,
      title: `Proposal ${idStr}`,
      description: `Description ${idStr}`,
      shortPitch: `Pitch ${idStr}`,
      rationale: `Rationale ${idStr}`,
      status: status as any,
      targetPlatforms: ["WEB"] as any,
      generationBatchId: "batch-1",
      variationIndex: 0,
      layerData: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as DesignProposal;
  };

  const createMockContext = (): ExportBuildContext => {
    const p1 = createMockProposal("p1", "INTENTION");
    const p2 = createMockProposal("p2", "CAPABILITY");
    (p2 as any).parentId = "p1" as EntityId;
    const p3 = createMockProposal("p3", "FEATURE");
    (p3 as any).parentId = "p2" as EntityId;
    const p4 = createMockProposal("p4", "JOURNEY");
    (p4 as any).parentId = "p3" as EntityId;
    const p5 = createMockProposal("p5", "FEATURE", "SUPERSEDED");
    (p5 as any).mergedIntoId = "p3" as EntityId;
    (p5 as any).mergeReason = "Fusionné dans p3";

    const proposals = [p1, p2, p3, p4, p5];

    const mockPath: FeaturePath = {
      id: "path-1" as EntityId,
      title: "Path 1",
      userGoal: "Goal 1",
      entryPoint: "Entry 1",
      finalOutcome: "Outcome 1",
      primaryJourneyId: "p4" as EntityId,
      variantJourneyIds: [],
      intentionIds: ["p1" as EntityId],
      hypothesisIds: [],
      capabilityIds: ["p2" as EntityId],
      featureIds: ["p3" as EntityId],
      journeyIds: ["p4" as EntityId],
      screenIds: [],
      stepReferences: [],
      sharedNodeIds: [],
      orphanNodeIds: [],
      reviewRequiredNodeIds: [],
      blockedNodeIds: [],
      deferredNodeIds: [],
      warningIds: [],
      warnings: [],
      status: "ACCEPTED",
      completeness: 100,
      canonicalNodeIds: ["p1" as EntityId, "p2" as EntityId, "p3" as EntityId, "p4" as EntityId],
      relationIds: [],
      features: [{ proposal: p3, isShared: false, parentIds: ["p2" as EntityId], childIds: [] }],
      journeys: [{ proposal: p4, isShared: false, parentIds: ["p3" as EntityId], childIds: [] }],
      screens: [],
      intentions: [p1],
      hypotheses: [],
    };

    return {
      project: { id: "proj-123", title: "Projet Test", targetPlatform: "WEB_NEXTJS" },
      proposals,
      paths: [mockPath],
      briefItems: [],
      decisions: [],
      rejectedItems: [],
      deferredItems: [],
      logs: [],
      logSession: { sessionId: "sess-1", sessionStartedAt: new Date().toISOString(), isTruncated: false, entryCount: 0 },
      logStats: { debug: 0, info: 0, warn: 0, error: 0, unhandledErrors: 0, unhandledRejections: 0 },
      appVersion: "0.24.0",
      hasMapImage: true,
      includePrompts: false,
    };
  };

  it("1. buildCanonicalProposals: returns deduplicated flat list with clean fields & mergedIntoId", () => {
    const ctx = createMockContext();
    const canonical = buildCanonicalProposals(ctx.proposals);

    expect(canonical.length).toBe(5);
    const superseded = canonical.find((p) => p.id === "p5");
    expect(superseded).toBeDefined();
    expect(superseded.status).toBe("SUPERSEDED");
    expect(superseded.mergedIntoId).toBe("p3");
  });

  it("2. buildExperiencePathsJson v2.0: strips full DesignProposal objects and uses $ref/ID nodes", () => {
    const ctx = createMockContext();
    const pathsJson = buildExperiencePathsJson(ctx);

    expect(pathsJson.exportFormatVersion).toBe("2.0");
    expect(pathsJson.paths.length).toBe(1);

    const path = pathsJson.paths[0];
    expect(path.features[0]).toEqual({ proposalId: "p3", isShared: false });
    expect(path.journeys[0]).toEqual({ proposalId: "p4", isShared: false });

    // Assert NO full proposal object is inlined inside path features/journeys
    const serialized = JSON.stringify(pathsJson);
    expect(serialized).not.toContain('"shortPitch":');
  });

  it("3. sanitizeAnalysisExport: replaces cyclic references with $ref and NEVER outputs '[Circular]'", () => {
    const cyclicObj: any = { id: "obj-1", title: "Cyclic Object" };
    cyclicObj.self = cyclicObj;

    const sanitized = sanitizeAnalysisExport(cyclicObj);
    const jsonString = JSON.stringify(sanitized);

    expect(jsonString).not.toContain("[Circular]");
    expect(sanitized.self).toEqual({ $ref: "obj-1" });
  });

  it("4. Referential integrity: all IDs in paths are resolvable in canonical list", () => {
    const ctx = createMockContext();
    const canonical = buildCanonicalProposals(ctx.proposals);
    const canonicalIds = new Set(canonical.map((p) => p.id));

    const pathsJson = buildExperiencePathsJson(ctx);
    pathsJson.paths.forEach((p: any) => {
      p.canonicalNodeIds.forEach((id: string) => {
        expect(canonicalIds.has(id)).toBe(true);
      });
    });
  });

  it("5. Manifest v2.0: simulated PNG failure -> overallStatus PARTIAL with explicit error code", () => {
    const ctx = createMockContext();
    ctx.hasMapImage = false;
    ctx.mapImageError = "CONTAINER_NOT_FOUND: Le conteneur HTML est introuvable.";

    const fileRegistry: ExportFileRegistryEntry[] = [
      { fileName: "conception-complete.json", role: "Données canoniques", status: "SUCCESS" },
      { fileName: "cartographie-complete.png", role: "Capture", status: "FAILED", error: ctx.mapImageError },
    ];

    const manifest = buildExportManifestJson(
      ctx,
      fileRegistry,
      "PARTIAL",
      { status: "FAILED", reason: "CONTAINER_NOT_FOUND", details: ctx.mapImageError }
    );

    expect(manifest.exportFormatVersion).toBe("2.0");
    expect(manifest.overallStatus).toBe("PARTIAL");
    expect(manifest.cartographyCaptureStatus.reason).toBe("CONTAINER_NOT_FOUND");
    expect(manifest.warnings.length).toBeGreaterThan(0);
  });

  it("6. Grep global on serialized export: zero occurrences of '[Circular]'", () => {
    const ctx = createMockContext();
    const conceptionJson = buildConceptionCompleteJson(ctx);
    const pathsJson = buildExperiencePathsJson(ctx);

    const sanitizedConception = sanitizeAnalysisExport(conceptionJson);
    const sanitizedPaths = sanitizeAnalysisExport(pathsJson);

    const fullExportString = JSON.stringify({ sanitizedConception, sanitizedPaths });

    expect(fullExportString.includes("[Circular]")).toBe(false);
  });
});
