import { describe, it, expect } from "vitest";
import { createDesignProposal, DesignProposal } from "./design-proposals";
import { computeFeaturePaths } from "./feature-paths";

describe("computeFeaturePaths v0.15.0", () => {
  it("TEST A & D: Calcul d'un Path autonome sans duplication de persistance", () => {
    const projectId = "proj-1" as any;

    const cap = createDesignProposal({
      projectId,
      layer: "CAPABILITY",
      title: "Gestion des Comptes Utilisateurs",
      description: "Permet la gestion des comptes",
      status: "ACCEPTED",
    });

    const feat1 = createDesignProposal({
      projectId,
      layer: "FEATURE",
      title: "Connexion OAuth2",
      description: "Connexion via Google/GitHub",
      parentId: cap.id,
      status: "ACCEPTED",
    });

    const feat2 = createDesignProposal({
      projectId,
      layer: "FEATURE",
      title: "Gestion du Profil",
      description: "Modification du profil utilisateur",
      parentId: cap.id,
      status: "ACCEPTED",
    });

    const journey = createDesignProposal({
      projectId,
      layer: "JOURNEY",
      title: "Parcours d'Authentification et Configuration",
      description: "L'utilisateur se connecte et configure son profil",
      parentId: feat1.id,
      parentProposalIds: [feat1.id, feat2.id],
      layerData: {
        goal: "Réussir son onboarding",
        trigger: "Clic sur Connexion",
        expectedOutcome: "Profil configuré",
        steps: [
          { stepNumber: 1, userAction: "Saisir identifiants", featureIds: [feat1.id] },
          { stepNumber: 2, userAction: "Compléter profil", featureIds: [feat2.id] }
        ]
      } as any,
      status: "ACCEPTED",
    });

    const screen = createDesignProposal({
      projectId,
      layer: "SCREEN",
      title: "Écran Tableau de Bord Profil",
      description: "Vue du profil utilisateur",
      parentId: journey.id,
      status: "ACCEPTED",
    });

    const proposals: DesignProposal[] = [cap, feat1, feat2, journey, screen];
    const paths = computeFeaturePaths(proposals);

    expect(paths.length).toBe(1);
    const path = paths[0]!;

    expect(path.primaryJourneyId).toBe(journey.id);
    expect(path.featureIds).toContain(feat1.id);
    expect(path.featureIds).toContain(feat2.id);
    expect(path.screenIds).toContain(screen.id);
    expect(path.stepReferences.length).toBe(2);
    expect(path.completeness).toBeGreaterThanOrEqual(80);
  });

  it("TEST E: Rétrocompatibilité avec un ancien JOURNEY sans steps", () => {
    const projectId = "proj-2" as any;

    const journey = createDesignProposal({
      projectId,
      layer: "JOURNEY",
      title: "Ancien Parcours sans Étapes",
      description: "Parcours hérité V0.13",
      status: "PROPOSED",
    });

    const proposals: DesignProposal[] = [journey];
    const paths = computeFeaturePaths(proposals);

    expect(paths.length).toBe(1);
    const path = paths[0]!;
    expect(path.status).toBe("INCOMPLETE");
    expect(path.warnings).toContain("Parcours sans étapes structurées.");
  });
});
