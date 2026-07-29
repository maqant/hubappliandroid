import { type DesignProposal, type FeaturePath, type EntityId, normalizeJourneySteps, computeFeatureCoverage, computePlatformConsistency } from "@pbh/domain";
import type { LogEvent } from "./analysis-log-collector";

export interface ExportBuildContext {
  project: any;
  proposals: DesignProposal[];
  paths: FeaturePath[];
  briefItems: any[];
  decisions: any[];
  rejectedItems: any[];
  deferredItems: any[];
  logs: LogEvent[];
  logSession: {
    sessionId: string;
    sessionStartedAt: string;
    isTruncated: boolean;
    entryCount: number;
  };
  logStats: {
    debug: number;
    info: number;
    warn: number;
    error: number;
    unhandledErrors: number;
    unhandledRejections: number;
  };
  appVersion: string;
  hasMapImage: boolean;
  mapImageError?: string;
  includePrompts: boolean;
  activePrompts?: any[];
}

export interface ExportFileRegistryEntry {
  fileName: string;
  role: string;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  sizeBytes?: number;
  itemCount?: number;
  error?: string;
}

export function normalizeProjectName(title?: string): string {
  if (!title) return "projet";
  let str = title.toLowerCase().trim();
  str = str.replace(/[^a-z0-9]/g, "-");
  str = str.replace(/-+/g, "-");
  str = str.replace(/^-|-$/g, "");
  return str.slice(0, 30) || "projet";
}

export function formatExportTimestamp(d = new Date()): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}-${hh}${min}`;
}

export function buildCanonicalProposals(proposals: DesignProposal[]): any[] {
  const seenIds = new Set<string>();
  const cleanList: any[] = [];

  proposals.forEach((p) => {
    if (seenIds.has(p.id)) return;
    seenIds.add(p.id);

    cleanList.push({
      id: p.id,
      projectId: p.projectId,
      layer: p.layer,
      title: p.title,
      description: p.description || "",
      shortPitch: p.shortPitch || "",
      rationale: p.rationale || "",
      status: p.status,
      targetPlatform: (p as any).targetPlatform || (p as any).targetPlatforms || "WEB",
      generationBatchId: p.generationBatchId || null,
      variationIndex: p.variationIndex ?? 0,
      sourceBatchId: (p as any).sourceBatchId || null,
      userDiversityFocus: (p as any).userDiversityFocus || null,
      parentId: p.parentId || null,
      parentProposalIds: p.parentProposalIds || [],
      dependencyIds: p.dependencyIds || [],
      relatedProposalIds: p.relatedProposalIds || [],
      mergedIntoId: p.mergedIntoId || null,
      mergeReason: p.mergeReason || null,
      linkSource: p.linkSource || "AUTOMATIC",
      layerData: p.layerData || {},
      createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: p.updatedAt ? new Date(p.updatedAt).toISOString() : new Date().toISOString(),
    });
  });

  return cleanList;
}

export function buildReadmeMd(ctx: ExportBuildContext): string {
  const p = ctx.project || {};
  const stats = calculateStats(ctx.proposals, ctx.paths);
  const now = new Date().toISOString();

  const warnings: string[] = [];
  if (!ctx.hasMapImage) {
    warnings.push(ctx.mapImageError || "La capture PNG de la cartographie n'a pas pu être générée.");
  }
  if (ctx.logs.length === 0) {
    warnings.push("Aucun log n'était disponible pour cette session.");
  }
  if (stats.orphans > 0) {
    warnings.push(`${stats.orphans} proposition(s) orpheline(s) sans parent décelée(s).`);
  }

  let md = `# Export Product Blueprint Hub (Format v2.0)\n\n`;
  md += `Projet : ${p.title || "Sans titre"}\n`;
  md += `Identifiant : ${p.id || "N/A"}\n`;
  md += `Date d’export : ${now}\n`;
  md += `Version de l’application : ${ctx.appVersion}\n`;
  md += `Version du format d'export : 2.0 (Canonique & Référentiel)\n`;
  md += `Plateforme cible : ${p.targetPlatform || "WEB_NEXTJS"}\n`;
  md += `Framework cible : ${p.targetFramework || "Next.js"}\n\n`;

  md += `## Fichiers de l'archive\n\n`;
  md += `- export-manifest.json : manifeste complet du statut et des compteurs d'export ;\n`;
  md += `- conception-complete.json : données canoniques uniques (liste plate dédupliquée) ;\n`;
  md += `- conception-lisible.md : lecture humaine complète de la conception ;\n`;
  md += `- experience-paths.json : paths d’expérience avec références d'identifiants (sans duplication) ;\n`;
  md += `- cartographie-complete.png : représentation graphique ${ctx.hasMapImage ? "succès" : "(Échouée ou non disponible)"} ;\n`;
  md += `- diagnostic-technique.json : configuration et avertissements techniques ;\n`;
  md += `- console-logs.json : événements de session structurés sans secrets ;\n`;
  md += `- console-lisible.txt : version lisible des logs ;\n`;
  if (ctx.includePrompts) {
    md += `- prompts-actifs.txt : texte intégral des prompts d'agents ;\n`;
  }

  md += `\n## Synthèse des entités\n\n`;
  md += `- Nombre d’intentions : ${stats.byLayer.INTENTION || 0}\n`;
  md += `- Nombre d’hypothèses : ${stats.byLayer.HYPOTHESIS || 0}\n`;
  md += `- Nombre de capabilities : ${stats.byLayer.CAPABILITY || 0}\n`;
  md += `- Nombre de features : ${stats.byLayer.FEATURE || 0}\n`;
  md += `- Nombre de journeys : ${stats.byLayer.JOURNEY || 0}\n`;
  md += `- Nombre de screens : ${stats.byLayer.SCREEN || 0}\n`;
  md += `- Nombre de paths : ${ctx.paths.length}\n`;
  md += `- Nombre d’orphelins : ${stats.orphans}\n`;
  md += `- Nombre d’éléments partagés : ${stats.sharedNodes}\n`;
  md += `- Nombre d’événements de log : ${ctx.logSession.entryCount}\n`;
  md += `- Statut capture cartographique : ${ctx.hasMapImage ? "SUCCESS" : "FAILED (" + (ctx.mapImageError || "N/A") + ")"}\n\n`;

  md += `## Avertissements\n\n`;
  if (warnings.length === 0) {
    md += `_Aucun avertissement majeur._\n`;
  } else {
    warnings.forEach((w) => {
      md += `- ${w}\n`;
    });
  }

  return md;
}

