import { describe, it, expect } from "vitest";
import { createDesignProposal, DesignProposal, normalizeJourneySteps } from "./design-proposals";
import { computeFeaturePaths, projectFeaturePathsToVisualNodes } from "./feature-paths";

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

  it("TEST H: Projections utilisent les mêmes canonicalNodeId mais des projectionId distincts si partagés", () => {
    const projectId = "proj-H" as any;
    const feat = createDesignProposal({ projectId, layer: "FEATURE", title: "F1", status: "ACCEPTED" });
    const j1 = createDesignProposal({ projectId, layer: "JOURNEY", title: "J1", parentProposalIds: [feat.id], layerData: { steps: [{ featureIds: [feat.id] }] } as any, status: "ACCEPTED" });
    const j2 = createDesignProposal({ projectId, layer: "JOURNEY", title: "J2", parentProposalIds: [feat.id], layerData: { steps: [{ featureIds: [feat.id] }] } as any, status: "ACCEPTED" });
    
    const proposals = [feat, j1, j2];
    const paths = computeFeaturePaths(proposals);
    const visualNodes = projectFeaturePathsToVisualNodes(paths, proposals);

    // feat is shared between j1 and j2 (so 2 paths)
    const featNodes = visualNodes.filter(n => n.canonicalNodeId === feat.id);
    expect(featNodes.length).toBe(2);
    expect(featNodes[0]!.projectionId).not.toBe(featNodes[1]!.projectionId);
    expect(featNodes[0]!.isShared).toBe(true);
    
    // Check that canonical is identical
    expect(featNodes[0]!.canonicalNodeId).toBe(featNodes[1]!.canonicalNodeId);
  });
});

describe("normalizeJourneySteps (Chantier 5)", () => {
  it("normalise correctement un format canonique steps avec objets", () => {
    const res = normalizeJourneySteps({
      steps: [
        { userAction: "Clic sur Exporter", featureIds: ["f1"] },
        { action: "Téléchargement du fichier", outcome: "Fichier prêt" }
      ]
    });
    expect(res.length).toBe(2);
    expect(res[0]!.userAction).toBe("Clic sur Exporter");
    expect(res[0]!.order).toBe(1);
    expect(res[1]!.userAction).toBe("Téléchargement du fichier");
    expect(res[1]!.outcome).toBe("Fichier prêt");
  });

  it("normalise correctement les formats historiques step et actions", () => {
    const resStep = normalizeJourneySteps({ step: { label: "Connexion utilisateur" } });
    expect(resStep.length).toBe(1);
    expect(resStep[0]!.userAction).toBe("Connexion utilisateur");

    const resActions = normalizeJourneySteps({ actions: ["Saisir email", "Cliquer valider"] });
    expect(resActions.length).toBe(2);
    expect(resActions[0]!.userAction).toBe("Saisir email");
    expect(resActions[1]!.userAction).toBe("Cliquer valider");
  });

  it("donne la priorité à la vraie action avant le fallback Étape N", () => {
    const res = normalizeJourneySteps({
      steps: [{ title: "Intitulé rédigé" }, {}]
    });
    expect(res[0]!.userAction).toBe("Intitulé rédigé");
    expect(res[1]!.userAction).toBe("Étape 2");
  });
});
