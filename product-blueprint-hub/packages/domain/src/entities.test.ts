import { describe, it, expect } from "vitest";
import {
  createProject,
  createBriefItem,
  acceptBriefItem,
  correctBriefItem,
  rejectBriefItem,
  lockBriefItem,
  createDecision,
  acceptDecision,
  lockDecision,
  createId,
} from "./entities";

describe("Domain Entities & Transitions", () => {
  const projectId = createId();
  const sourceId = createId();
  const segmentId = createId();

  describe("BriefItem Transitions", () => {
    it("should start as PROPOSED", () => {
      const item = createBriefItem({
        projectId,
        type: "VISION",
        statement: "Test Vision",
        sourceId,
        sourceSegmentId: segmentId,
        excerpt: "vision",
        confidence: 0.9,
      });
      expect(item.status).toBe("PROPOSED");
      expect(item.version).toBe(1);
    });

    it("should transit to ACCEPTED", () => {
      let item = createBriefItem({
        projectId,
        type: "VISION",
        statement: "Test Vision",
        sourceId,
        sourceSegmentId: segmentId,
        excerpt: "vision",
        confidence: 0.9,
      });
      item = acceptBriefItem(item);
      expect(item.status).toBe("ACCEPTED");
      expect(item.version).toBe(2);
      expect(item.previousVersions.length).toBe(1);
      expect(item.previousVersions[0]?.status).toBe("PROPOSED");
    });

    it("should transit to CORRECTED", () => {
      let item = createBriefItem({
        projectId,
        type: "VISION",
        statement: "Test Vision",
        sourceId,
        sourceSegmentId: segmentId,
        excerpt: "vision",
        confidence: 0.9,
      });
      item = correctBriefItem(item, "New Vision Statement");
      expect(item.status).toBe("CORRECTED");
      expect(item.statement).toBe("New Vision Statement");
      expect(item.version).toBe(2);
    });

    it("should transit to REJECTED", () => {
      let item = createBriefItem({
        projectId,
        type: "VISION",
        statement: "Test Vision",
        sourceId,
        sourceSegmentId: segmentId,
        excerpt: "vision",
        confidence: 0.9,
      });
      item = rejectBriefItem(item);
      expect(item.status).toBe("REJECTED");
    });

    it("should transit to LOCKED only from ACCEPTED/CORRECTED and handle repeated lock as no-op", () => {
      const proposedItem = createBriefItem({
        projectId,
        type: "VISION",
        statement: "Test Vision",
        sourceId,
        sourceSegmentId: segmentId,
        excerpt: "vision",
        confidence: 0.9,
      });
      // 1. PROPOSED cannot be locked
      expect(() => lockBriefItem(proposedItem)).toThrow();

      // 2. REJECTED cannot be locked
      const rejectedItem = rejectBriefItem(proposedItem);
      expect(() => lockBriefItem(rejectedItem)).toThrow();

      // 3. ACCEPTED can be locked
      let acceptedItem = acceptBriefItem(proposedItem);
      let lockedItem = lockBriefItem(acceptedItem);
      expect(lockedItem.status).toBe("LOCKED");
      expect(lockedItem.version).toBe(acceptedItem.version + 1);

      // 4. CORRECTED can be locked
      let correctedItem = correctBriefItem(proposedItem, "New Correction");
      let lockedCorrected = lockBriefItem(correctedItem);
      expect(lockedCorrected.status).toBe("LOCKED");

      // 5. LOCKED repeated is a no-op (same version, same state, no throw)
      const vBefore = lockedItem.version;
      const relocked = lockBriefItem(lockedItem);
      expect(relocked.version).toBe(vBefore);
      expect(relocked.status).toBe("LOCKED");
    });

    it("should enforce immutability when LOCKED", () => {
      let item = createBriefItem({
        projectId,
        type: "VISION",
        statement: "Test Vision",
        sourceId,
        sourceSegmentId: segmentId,
        excerpt: "vision",
        confidence: 0.9,
      });
      item = acceptBriefItem(item);
      item = lockBriefItem(item);

      expect(() => acceptBriefItem(item)).toThrow();
      expect(() => correctBriefItem(item, "new")).toThrow();
      expect(() => rejectBriefItem(item)).toThrow();
    });
  });

  describe("Decision Transitions", () => {
    it("should transit to LOCKED from ACCEPTED", () => {
      let d = createDecision({
        projectId,
        title: "Architecture",
        statement: "Use React",
        rationale: "React is locked",
      });
      expect(d.status).toBe("DRAFT");
      expect(() => lockDecision(d)).toThrow(); // from DRAFT: forbidden

      d = acceptDecision(d);
      expect(d.status).toBe("ACCEPTED");

      d = lockDecision(d);
      expect(d.status).toBe("LOCKED");
    });

    it("should enforce immutability when LOCKED", () => {
      let d = createDecision({
        projectId,
        title: "Architecture",
        statement: "Use React",
        rationale: "React is locked",
      });
      d = acceptDecision(d);
      d = lockDecision(d);

      expect(() => acceptDecision(d)).toThrow();
    });
  });

  describe("Versioning & Supersession", () => {
    it("should link replacement and superseded items", () => {
      const itemA = createBriefItem({
        projectId,
        type: "VISION",
        statement: "Original Vision",
        sourceId,
        sourceSegmentId: segmentId,
        excerpt: "original",
        confidence: 0.9,
      });

      const itemB = {
        ...createBriefItem({
          projectId,
          type: "VISION",
          statement: "Superseding Vision",
          sourceId,
          sourceSegmentId: segmentId,
          excerpt: "superseding",
          confidence: 0.95,
        }),
        replaces: itemA.id,
      };

      const updatedA = {
        ...itemA,
        replacedBy: itemB.id,
        status: "REJECTED" as const,
      };

      expect(itemB.replaces).toBe(itemA.id);
      expect(updatedA.replacedBy).toBe(itemB.id);
      expect(updatedA.status).toBe("REJECTED");
    });
  });

  describe("Idempotence Transitions", () => {
    it("should remain unchanged if accepting an already ACCEPTED item", () => {
      let item = createBriefItem({
        projectId,
        type: "VISION",
        statement: "Test Vision",
        sourceId,
        sourceSegmentId: segmentId,
        excerpt: "vision",
        confidence: 0.9,
      });
      item = acceptBriefItem(item);
      const vBefore = item.version;
      const updated = acceptBriefItem(item);
      expect(updated.version).toBe(vBefore);
      expect(updated.status).toBe("ACCEPTED");
    });

    it("should remain unchanged if rejecting an already REJECTED item", () => {
      let item = createBriefItem({
        projectId,
        type: "VISION",
        statement: "Test Vision",
        sourceId,
        sourceSegmentId: segmentId,
        excerpt: "vision",
        confidence: 0.9,
      });
      item = rejectBriefItem(item);
      const vBefore = item.version;
      const updated = rejectBriefItem(item);
      expect(updated.version).toBe(vBefore);
      expect(updated.status).toBe("REJECTED");
    });

    it("should remain unchanged if locking an already LOCKED item", () => {
      let item = createBriefItem({
        projectId,
        type: "VISION",
        statement: "Test Vision",
        sourceId,
        sourceSegmentId: segmentId,
        excerpt: "vision",
        confidence: 0.9,
      });
      item = acceptBriefItem(item);
      item = lockBriefItem(item);
      const vBefore = item.version;
      const updated = lockBriefItem(item);
      expect(updated.version).toBe(vBefore);
      expect(updated.status).toBe("LOCKED");
    });

    it("should throw if correcting an item with the exact same statement", () => {
      let item = createBriefItem({
        projectId,
        type: "VISION",
        statement: "Test Vision",
        sourceId,
        sourceSegmentId: segmentId,
        excerpt: "vision",
        confidence: 0.9,
      });
      item = correctBriefItem(item, "New Statement");
      expect(() => correctBriefItem(item, "New Statement")).toThrow(
        "Aucune modification à enregistrer",
      );
    });
  });

  describe("Decision Traceability & Provenance Fields", () => {
    it("should successfully set optional source/provenance fields on Decision creation", () => {
      const sourceBriefItemId = createId();
      const sourceIdVal = createId();
      const decision = createDecision({
        projectId,
        title: "Decision Title",
        statement: "Decision Statement",
        rationale: "Decision Rationale",
        sourceBriefItemId,
        sourceId: sourceIdVal,
        sourceExcerpt: "Excerpt of source brief item",
        createdByAgentId: "DESIGN-DIRECTOR",
        affectedArtifacts: ["API_CONTRACTS"],
      });

      expect(decision.sourceBriefItemId).toBe(sourceBriefItemId);
      expect(decision.sourceId).toBe(sourceIdVal);
      expect(decision.sourceExcerpt).toBe("Excerpt of source brief item");
      expect(decision.createdByAgentId).toBe("DESIGN-DIRECTOR");
      expect(decision.affectedArtifacts).toContain("API_CONTRACTS");
    });
  });
});