export function buildConceptionCompleteJson(ctx: ExportBuildContext): any {
  const p = ctx.project || {};
  const stats = calculateStats(ctx.proposals, ctx.paths);
  const canonicalProposals = buildCanonicalProposals(ctx.proposals);

  const relations: any[] = [];
  canonicalProposals.forEach((prop) => {
    if (prop.parentId) {
      const parent = canonicalProposals.find((x) => x.id === prop.parentId);
      relations.push({
        sourceId: prop.parentId,
        targetId: prop.id,
        relationType: "PARENT_DIRECT",
        sourceLayer: parent?.layer || "UNKNOWN",
        targetLayer: prop.layer,
        sourceTitle: parent?.title || "Parent",
        targetTitle: prop.title,
        linkSource: prop.linkSource || "AUTOMATIC",
      });
    }
    (prop.parentProposalIds || []).forEach((pid: string) => {
      if (pid !== prop.parentId) {
        const parent = canonicalProposals.find((x) => x.id === pid);
        relations.push({
          sourceId: pid,
          targetId: prop.id,
          relationType: "MULTI_PARENT",
          sourceLayer: parent?.layer || "UNKNOWN",
          targetLayer: prop.layer,
          sourceTitle: parent?.title || "Parent",
          targetTitle: prop.title,
          linkSource: prop.linkSource || "AUTOMATIC",
        });
      }
    });
    (prop.dependencyIds || []).forEach((depId: string) => {
      const dep = canonicalProposals.find((x) => x.id === depId);
      relations.push({
        sourceId: depId,
        targetId: prop.id,
        relationType: "DEPENDENCY",
        sourceLayer: dep?.layer || "UNKNOWN",
        targetLayer: prop.layer,
        sourceTitle: dep?.title || "Dépendance",
        targetTitle: prop.title,
        linkSource: "EXPLICIT",
      });
    });
  });

  return {
    exportMetadata: {
      exportVersion: "2.0",
      applicationVersion: ctx.appVersion,
      exportedAt: new Date().toISOString(),
      projectId: p.id || "",
      projectTitle: p.title || "",
      targetPlatform: p.targetPlatform || "WEB_NEXTJS",
      targetFramework: p.targetFramework || "Next.js",
    },
    project: {
      id: p.id,
      title: p.title,
      sourceText: p.sourceText || "",
      confirmedBriefItems: ctx.briefItems || [],
      lockedDecisions: ctx.decisions || [],
      rejectedItems: ctx.rejectedItems || [],
      deferredItems: ctx.deferredItems || [],
    },
    statistics: stats,
    proposals: canonicalProposals,
    relations,
    warnings: [],
  };
}

