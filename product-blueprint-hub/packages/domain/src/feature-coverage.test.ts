import { describe, it, expect } from "vitest";
import { computeFeatureCoverage } from "./feature-coverage";
import type { DesignProposal } from "./design-proposals";

describe("computeFeatureCoverage - Chantier 7", () => {
  const createProposal = (
    id: string,
    layer: 'FEATURE' | 'JOURNEY' | 'SCREEN',
    status: string = 'ACCEPTED',
    extraData: any = {}
  ): DesignProposal => ({
    id,
    projectId: "proj-1",
    layer,
    title: `${layer} ${id}`,
    description: `Description ${id}`,
    status: status as any,
    targetPlatform: "WEB",
    generationBatchId: "batch-1",
    variationIndex: 0,
    layerData: extraData,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  it("1. Feature in a step with a screen -> COVERED", () => {
    const feat = createProposal("feat-1", "FEATURE");
    const scr = createProposal("scr-1", "SCREEN");
    const jrn = createProposal("jrn-1", "JOURNEY", "ACCEPTED", {
      steps: [
        { stepNumber: 1, userAction: "Action 1", featureIds: ["feat-1"], screenIds: ["scr-1"] }
      ]
    });

    const report = computeFeatureCoverage([feat, scr, jrn]);

    expect(report.totalFeatures).toBe(1);
    expect(report.coveredCount).toBe(1);
    expect(report.partiallyCoveredCount).toBe(0);
    expect(report.orphanCount).toBe(0);
    expect(report.coverageRate).toBe(100);
    expect(report.details[0].status).toBe("COVERED");
  });

  it("2. Feature in a step without screen -> PARTIALLY_COVERED (missing: ['SCREEN'])", () => {
    const feat = createProposal("feat-1", "FEATURE");
    const jrn = createProposal("jrn-1", "JOURNEY", "ACCEPTED", {
      steps: [
        { stepNumber: 1, userAction: "Action 1", featureIds: ["feat-1"], screenIds: [] }
      ]
    });

    const report = computeFeatureCoverage([feat, jrn]);

    expect(report.totalFeatures).toBe(1);
    expect(report.coveredCount).toBe(0);
    expect(report.partiallyCoveredCount).toBe(1);
    expect(report.coverageRate).toBe(0);
    expect(report.details[0].status).toBe("PARTIALLY_COVERED");
    expect(report.details[0].missing).toEqual(["SCREEN"]);
  });

  it("3. Feature parent of a Journey but absent from steps -> PARTIALLY_COVERED (missing: ['STEP_INSCRIPTION'])", () => {
    const feat = createProposal("feat-1", "FEATURE");
    const jrn = createProposal("jrn-1", "JOURNEY", "ACCEPTED", {
      steps: [
        { stepNumber: 1, userAction: "Action non liée", featureIds: [] }
      ]
    });
    jrn.parentId = "feat-1";

    const report = computeFeatureCoverage([feat, jrn]);

    expect(report.totalFeatures).toBe(1);
    expect(report.coveredCount).toBe(0);
    expect(report.partiallyCoveredCount).toBe(1);
    expect(report.details[0].status).toBe("PARTIALLY_COVERED");
    expect(report.details[0].missing).toEqual(["STEP_INSCRIPTION"]);
  });

  it("4. Feature without any journey/step -> ORPHAN", () => {
    const feat = createProposal("feat-1", "FEATURE");

    const report = computeFeatureCoverage([feat]);

    expect(report.totalFeatures).toBe(1);
    expect(report.orphanCount).toBe(1);
    expect(report.coverageRate).toBe(0);
    expect(report.details[0].status).toBe("ORPHAN");
  });

  it("5. Feature SUPERSEDED / DEFERRED / REJECTED -> EXCLUDED (not in eligible denominator)", () => {
    const f1 = createProposal("feat-active", "FEATURE");
    const f2 = createProposal("feat-superseded", "FEATURE", "SUPERSEDED");
    const f3 = createProposal("feat-deferred", "FEATURE", "DEFERRED");
    const f4 = createProposal("feat-rejected", "FEATURE", "REJECTED");

    const report = computeFeatureCoverage([f1, f2, f3, f4]);

    expect(report.totalFeatures).toBe(1); // Only feat-active is eligible!
    expect(report.excludedCount).toBe(3);
    expect(report.orphanCount).toBe(1);
  });

  it("6. Feature in 2 paths (one complete, one partial) -> Best status COVERED, counted once", () => {
    const feat = createProposal("feat-1", "FEATURE");
    const scr = createProposal("scr-1", "SCREEN");
    
    // Journey 1: Partial (no screen)
    const jrn1 = createProposal("jrn-1", "JOURNEY", "ACCEPTED", {
      steps: [{ stepNumber: 1, userAction: "Action 1", featureIds: ["feat-1"], screenIds: [] }]
    });
    // Journey 2: Complete (with screen)
    const jrn2 = createProposal("jrn-2", "JOURNEY", "ACCEPTED", {
      steps: [{ stepNumber: 1, userAction: "Action 2", featureIds: ["feat-1"], screenIds: ["scr-1"] }]
    });

    const report = computeFeatureCoverage([feat, scr, jrn1, jrn2]);

    expect(report.totalFeatures).toBe(1);
    expect(report.coveredCount).toBe(1);
    expect(report.partiallyCoveredCount).toBe(0);
    expect(report.coverageRate).toBe(100);
  });

  it("7. Zero eligible features -> coverageRate === 0 (no NaN / division by zero)", () => {
    const jrn = createProposal("jrn-1", "JOURNEY");

    const report = computeFeatureCoverage([jrn]);

    expect(report.totalFeatures).toBe(0);
    expect(report.coverageRate).toBe(0);
  });

  it("8. Business scenario: 9 eligible features, 2 covered -> coverageRate === 22%", () => {
    const features = Array.from({ length: 9 }, (_, i) => createProposal(`feat-${i + 1}`, "FEATURE"));
    const scr = createProposal("scr-1", "SCREEN");
    const jrn = createProposal("jrn-1", "JOURNEY", "ACCEPTED", {
      steps: [
        { stepNumber: 1, userAction: "Action 1", featureIds: ["feat-1"], screenIds: ["scr-1"] },
        { stepNumber: 2, userAction: "Action 2", featureIds: ["feat-2"], screenIds: ["scr-1"] },
      ]
    });

    const report = computeFeatureCoverage([...features, scr, jrn]);

    expect(report.totalFeatures).toBe(9);
    expect(report.coveredCount).toBe(2);
    expect(report.orphanCount).toBe(7);
    expect(report.coverageRate).toBe(22); // Math.round(2/9 * 100) = 22% !
  });
});
