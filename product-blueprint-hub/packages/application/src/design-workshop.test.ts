import { describe, it, expect, vi } from "vitest";
import { DesignWorkshopUseCases } from "./design-workshop";
import { createDesignProposal, DesignProposal, EntityId } from "@pbh/domain";

describe("DesignWorkshopUseCases v0.15.0", () => {
  const mockProposals: DesignProposal[] = [];

  const mockRepos = {
    designProposals: {
      getByProjectId: vi.fn().mockResolvedValue(mockProposals),
      getByLayer: vi.fn().mockImplementation(async (pid, layer) => mockProposals.filter(p => p.layer === layer)),
      getById: vi.fn().mockImplementation(async (id) => mockProposals.find(p => p.id === id)),
      save: vi.fn().mockImplementation(async (prop) => {
        const idx = mockProposals.findIndex(p => p.id === prop.id);
        if (idx >= 0) mockProposals[idx] = prop;
        else mockProposals.push(prop);
      })
    },
    prompts: {
      getActivePrompt: vi.fn().mockResolvedValue({ id: "prompt-1", version: "v1", systemPrompt: "Sys" })
    }
  } as any;

  const mockProvider = {
    complete: vi.fn()
  } as any;

  const useCases = new DesignWorkshopUseCases(mockRepos, mockProvider);

  it("TEST B: Un JOURNEY unique utilise au moins trois FEATURE", async () => {
    mockProposals.length = 0; // reset
    const projectId = "proj-B" as EntityId;
    const cap = createDesignProposal({ projectId, layer: "CAPABILITY", title: "Cap", status: "ACCEPTED" });
    const f1 = createDesignProposal({ projectId, layer: "FEATURE", title: "F1", parentId: cap.id, status: "ACCEPTED" });
    const f2 = createDesignProposal({ projectId, layer: "FEATURE", title: "F2", parentId: cap.id, status: "ACCEPTED" });
    const f3 = createDesignProposal({ projectId, layer: "FEATURE", title: "F3", parentId: cap.id, status: "ACCEPTED" });
    
    mockProposals.push(cap, f1, f2, f3);

    const journeys = await useCases.composeFeaturesIntoJourneyContexts(projectId);
    
    expect(journeys.length).toBe(1);
    const j = journeys[0]!;
    const data = j.layerData as any;
    expect(data.usedFeatureIds).toContain(f1.id);
    expect(data.usedFeatureIds).toContain(f2.id);
    expect(data.usedFeatureIds).toContain(f3.id);
    expect(data.usedFeatureIds.length).toBe(3);
    expect(data.steps.length).toBe(3);
  });

  it("TEST C: Un SCREEN canonique unique est partagé par deux JOURNEY", async () => {
    mockProposals.length = 0;
    const projectId = "proj-C" as EntityId;
    
    const f1 = createDesignProposal({ projectId, layer: "FEATURE", title: "F1", status: "ACCEPTED" });
    const s1 = createDesignProposal({ projectId, layer: "SCREEN", title: "Screen 1", status: "ACCEPTED", layerData: { exposedFeatureIds: [f1.id] } as any });
    
    const j1 = createDesignProposal({ projectId, layer: "JOURNEY", title: "J1", status: "ACCEPTED", layerData: { steps: [{ featureIds: [f1.id] }] } as any });
    const j2 = createDesignProposal({ projectId, layer: "JOURNEY", title: "J2", status: "ACCEPTED", layerData: { steps: [{ featureIds: [f1.id] }] } as any });

    mockProposals.push(f1, s1, j1, j2);

    const screens = await useCases.materializeJourneyStepsIntoScreens(projectId);
    
    // No new screen created because it reuses s1
    expect(screens.length).toBe(0);
    
    const updatedS1 = mockProposals.find(p => p.id === s1.id)!;
    expect(updatedS1.parentProposalIds).toContain(j1.id);
    expect(updatedS1.parentProposalIds).toContain(j2.id);
    
    // Check paths to see if sharedUsageCount is correct
    const ctx = await useCases.getNodePathContext(projectId, s1.id);
    expect(ctx.sharedUsageCount).toBe(2);
  });

  it("TEST F: Approfondir produit réellement au moins une proposition valide", async () => {
    mockProposals.length = 0;
    const projectId = "proj-F" as EntityId;
    const feat = createDesignProposal({ projectId, layer: "FEATURE", title: "Feat F", status: "PROPOSED" });
    mockProposals.push(feat);

    mockProvider.complete.mockResolvedValueOnce({
      content: JSON.stringify({
        proposals: [{ title: "Journey 1 generated", description: "Desc 1" }]
      })
    });

    const result = await useCases.startDeepIdeationSwarm(projectId, feat.id, "expand");
    
    expect(result.proposals.length).toBe(1);
    expect(result.diagnostic.persistenceCount).toBe(1);
    expect(result.diagnostic.persistedProposalIds.length).toBe(1);
    expect(result.proposals[0]!.layer).toBe("JOURNEY"); // FEATURE expands to JOURNEY
  });

  it("TEST G: Alternatives produit réellement au moins deux variantes de la même couche", async () => {
    mockProposals.length = 0;
    const projectId = "proj-G" as EntityId;
    const feat = createDesignProposal({ projectId, layer: "FEATURE", title: "Feat G", status: "PROPOSED" });
    mockProposals.push(feat);

    mockProvider.complete.mockResolvedValueOnce({
      content: JSON.stringify({
        proposals: [
          { title: "Alt 1", description: "Desc Alt 1" },
          { title: "Alt 2", description: "Desc Alt 2" }
        ]
      })
    });

    const result = await useCases.startDeepIdeationSwarm(projectId, feat.id, "alternatives");
    
    expect(result.proposals.length).toBe(2);
    expect(result.diagnostic.persistenceCount).toBe(2);
    expect(result.proposals[0]!.layer).toBe("FEATURE"); // alternative stays on the same layer
    expect(result.proposals[1]!.layer).toBe("FEATURE");
  });

  it("TEST I: Une action effectuée depuis une référence visuelle modifie la DesignProposal canonique", async () => {
    mockProposals.length = 0;
    const projectId = "proj-I" as EntityId;
    const feat = createDesignProposal({ projectId, layer: "FEATURE", title: "Feat I", status: "PROPOSED" });
    const journey = createDesignProposal({ projectId, layer: "JOURNEY", title: "Journey I", status: "ACCEPTED", layerData: { steps: [{ featureIds: [feat.id] }] } as any, parentProposalIds: [feat.id] });
    mockProposals.push(feat, journey);

    // Arbitrate via canonicalId
    const res = await useCases.arbitratePath(projectId, feat.id, "ACCEPT_PROPOSED");
    expect(res.updatedCount).toBeGreaterThan(0);

    const updated = mockProposals.find(p => p.id === feat.id);
    expect(updated?.status).toBe("ACCEPTED");
  });
});