export function buildConceptionLisibleMd(ctx: ExportBuildContext): string {
  const p = ctx.project || {};
  const projectTitle = p.name || p.title || "Projet";
  const canonicalProposals = buildCanonicalProposals(ctx.proposals);

  let md = `# Conception assistée — ${projectTitle}\n\n`;
  md += `## Projet\n\n`;
  md += `- Titre : ${projectTitle}\n`;
  md += `- Plateforme : ${p.targetPlatform || "WEB_NEXTJS"}\n`;
  md += `- Framework : ${p.targetFramework || "Next.js"}\n`;
  md += `- Source initiale : ${p.sourceText ? p.sourceText.slice(0, 200) + "..." : "Non renseignée"}\n\n`;

  md += `## Synthèse quantitative\n\n`;
  md += `Total propositions canoniques : **${canonicalProposals.length}**\n\n`;
  md += `| Couche | Total | Acceptées | Proposées | Refusées | Reportées | Fusionnées (SUPERSEDED) |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;

  const layers = ["INTENTION", "HYPOTHESIS", "CAPABILITY", "FEATURE", "JOURNEY", "SCREEN"];
  layers.forEach((l) => {
    const props = canonicalProposals.filter((x) => x.layer === l);
    const acc = props.filter((x) => x.status === "ACCEPTED").length;
    const prp = props.filter((x) => x.status === "PROPOSED").length;
    const rej = props.filter((x) => x.status === "REJECTED").length;
    const def = props.filter((x) => x.status === "DEFERRED").length;
    const sup = props.filter((x) => x.status === "SUPERSEDED").length;
    md += `| ${l} | ${props.length} | ${acc} | ${prp} | ${rej} | ${def} | ${sup} |\n`;
  });
  md += `\n`;

  layers.forEach((layer) => {
    const items = canonicalProposals.filter((x) => x.layer === layer);
    md += `## ${layer}S (${items.length})\n\n`;
    if (items.length === 0) {
      md += `_Aucun élément dans cette couche._\n\n`;
      return;
    }
    items.forEach((item) => {
      md += `### ${item.title}\n\n`;
      md += `- ID : \`${item.id}\`\n`;
      md += `- Statut : **${item.status}**\n`;
      if (item.mergedIntoId) md += `- Fusionné dans : \`${item.mergedIntoId}\` (${item.mergeReason || 'SUPERSEDED'})\n`;
      if (item.shortPitch) md += `- Pitch : ${item.shortPitch}\n`;
      if (item.description) md += `- Description : ${item.description}\n`;
      if (item.rationale) md += `- Justification : ${item.rationale}\n`;
      if (item.parentId) md += `- Parent direct : \`${item.parentId}\`\n`;

      if (layer === "JOURNEY" && item.layerData) {
        const steps = normalizeJourneySteps(item.layerData);
        if (steps.length > 0) {
          md += `\n#### Étapes du Parcours\n\n`;
          steps.forEach((st: any, idx: number) => {
            md += `${st.order || idx + 1}. **${st.userAction || st.action || "Action"}**\n`;
            if (st.visibleInformation) md += `   - Informations visibles : ${st.visibleInformation}\n`;
            if (st.systemResponse || st.outcome) md += `   - Réponse système / Résultat : ${st.outcome || st.systemResponse}\n`;
            if (st.featureIds && st.featureIds.length > 0) md += `   - Features mobilisées : ${st.featureIds.join(", ")}\n`;
          });
        }
      }
      md += `\n`;
    });
  });

  md += `## EXPERIENCE PATHS (${ctx.paths.length})\n\n`;
  ctx.paths.forEach((path, idx) => {
    md += `### Path ${idx + 1} : ${path.title}\n\n`;
    md += `- ID : \`${path.id}\`\n`;
    md += `- Objectif utilisateur : ${path.userGoal}\n`;
    md += `- Statut : **${path.status}** (${path.completeness}% complet)\n`;
    md += `- Composition : ${path.featureIds.length} features, ${path.journeyIds.length} journeys, ${path.screenIds.length} screens\n\n`;
  });

  return md;
}

export function buildExperiencePathsJson(ctx: ExportBuildContext): any {
  // Strip nested full proposal objects from paths, replace with lightweight ID references
  const lightweightPaths = ctx.paths.map((p) => {
    return {
      id: p.id,
      title: p.title,
      userGoal: p.userGoal,
      entryPoint: p.entryPoint,
      finalOutcome: p.finalOutcome,
      primaryJourneyId: p.primaryJourneyId,
      status: p.status,
      completeness: p.completeness,
      intentionIds: p.intentionIds,
      hypothesisIds: p.hypothesisIds,
      capabilityIds: p.capabilityIds,
      featureIds: p.featureIds,
      journeyIds: p.journeyIds,
      screenIds: p.screenIds,
      canonicalNodeIds: p.canonicalNodeIds,
      stepReferences: p.stepReferences,
      warnings: p.warnings,
      // Referenced lightweight nodes (no nested proposals!)
      features: p.features.map(f => ({ proposalId: f.proposal.id, isShared: f.isShared })),
      journeys: p.journeys.map(j => ({ proposalId: j.proposal.id, isShared: j.isShared })),
      screens: p.screens.map(s => ({ proposalId: s.proposal.id, isShared: s.isShared })),
    };
  });

  return {
    exportFormatVersion: "2.0",
    exportedAt: new Date().toISOString(),
    projectId: ctx.project?.id || "",
    pathCount: lightweightPaths.length,
    paths: lightweightPaths,
  };
}

export function buildDiagnosticTechniqueJson(ctx: ExportBuildContext): any {
  const stats = calculateStats(ctx.proposals, ctx.paths);
  const orphans = ctx.proposals.filter((p) => p.layer !== "INTENTION" && !p.parentId && (!p.parentProposalIds || p.parentProposalIds.length === 0));
  const coverage = computeFeatureCoverage(ctx.proposals);

  const batchMap = new Map<string, any>();
  (ctx.proposals || []).forEach((p) => {
    if (p.generationBatchId) {
      if (!batchMap.has(p.generationBatchId)) {
        batchMap.set(p.generationBatchId, {
          generationBatchId: p.generationBatchId,
          layer: p.layer,
          generationMode: (p as any).generationMode || 'INITIAL',
          variationIndex: p.variationIndex ?? 0,
          sourceBatchId: (p as any).sourceBatchId || null,
          diversityFocus: (p as any).userDiversityFocus || null,
          proposalCount: 0,
          acceptedCount: 0,
          rejectedCount: 0,
          deferredCount: 0,
          replacedCount: 0,
          createdAt: (p as any).generatedAt || p.createdAt || new Date().toISOString(),
        });
      }
      const b = batchMap.get(p.generationBatchId);
      b.proposalCount++;
      if (p.status === "ACCEPTED") b.acceptedCount++;
      if (p.status === "REJECTED") b.rejectedCount++;
      if (p.status === "DEFERRED") b.deferredCount++;
    }
  });

  return {
    exportFormatVersion: "2.0",
    applicationVersion: ctx.appVersion,
    exportedAt: new Date().toISOString(),
    projectId: ctx.project?.id || "",
    generationConfiguration: {
      provider: "ModelGateway",
      targetPlatform: ctx.project?.targetPlatform || "WEB_NEXTJS",
      targetFramework: ctx.project?.targetFramework || "Next.js",
    },
    activePrompts: ctx.activePrompts || [],
    generationStatistics: stats,
    featureCoverage: coverage,
    generationBatches: Array.from(batchMap.values()),
    warnings: ctx.hasMapImage ? [] : ["PNG_CAPTURE_FAILED"],
    errors: ctx.mapImageError ? [ctx.mapImageError] : [],
    orphanNodes: orphans.map((o) => ({ id: o.id, title: o.title, layer: o.layer })),
    sharedNodes: stats.sharedNodeDetails,
  };
}

export function buildExportManifestJson(
  ctx: ExportBuildContext,
  fileRegistry: ExportFileRegistryEntry[],
  overallStatus: 'SUCCESS' | 'PARTIAL' | 'FAILED',
  cartographyCaptureStatus: { status: 'SUCCESS' | 'FAILED' | 'SKIPPED'; reason?: string; details?: string }
): any {
  const canonicalProposals = buildCanonicalProposals(ctx.proposals);
  const coverage = computeFeatureCoverage(ctx.proposals);

  const layerCounts: Record<string, number> = {};
  canonicalProposals.forEach(p => {
    layerCounts[p.layer] = (layerCounts[p.layer] || 0) + 1;
  });

  const platformDiagnostic = computePlatformConsistency(ctx.project, ctx.proposals);

  return {
    exportFormatVersion: "2.0",
    projectId: ctx.project?.id || "",
    projectName: ctx.project?.title || "",
    generatedAt: new Date().toISOString(),
    applicationVersion: ctx.appVersion,
    overallStatus,
    files: fileRegistry,
    entityCounts: {
      totalCanonicalProposals: canonicalProposals.length,
      intentionsCount: layerCounts.INTENTION || 0,
      hypothesesCount: layerCounts.HYPOTHESIS || 0,
      capabilitiesCount: layerCounts.CAPABILITY || 0,
      featuresCount: layerCounts.FEATURE || 0,
      journeysCount: layerCounts.JOURNEY || 0,
      screensCount: layerCounts.SCREEN || 0,
      pathsCount: ctx.paths.length,
      decisionsCount: ctx.decisions.length,
      briefItemsCount: ctx.briefItems.length,
      logEntriesCount: ctx.logs.length,
    },
    featureCoverage: {
      coverageRate: coverage.coverageRate,
      coveredCount: coverage.coveredCount,
      partiallyCoveredCount: coverage.partiallyCoveredCount,
      orphanCount: coverage.orphanCount,
      excludedCount: coverage.excludedCount,
      totalEligibleFeatures: coverage.totalFeatures,
    },
    platformDiagnostic: {
      canonicalPlatform: platformDiagnostic.canonicalPlatform,
      status: platformDiagnostic.status,
      incompatibleCount: platformDiagnostic.incompatibleCount,
      incompatibleProposalIds: platformDiagnostic.incompatibleProposalIds,
      conflictingSources: platformDiagnostic.conflictingSources,
      warnings: platformDiagnostic.warnings,
      recommendation: platformDiagnostic.recommendation,
    },
    cartographyCaptureStatus,
    warnings: ctx.hasMapImage ? [] : [cartographyCaptureStatus.reason || "PNG_CAPTURE_FAILED"],
    errors: ctx.mapImageError ? [ctx.mapImageError] : [],
  };
}

export function buildConsoleLogsJson(ctx: ExportBuildContext): any {
  return {
    exportedAt: new Date().toISOString(),
    session: ctx.logSession,
    statistics: ctx.logStats,
    entries: ctx.logs,
  };
}

export function buildConsoleLisibleTxt(ctx: ExportBuildContext): string {
  let txt = `PRODUCT BLUEPRINT HUB\nLOGS DE SESSION\n\n`;
  txt += `Projet : ${ctx.project?.title || "N/A"}\n`;
  txt += `Version : ${ctx.appVersion}\n`;
  txt += `Session : ${ctx.logSession.sessionId}\n`;
  txt += `Début : ${ctx.logSession.sessionStartedAt}\n`;
  txt += `Date d’export : ${new Date().toISOString()}\n`;
  txt += `Nombre total : ${ctx.logSession.entryCount}\n`;
  txt += `DEBUG : ${ctx.logStats.debug}\n`;
  txt += `INFO : ${ctx.logStats.info}\n`;
  txt += `WARN : ${ctx.logStats.warn}\n`;
  txt += `ERROR : ${ctx.logStats.error}\n`;
  txt += `Logs tronqués : ${ctx.logSession.isTruncated ? "OUI" : "NON"}\n\n`;
  txt += `================================================================================\n\n`;

  ctx.logs.forEach((e) => {
    txt += `[${e.timestamp}] [${e.level}] [${e.category}] ${e.operation ? `[${e.operation}]` : ""}\n`;
    txt += `${e.message}\n`;
    if (e.error) {
      txt += `Error: ${e.error.name} - ${e.error.message}\n`;
      if (e.error.stack) txt += `Stack: ${e.error.stack}\n`;
    }
    if (e.context && Object.keys(e.context).length > 0) {
      txt += `Context: ${JSON.stringify(e.context)}\n`;
    }
    txt += `\n`;
  });

  return txt;
}

export function buildPromptsActifsTxt(ctx: ExportBuildContext): string {
  let txt = `PRODUCT BLUEPRINT HUB — PROMPTS ACTIFS\n\n`;
  if (!ctx.activePrompts || ctx.activePrompts.length === 0) {
    txt += `Aucun prompt actif n'a pu être chargé.\n`;
    return txt;
  }

  ctx.activePrompts.forEach((p: any) => {
    txt += `================================================================================\n`;
    txt += `AGENT : ${p.agentId || p.promptId}\n`;
    txt += `PROMPT ID : ${p.promptId}\n`;
    txt += `VERSION : ${p.version}\n`;
    txt += `COUCHE : ${p.layer || "GLOBAL"}\n`;
    txt += `--------------------------------------------------------------------------------\n`;
    txt += `[SYSTEM PROMPT]\n${p.systemPrompt || "N/A"}\n\n`;
    txt += `[USER TEMPLATE]\n${p.userPromptTemplate || "N/A"}\n\n`;
  });

  return txt;
}

function calculateStats(proposals: DesignProposal[], paths: FeaturePath[]) {
  const byLayer: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  let orphans = 0;

  const usageCounts = new Map<EntityId, number>();

  paths.forEach((path) => {
    path.canonicalNodeIds.forEach((cid) => {
      usageCounts.set(cid, (usageCounts.get(cid) || 0) + 1);
    });
  });

  let sharedNodes = 0;
  const sharedNodeDetails: any[] = [];

  proposals.forEach((p) => {
    byLayer[p.layer] = (byLayer[p.layer] || 0) + 1;
    byStatus[p.status] = (byStatus[p.status] || 0) + 1;

    if (p.layer !== "INTENTION" && !p.parentId && (!p.parentProposalIds || p.parentProposalIds.length === 0)) {
      orphans++;
    }

    const count = usageCounts.get(p.id) || 1;
    if (count > 1) {
      sharedNodes++;
      sharedNodeDetails.push({ id: p.id, title: p.title, layer: p.layer, usageCount: count });
    }
  });

  return {
    totalProposals: proposals.length,
    byLayer,
    byStatus,
    sharedNodes,
    sharedNodeDetails,
    orphans,
    needsReview: proposals.filter((x) => (x as any).reviewState === "NEEDS_REVIEW").length,
  };
}
