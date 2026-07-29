import { DesignLayer, DesignProposal, TargetPlatform, createDesignProposal, computeFeaturePaths } from "@pbh/domain";
import type { EntityId, DesignGraph, DesignBaseline, DesignBaselineSummary, WeavingEdge, LinkSource } from "@pbh/domain";
import { createDesignGraph, createId } from "@pbh/domain";
import type { RepositoryRegistry } from "@pbh/repositories";
import type { IModelProvider } from "@pbh/model-gateway";
import { safeParseModelJson } from "@pbh/model-gateway";

// ============================================================
// STOP WORDS pour TF-IDF lexical (FR + EN, sans dépendance)
// ============================================================
const STOP_WORDS = new Set([
  'le','la','les','de','des','du','un','une','et','ou','pour','avec',
  'dans','sur','par','au','aux','ce','qui','que','qu','en','se','si',
  'the','a','an','of','to','and','or','in','for','on','at','is','it',
  'its','are','was','be','as','by','we','us','our',
]);

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));
}

function scoreSimilarity(
  candidateTokens: string[],
  upstreamDocs: Map<string, string[]>
): Array<{ id: string; score: number }> {
  const N = upstreamDocs.size;
  if (N === 0 || candidateTokens.length === 0) return [];

  // IDF
  const df = new Map<string, number>();
  upstreamDocs.forEach(tokens => {
    const unique = new Set(tokens);
    unique.forEach(t => df.set(t, (df.get(t) ?? 0) + 1));
  });
  const idf = (t: string) => Math.log((N + 1) / (1 + (df.get(t) ?? 0)));

  // Vecteur candidat TF-IDF
  const candidateFreq = new Map<string, number>();
  candidateTokens.forEach(t => candidateFreq.set(t, (candidateFreq.get(t) ?? 0) + 1));
  const candidateVec = new Map<string, number>();
  candidateFreq.forEach((freq, t) => candidateVec.set(t, (freq / candidateTokens.length) * idf(t)));

  // Similarité cosinus pour chaque document amont
  const results: Array<{ id: string; score: number }> = [];
  upstreamDocs.forEach((tokens, id) => {
    const freq = new Map<string, number>();
    tokens.forEach(t => freq.set(t, (freq.get(t) ?? 0) + 1));

    let dot = 0, normDoc = 0, normCand = 0;
    const allTerms = new Set([...candidateVec.keys(), ...freq.keys()]);
    allTerms.forEach(t => {
      const c = candidateVec.get(t) ?? 0;
      const d = ((freq.get(t) ?? 0) / tokens.length) * idf(t);
      dot += c * d;
      normCand += c * c;
      normDoc += d * d;
    });
    const score = normCand > 0 && normDoc > 0
      ? dot / (Math.sqrt(normCand) * Math.sqrt(normDoc))
      : 0;
    results.push({ id, score });
  });

  return results.sort((a, b) => b.score - a.score);
}

const AUTO_MATCH_THRESHOLD = 0.12;

interface ParsedProposal { title: string; description?: string; parentId?: string; dependencies?: string[]; [key: string]: any; }

interface LinkResolution {
  parentId: string | null;
  lineage: string[];
  linkSource: LinkSource;
  linkConfidence: number | null;
}

function resolveProposalLinks(
  aiProposal: ParsedProposal,
  upstream: DesignProposal[]
): LinkResolution {
  const validIds = new Set(upstream.map(u => u.id));

  // CAS 1 — L'IA a fourni un parentId VALIDE (anti-hallucination)
  if (aiProposal.parentId && validIds.has(aiProposal.parentId as EntityId)) {
    const parent = upstream.find(u => u.id === aiProposal.parentId)!;
    return {
      parentId: parent.id,
      lineage: [...(parent.lineage ?? []), parent.id],
      linkSource: 'AI',
      linkConfidence: null,
    };
  }

  // CAS 2 — parentId absent ou halluciné → matching lexical TF-IDF
  const candidateTokens = tokenize(`${aiProposal.title} ${aiProposal.description ?? ''}`);
  const docs = new Map(upstream.map(u => [u.id, tokenize(`${u.title} ${u.description ?? ''}`)]));
  const ranked = scoreSimilarity(candidateTokens, docs);
  const best = ranked[0];

  if (best && best.score >= AUTO_MATCH_THRESHOLD) {
    const parent = upstream.find(u => u.id === best.id)!;
    return {
      parentId: parent.id,
      lineage: [...(parent.lineage ?? []), parent.id],
      linkSource: 'AUTO_MATCHED',
      linkConfidence: Math.round(best.score * 100) / 100,
    };
  }

  // CAS 3 — Aucun match fiable → orphelin tracé
  return { parentId: null, lineage: [], linkSource: null, linkConfidence: null };
}

// ============================================================
// Type pour la preview du contexte amont (usage UI)
// ============================================================
export interface UpstreamContextPreview {
  layer: DesignLayer;
  upstreamLayers: DesignLayer[];
  items: Array<{
    id: string;
    layer: DesignLayer;
    title: string;
    status: string;
  }>;
  hasUpstream: boolean;
}

export const DIVERGENCE_AXES = [
  "simplicité d'usage",
  "automatisation",
  "personnalisation",
  "accessibilité",
  "fonctionnement hors ligne",
  "réduction des actions répétitives",
  "prévention des erreurs",
  "collaboration",
  "transparence utilisateur",
  "rapidité",
  "contrôle utilisateur",
  "résilience",
  "usages occasionnels",
  "usages fréquents",
  "cas limites",
  "mutualisation"
];

function normalizeSimple(text: string): string {
  return (text || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

export function checkForDuplicateProposal(
  candidate: { title: string; description?: string; shortPitch?: string; parentId?: string | null; parentProposalIds?: string[] },
  existingProposals: DesignProposal[]
): { isDuplicate: boolean; level: 'CERTAIN' | 'PROBABLE' | 'NONE'; reason?: string } {
  const candTitleNorm = normalizeSimple(candidate.title);
  const candPitchNorm = candidate.shortPitch ? normalizeSimple(candidate.shortPitch) : candTitleNorm;
  const candTokens = tokenize(`${candidate.title} ${candidate.description || ''} ${candidate.shortPitch || ''}`);
  const candTokenSet = new Set(candTokens);

  for (const existing of existingProposals) {
    const exTitleNorm = normalizeSimple(existing.title);
    const exPitchNorm = existing.shortPitch ? normalizeSimple(existing.shortPitch) : exTitleNorm;
    
    const sameParent = (candidate.parentId && candidate.parentId === existing.parentId) ||
      (candidate.parentProposalIds && candidate.parentProposalIds.some(p => existing.parentProposalIds?.includes(p as EntityId)));

    // Level 1: Certain Duplicate
    if (candTitleNorm === exTitleNorm && (sameParent || candidate.parentId === existing.parentId)) {
      return { isDuplicate: true, level: 'CERTAIN', reason: `Titre identique ("${existing.title}") pour le même parent` };
    }
    if (candPitchNorm === exPitchNorm && sameParent) {
      return { isDuplicate: true, level: 'CERTAIN', reason: `Pitch identique ("${existing.title}") pour le même parent` };
    }
    if (candTitleNorm.length > 5 && candTitleNorm === exTitleNorm) {
      return { isDuplicate: true, level: 'CERTAIN', reason: `Titre identique ("${existing.title}")` };
    }

    // Level 2: Probable Duplicate
    const exTokens = tokenize(`${existing.title} ${existing.description || ''} ${existing.shortPitch || ''}`);
    const exTokenSet = new Set(exTokens);

    if (candTokenSet.size > 0 && exTokenSet.size > 0) {
      let common = 0;
      candTokenSet.forEach(t => { if (exTokenSet.has(t)) common++; });
      const jaccard = common / new Set([...candTokenSet, ...exTokenSet]).size;
      if (jaccard >= 0.75) {
        return { isDuplicate: true, level: 'PROBABLE', reason: `Proximité sémantique (${Math.round(jaccard*100)}%) avec "${existing.title}"` };
      }
    }
  }

  return { isDuplicate: false, level: 'NONE' };
}

export interface GenerateProposalsOptions {
  generationMode?: 'INITIAL' | 'VARIATION' | 'REPLACEMENT';
  sourceBatchId?: string | null;
  userDiversityFocus?: string | null;
  onLog?: (event: { message: string; category: string; context?: any }) => void;
}

export class DesignWorkshopUseCases {
  constructor(
    private readonly repos: RepositoryRegistry,
    private readonly provider: IModelProvider
  ) {}

  async getProposals(projectId: EntityId, layer: DesignLayer): Promise<DesignProposal[]> {
    return this.repos.designProposals.getByLayer(projectId, layer);
  }

// Selection des parents directs autorisés par couche (Règle B du contrat)
private async selectDirectParents(
  projectId: EntityId,
  layer: DesignLayer
): Promise<{ layer: DesignLayer; proposals: DesignProposal[] }[]> {
  const DIRECT_PARENT_LAYERS: Record<DesignLayer, DesignLayer[]> = {
    INTENTION:  [],
    HYPOTHESIS: ['INTENTION'],
    CAPABILITY: ['INTENTION', 'HYPOTHESIS'],
    FEATURE:    ['CAPABILITY'],
    JOURNEY:    ['FEATURE'],
    SCREEN:     ['JOURNEY'],
  };
  const upstream = DIRECT_PARENT_LAYERS[layer] || [];
  const result: { layer: DesignLayer; proposals: DesignProposal[] }[] = [];
  for (const upLayer of upstream) {
    const proposals = await this.repos.designProposals.getByLayer(projectId, upLayer);
    const valid = proposals
      .filter(p => p.status === 'ACCEPTED' || p.status === 'PROPOSED')
      .slice(0, 30);
    if (valid.length > 0) {
      result.push({ layer: upLayer, proposals: valid });
    }
  }
  return result;
}

// Selection de toute l'ascendance (Règle A du contrat)
private async selectAncestryProposals(
  projectId: EntityId,
  layer: DesignLayer
): Promise<{ layer: DesignLayer; proposals: DesignProposal[] }[]> {
  const ANCESTRY_LAYERS: Record<DesignLayer, DesignLayer[]> = {
    INTENTION:  [],
    HYPOTHESIS: ['INTENTION'],
    CAPABILITY: ['INTENTION', 'HYPOTHESIS'],
    FEATURE:    ['INTENTION', 'HYPOTHESIS', 'CAPABILITY'],
    JOURNEY:    ['INTENTION', 'HYPOTHESIS', 'CAPABILITY', 'FEATURE'],
    SCREEN:     ['INTENTION', 'HYPOTHESIS', 'CAPABILITY', 'FEATURE', 'JOURNEY'],
  };
  const upstream = ANCESTRY_LAYERS[layer] || [];
  const result: { layer: DesignLayer; proposals: DesignProposal[] }[] = [];
  for (const upLayer of upstream) {
    const proposals = await this.repos.designProposals.getByLayer(projectId, upLayer);
    const valid = proposals
      .filter(p => p.status === 'ACCEPTED' || p.status === 'PROPOSED')
      .slice(0, 30);
    if (valid.length > 0) {
      result.push({ layer: upLayer, proposals: valid });
    }
  }
  return result;
}

private async buildDirectParentContext(projectId: EntityId, layer: DesignLayer): Promise<string> {
  const groups = await this.selectDirectParents(projectId, layer);
  if (groups.length === 0) {
    if (layer === 'INTENTION') {
      return "Aucun (couche racine).";
    }
    return "AUCUN PARENT DIRECT TROUVÉ.";
  }
  const sections: Record<string, any[]> = {};
  for (const { layer: upLayer, proposals } of groups) {
    sections[upLayer] = proposals.map(p => ({
      id: p.id,
      title: p.title,
      summary: p.description.length > 220 ? p.description.slice(0, 220) + '...' : p.description,
      category: p.category || p.originPerspective,
    }));
  }
  return JSON.stringify(sections, null, 2);
}

private async buildAncestryContext(projectId: EntityId, layer: DesignLayer): Promise<string> {
  const groups = await this.selectAncestryProposals(projectId, layer);
  if (groups.length === 0) {
    return "Aucune ascendance spécifique.";
  }
  const sections: Record<string, any[]> = {};
  for (const { layer: upLayer, proposals } of groups) {
    sections[upLayer] = proposals.map(p => ({
      id: p.id,
      title: p.title,
      summary: p.description.length > 150 ? p.description.slice(0, 150) + '...' : p.description,
    }));
  }
  return JSON.stringify(sections, null, 2);
}

  async getPromptDiagnostic(agentId: string): Promise<any> {
    return this.repos.prompts.getPromptDiagnostic(agentId);
  }



  async composeFeaturesIntoJourneyContexts(projectId: EntityId) {
    const allProposals = await this.repos.designProposals.getByProjectId(projectId);
    const features = allProposals.filter(p => p.layer === 'FEATURE' && p.status !== 'REJECTED' && p.status !== 'DEFERRED');
    
    const grouped = new Map<EntityId, DesignProposal[]>();
    features.forEach(f => {
      const parentId = f.parentId || (f.parentProposalIds && f.parentProposalIds[0]) || ('orphan' as EntityId);
      if (!grouped.has(parentId)) grouped.set(parentId, []);
      grouped.get(parentId)!.push(f);
    });

    const groups: any[] = [];
    grouped.forEach((groupFeatures, capId) => {
      const cap = allProposals.find(p => p.id === capId);
      groups.push({
        userGoal: cap ? cap.title : "Objectif général",
        trigger: "Déclenchement standard",
        featureIds: groupFeatures.map(f => f.id),
        capabilityIds: cap ? [cap.id] : [],
        context: cap ? cap.description : "Contexte générique",
        expectedOutcome: "Succès du parcours",
      });
    });

    const createdJourneys: DesignProposal[] = [];
    for (const group of groups) {
      if (group.featureIds.length === 0) continue;
      
      const journey = createDesignProposal({
        projectId,
        layer: 'JOURNEY',
        title: `Parcours pour ${group.userGoal}`,
        description: `Parcours généré pour englober les fonctionnalités de ${group.userGoal}`,
        status: 'PROPOSED',
        origin: 'AI_ASSISTED',
        rationale: 'Regroupement automatique',
        alternatives: [],
        risks: [],
        targetPlatforms: ["WEB_NEXTJS"],
        category: "GENERATED",
        parentProposalIds: group.featureIds,
        layerData: {
          goal: group.userGoal,
          trigger: group.trigger,
          usedFeatureIds: group.featureIds,
          steps: group.featureIds.map((fid: EntityId, idx: number) => ({
            order: idx + 1,
            stepNumber: idx + 1,
            userAction: "Action utilisateur " + (idx + 1),
            systemResponse: "Réponse système",
            featureIds: [fid],
          })),
        }
      });
      await this.repos.designProposals.save(journey);
      createdJourneys.push(journey);
    }

    return createdJourneys;
  }

  async materializeJourneyStepsIntoScreens(projectId: EntityId) {
    const allProposals = await this.repos.designProposals.getByProjectId(projectId);
    const journeys = allProposals.filter(p => p.layer === 'JOURNEY' && p.status !== 'REJECTED');
    const existingScreens = allProposals.filter(p => p.layer === 'SCREEN' && p.status !== 'REJECTED');

    const createdScreens: DesignProposal[] = [];

    for (const journey of journeys) {
      const data = journey.layerData as any;
      if (!data || !data.steps) continue;

      let updated = false;
      for (const step of data.steps) {
        if (!step.featureIds || step.featureIds.length === 0) continue;

        const compatibleScreen = existingScreens.find(s => {
          const sData = s.layerData as any;
          const exposed = sData?.exposedFeatureIds || [];
          return step.featureIds.some((fid: EntityId) => exposed.includes(fid));
        });

        if (compatibleScreen) {
          step.screenIds = [compatibleScreen.id];
          step.screenId = compatibleScreen.id;
          
          const sData = compatibleScreen.layerData as any;
          if (!sData.journeyIds) sData.journeyIds = [];
          if (!sData.journeyIds.includes(journey.id)) sData.journeyIds.push(journey.id);
          
          if (!compatibleScreen.parentProposalIds) {
            (compatibleScreen as any).parentProposalIds = [];
          }
          if (!compatibleScreen.parentProposalIds.includes(journey.id)) {
            compatibleScreen.parentProposalIds.push(journey.id);
          }
          
          await this.repos.designProposals.save(compatibleScreen);
          updated = true;
        } else {
          const newScreen = createDesignProposal({
            projectId,
            layer: 'SCREEN',
            title: `Écran pour étape ${step.stepNumber}`,
            description: `Écran généré pour l'étape ${step.stepNumber} de ${journey.title}`,
            status: 'PROPOSED',
            origin: 'AI_ASSISTED',
            rationale: 'Génération automatique',
            alternatives: [],
            risks: [],
            targetPlatforms: ["WEB_NEXTJS"],
            category: "GENERATED",
            parentId: journey.id,
            parentProposalIds: [journey.id],
            layerData: {
              role: "Interface utilisateur",
              journeyIds: [journey.id],
              exposedFeatureIds: step.featureIds,
            }
          });
          await this.repos.designProposals.save(newScreen);
          existingScreens.push(newScreen);
          createdScreens.push(newScreen);

          step.screenIds = [newScreen.id];
          step.screenId = newScreen.id;
          updated = true;
        }
      }

      if (updated) {
        await this.repos.designProposals.save(journey);
      }
    }

    return createdScreens;
  }

  async getUpstreamContextPreview(projectId: EntityId, layer: DesignLayer): Promise<UpstreamContextPreview> {
    const UPSTREAM_LAYERS: Record<DesignLayer, DesignLayer[]> = {
      INTENTION:  [],
      HYPOTHESIS: ['INTENTION'],
      CAPABILITY: ['INTENTION', 'HYPOTHESIS'],
      FEATURE:    ['CAPABILITY'],
      JOURNEY:    ['FEATURE'],
      SCREEN:     ['JOURNEY', 'FEATURE'],
    };
    const upstreamLayers = UPSTREAM_LAYERS[layer] || [];
    const groups = await this.selectAncestryProposals(projectId, layer);
    const items = groups.flatMap(g =>
      g.proposals.map(p => ({ id: p.id, layer: g.layer, title: p.title, status: p.status }))
    );
    return { layer, upstreamLayers, items, hasUpstream: items.length > 0 };
  }

  async generateDeferredRoadmap(projectId: EntityId): Promise<string> {
    const all = await this.repos.designProposals.getByProjectId(projectId);
    const deferred = all.filter(p => p.status === 'DEFERRED');
    const LAYER_ORDER: DesignLayer[] = ['INTENTION', 'HYPOTHESIS', 'CAPABILITY', 'FEATURE', 'JOURNEY', 'SCREEN'];
    const LAYER_LABELS: Record<DesignLayer, string> = {
      INTENTION: '🎯 Intentions',
      HYPOTHESIS: '🔬 Hypothèses',
      CAPABILITY: '⚙️ Capacités',
      FEATURE: '🧩 Fonctionnalités',
      JOURNEY: '🗺️ Parcours',
      SCREEN: '🖥️ Écrans',
    };

    let md = `# Roadmap — Idées Reportées\n\n`;
    md += `> Généré le ${new Date().toISOString().slice(0, 10)} — **${deferred.length} idée(s)** volontairement exclue(s) du périmètre initial V1.\n\n`;
    md += `> Ces éléments ont été identifiés et documentés. Ils constituent la feuille de route des versions futures.\n\n`;

    if (deferred.length === 0) {
      md += `_Aucune idée reportée à ce jour._\n`;
    } else {
      for (const layer of LAYER_ORDER) {
        const items = deferred.filter(p => p.layer === layer);
        if (items.length === 0) continue;
        md += `## ${LAYER_LABELS[layer]}\n\n`;
        for (const p of items) {
          const parent = p.parentId ? all.find(x => x.id === p.parentId) : null;
          md += `### ${p.title}\n`;
          if (p.shortPitch) md += `> ${p.shortPitch}\n\n`;
          md += `${p.description || ''}\n\n`;
          if (parent) md += `- 🔗 Dérivé de : **"${parent.title}"** (${parent.layer})\n`;
          if (p.dependencyIds?.length) md += `- Dépendances : ${p.dependencyIds.length} proposition(s)\n`;
          if (p.rationale) md += `\n**Justification :** ${p.rationale}\n`;
          md += `\n---\n\n`;
        }
      }
    }

    return md;
  }

  async generateProposals(
    projectId: EntityId,
    layer: DesignLayer,
    ideationIntensity: 'STANDARD' | 'ABUNDANT' | 'EXHAUSTIVE' = 'ABUNDANT',
    brainstormingMode: boolean = true, // Conservé pour compatibilité interne
    onProgress?: (agentId: string, status: "pending" | "running" | "done" | "error") => void,
    options?: GenerateProposalsOptions
  ): Promise<any> {
    const LAYER_VOLUMETRY: Record<'STANDARD' | 'ABUNDANT' | 'EXHAUSTIVE', Record<DesignLayer, { synthesizer: string; perAgent: string }>> = {
      STANDARD: {
        INTENTION:  { synthesizer: '1 à 3', perAgent: '2' },
        HYPOTHESIS: { synthesizer: '2 à 5', perAgent: '3' },
        CAPABILITY: { synthesizer: '2 à 6', perAgent: '3' },
        FEATURE:    { synthesizer: '4 à 12', perAgent: '5' },
        JOURNEY:    { synthesizer: '1 à 5', perAgent: '3' },
        SCREEN:     { synthesizer: '1 à 8', perAgent: '4' },
      },
      ABUNDANT: {
        INTENTION:  { synthesizer: '2 à 4', perAgent: '3' },
        HYPOTHESIS: { synthesizer: '4 à 8', perAgent: '4' },
        CAPABILITY: { synthesizer: '4 à 10', perAgent: '5' },
        FEATURE:    { synthesizer: '6 à 18', perAgent: '6' },
        JOURNEY:    { synthesizer: '3 à 10', perAgent: '4' },
        SCREEN:     { synthesizer: '3 à 15', perAgent: '5' },
      },
      EXHAUSTIVE: {
        INTENTION:  { synthesizer: '2 à 5', perAgent: '4' },
        HYPOTHESIS: { synthesizer: '6 à 12', perAgent: '5' },
        CAPABILITY: { synthesizer: '6 à 14', perAgent: '6' },
        FEATURE:    { synthesizer: '8 à 25', perAgent: '8' },
        JOURNEY:    { synthesizer: '5 à 15', perAgent: '5' },
        SCREEN:     { synthesizer: '5 à 20', perAgent: '6' },
      },
    };

    const vol = LAYER_VOLUMETRY[ideationIntensity]?.[layer] || LAYER_VOLUMETRY.ABUNDANT[layer];
    // Mode brainstorming unique permanent
    void brainstormingMode; // Conservé pour compatibilité interne
    const brainstormFlag = "ON";
    let duplicateCount = 0;
    
    const ancestryContext = await this.buildAncestryContext(projectId, layer);
    const directParentContext = await this.buildDirectParentContext(projectId, layer);
    
    const existingLayerProps = await this.repos.designProposals.getByLayer(projectId, layer);
    
    // Batch identification & computation
    const existingBatchIds = Array.from(new Set(existingLayerProps.map(p => p.generationBatchId).filter(Boolean)));
    const variationIndex = existingBatchIds.length;
    
    let mode: 'INITIAL' | 'VARIATION' | 'REPLACEMENT' = options?.generationMode || (existingLayerProps.length === 0 ? 'INITIAL' : 'VARIATION');
    const sourceBatchId = options?.sourceBatchId || null;
    const generationBatchId = `batch-${layer.toLowerCase()}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const generatedAt = new Date().toISOString();

    let diversityFocus = options?.userDiversityFocus || null;
    if (!diversityFocus && mode !== 'INITIAL') {
      diversityFocus = DIVERGENCE_AXES[variationIndex % DIVERGENCE_AXES.length];
    }

    let removedProposalCount = 0;
    let protectedProposalCount = 0;

    // Handle REPLACEMENT mode
    if (mode === 'REPLACEMENT' && sourceBatchId) {
      options?.onLog?.({
        message: "GENERATION_BATCH_REPLACEMENT_STARTED",
        category: "GENERATION",
        context: { projectId, layer, generationBatchId, sourceBatchId, generationMode: mode, variationIndex, diversityFocus }
      });

      const batchProposals = existingLayerProps.filter(p => p.generationBatchId === sourceBatchId);
      for (const p of batchProposals) {
        const isProtected = p.status === 'ACCEPTED' || p.status === 'REJECTED' || p.status === 'DEFERRED' || p.decidedAt != null || p.generationBatchId == null;
        if (isProtected) {
          protectedProposalCount++;
        } else {
          await this.repos.designProposals.delete(p.id);
          removedProposalCount++;
        }
      }

      options?.onLog?.({
        message: "GENERATION_BATCH_REPLACEMENT_COMPLETED",
        category: "GENERATION",
        context: { projectId, layer, generationBatchId, sourceBatchId, protectedProposalCount, removedProposalCount }
      });
    }

    const currentPropsForAvoid = mode === 'REPLACEMENT' 
      ? await this.repos.designProposals.getByLayer(projectId, layer)
      : existingLayerProps;

    const existingProposalsToAvoidJson = JSON.stringify(currentPropsForAvoid.map(p => ({
      id: p.id,
      title: p.title,
      shortPitch: p.shortPitch || p.title,
      description: p.description,
      status: p.status,
      parentId: p.parentId,
      generationBatchId: p.generationBatchId || null
    })));

    const startLogMessage = mode === 'INITIAL' ? 'GENERATION_INITIAL_STARTED' : 'VARIATION_STARTED';
    options?.onLog?.({
      message: startLogMessage,
      category: "GENERATION",
      context: {
        projectId,
        layer,
        generationBatchId,
        sourceBatchId,
        generationMode: mode,
        variationIndex,
        diversityFocus,
        existingProposalCount: currentPropsForAvoid.length
      }
    });

    options?.onLog?.({
      message: "VARIATION_CONTEXT_BUILT",
      category: "GENERATION",
      context: { projectId, layer, generationBatchId, variationIndex, diversityFocus, avoidCount: currentPropsForAvoid.length }
    });

    const existingSameLayerJson = existingProposalsToAvoidJson;
    
    const allProjectProps = await this.repos.designProposals.getByProjectId(projectId);
    const deferredItems = allProjectProps.filter(p => p.status === 'DEFERRED').map(p => ({ id: p.id, title: p.title, layer: p.layer }));
    const rejectedItems = allProjectProps.filter(p => p.status === 'REJECTED').map(p => ({ id: p.id, title: p.title, layer: p.layer }));
    const lockedDecisions = await this.repos.decisions.getByProjectId(projectId);

    // 1. Déterminer les agents à appeler selon la couche
    let baseAgents: string[] = [];
    if (layer === "INTENTION") baseAgents = ["WORKSHOP-INTENT"];
    else if (layer === "HYPOTHESIS") baseAgents = ["WORKSHOP-HYPOTHESIS"];
    else if (layer === "CAPABILITY") baseAgents = ["WORKSHOP-CAPABILITY"];
    else if (layer === "FEATURE") baseAgents = ["WORKSHOP-FEATURE"];
    else if (layer === "JOURNEY") baseAgents = ["WORKSHOP-JOURNEY"];
    else if (layer === "SCREEN") baseAgents = ["WORKSHOP-SCREEN"];
    else baseAgents = [];

    // Perspectives pour l'essaim d'idéation
    let perspectives: string[] = ["Pragmatique"];
    if (ideationIntensity === 'STANDARD') perspectives = ["Pragmatique", "Visionnaire", "Critique des problèmes cachés"];
    if (ideationIntensity === 'ABUNDANT') perspectives = ["Explorateur du besoin réel", "Avocat de l'utilisateur pressé", "Visionnaire", "Pragmatique", "Critique des problèmes cachés"];
    if (ideationIntensity === 'EXHAUSTIVE') perspectives = ["Explorateur du besoin réel", "Avocat de l'utilisateur pressé", "Défenseur de l'utilisateur non technique", "Visionnaire", "Pragmatique", "Critique des problèmes cachés", "Explorateur des usages futurs", "Gardien de la simplicité"];

    const divergentAgentsToCall = perspectives.map(p => ({
      agentId: baseAgents[0] || "WORKSHOP-SYNTHESIZER",
      perspective: p,
      runId: `${baseAgents[0]}-${p}`
    }));

    const convergentAgentsToCall = [
      { agentId: "WORKSHOP-CRITIC", perspective: "Constructif", runId: "WORKSHOP-CRITIC" },
      { agentId: "WORKSHOP-SYNTHESIZER", perspective: "Organisateur", runId: "WORKSHOP-SYNTHESIZER" }
    ];

    const agentsToCall = [...divergentAgentsToCall, ...convergentAgentsToCall];

    const project = await this.repos.projects.getById(projectId);
    const briefItems = await this.repos.briefItems.getByProjectId(projectId);
    const confirmedItems = briefItems.filter((b) => b.status === "LOCKED" || b.status === "ACCEPTED" || b.status === "CORRECTED");
    
    const OUTPUT_SCHEMA_JSON = JSON.stringify({
      schemaVersion: "workshop-response-v2",
      agentId: "string",
      layer: "string",
      summary: "string",
      proposals: [{
        id: "string",
        parentId: "string (must be from allowed_direct_parents)",
        parentProposalIds: ["string"],
        rootProposalId: "string (optional)",
        title: "string",
        shortPitch: "string",
        type: "string",
        description: "string",
        justification: "string",
        userValue: "string",
        confidence: "number",
        originAgent: "string",
        originPerspective: "string",
        priority: "string",
        complexity: "string",
        lineage: ["string"],
        childrenIds: ["string"],
        relatedProposalIds: ["string"],
        dependencies: ["string"],
        consequenceIds: ["string"],
        specificData: "object (layer specific detailed attributes)"
      }],
      diagnostics: {
        code: "string",
        step: "string",
        reasons: ["string"]
      }
    }, null, 2);

    let upstreamOutputs = "";
    let finalResult = "";

    if (onProgress) {
      agentsToCall.forEach(a => onProgress(a.runId, "pending"));
    }

    const routedAgentIds = agentsToCall.map(a => a.runId);
    let promptFound = true;
    let systemPromptLength = 0;
    let userPromptLength = 0;
    let parseStatus = "PENDING";
    let lastAgentId = "";

    const hydratePrompt = (templateStr: string, agentData: { perspective: string }) => {
      return templateStr
        .replace(/{{LANGUAGE}}/g, "fr")
        .replace(/{{TARGET_PLATFORM}}/g, project?.targetPlatforms?.join(", ") || "WEB_NEXTJS")
        .replace(/{{TARGET_FRAMEWORK}}/g, "React / Next.js")
        .replace(/{{PROJECT_TITLE}}/g, project?.name || "")
        .replace(/{{PROJECT_ID}}/g, projectId)
        .replace(/{{SOURCE_TEXT}}/g, project?.ideaText || "")
        .replace(/{{CONFIRMED_ITEMS_JSON}}/g, JSON.stringify(confirmedItems.map(i => i.statement)))
        .replace(/{{LOCKED_DECISIONS_JSON}}/g, JSON.stringify(lockedDecisions.map(d => d.title)))
        .replace(/{{REJECTED_ITEMS_JSON}}/g, JSON.stringify(rejectedItems))
        .replace(/{{DEFERRED_ITEMS_JSON}}/g, JSON.stringify(deferredItems))
        .replace(/{{ANCESTRY_CONTEXT_JSON}}/g, ancestryContext)
        .replace(/{{DIRECT_PARENT_CONTEXT_JSON}}/g, directParentContext)
        .replace(/{{CURRENT_LAYER_PROPOSALS_JSON}}/g, existingSameLayerJson)
        .replace(/{{EXISTING_PROPOSALS_TO_AVOID}}/g, existingSameLayerJson)
        .replace(/{{VARIATION_INDEX}}/g, String(variationIndex))
        .replace(/{{USER_DIVERSITY_FOCUS}}/g, diversityFocus || "N/A")
        .replace(/{{EXISTING_DOWNSTREAM_CONTEXT_JSON}}/g, "[]")
        .replace(/{{LAYER_CONTRACT}}/g, `Couche : ${layer}. Produire des propositions d'une densité et granularité propres à la couche.`)
        .replace(/{{CURRENT_LAYER}}/g, layer)
        .replace(/{{UPSTREAM_OUTPUTS_JSON}}/g, upstreamOutputs || directParentContext)
        .replace(/{{OUTPUT_SCHEMA_JSON}}/g, OUTPUT_SCHEMA_JSON)
        .replace(/{{IDEATION_PERSPECTIVE}}/g, agentData.perspective)
        .replace(/{{IDEATION_INTENSITY}}/g, ideationIntensity)
        .replace(/{{BRAINSTORMING_MODE}}/g, brainstormFlag)
        .replace(/{{TARGET_PROPOSAL_COUNT}}/g, vol.perAgent)
        .replace(/{{[A-Z_]+}}/g, "N/A");
    };

    // We will run divergent agents in parallel
    const divergentPromises = divergentAgentsToCall.map(async (agentData) => {
      if (onProgress) onProgress(agentData.runId, "running");
      const promptTpl = await this.repos.prompts.getActivePrompt(agentData.agentId);
      if (!promptTpl) {
        console.warn(`Prompt missing for ${agentData.agentId}`);
        promptFound = false;
        if (onProgress) onProgress(agentData.runId, "error");
        return null;
      }

      const userPrompt = hydratePrompt(promptTpl.userPromptTemplate, agentData);

      const diversificationInstruction = (mode !== 'INITIAL')
        ? `\n\n### CONSIGNE DE DIVERSIFICATION OBLIGATOIRE\nProduis une nouvelle variation réellement distincte des propositions existantes.\nChaque nouvelle proposition doit apporter au moins un élément substantiellement nouveau.\nUne reformulation, un synonyme ou un changement de priorité ne constitue pas une nouvelle proposition.` + (diversityFocus ? ` (Angle d'exploration : ${diversityFocus})` : '')
        : '';

      const req = {
        prompt: userPrompt,
        systemPrompt: promptTpl.systemPrompt + `\nTa perspective : ${agentData.perspective}` + diversificationInstruction,
        tier: "SOL" as any, 
        maxTokens: 4000,
        correlationId: `workshop-${projectId}-${layer}-${agentData.runId}`,
        metadata: { projectId, layer, agentId: agentData.agentId, perspective: agentData.perspective }
      };

      try {
        const res = await this.provider.complete(req);
        if (onProgress) onProgress(agentData.runId, "done");
        return `\n\n--- OUTPUT FROM ${agentData.runId} (${agentData.perspective}) ---\n${res.content}`;
      } catch (e) {
        if (onProgress) onProgress(agentData.runId, "error");
        return null;
      }
    });

    const divRes = await Promise.all(divergentPromises);
    upstreamOutputs += divRes.filter(Boolean).join("");

    let synthesizerPromptVersion = 1;
    let synthesizerPromptId = "";
    let lastPromptVersion = 1;
    let lastPromptId = "";

    // Sequential convergent agents
    for (const agentData of convergentAgentsToCall) {
      if (onProgress) onProgress(agentData.runId, "running");
      lastAgentId = agentData.agentId;
      const promptTpl = await this.repos.prompts.getActivePrompt(agentData.agentId);
      if (!promptTpl) {
        console.warn(`Prompt missing for ${agentData.agentId}`);
        promptFound = false;
        if (onProgress) onProgress(agentData.runId, "error");
        continue;
      }

      if (agentData.agentId === "WORKSHOP-SYNTHESIZER") {
        synthesizerPromptVersion = promptTpl.version;
        synthesizerPromptId = promptTpl.promptId;
      }
      lastPromptVersion = promptTpl.version;
      lastPromptId = promptTpl.promptId;

      let userPrompt = hydratePrompt(promptTpl.userPromptTemplate, agentData);
      if (mode !== 'INITIAL') {
        userPrompt += `\n\n### CONSIGNE DE DIVERSIFICATION ET FILTRAGE DE NOUVEAUTÉ (CONVERGENCE)\nTu es en mode DIVERSIFICATION / VARIATION. Ne retiens QUE les propositions qui apportent une nouveauté fonctionnelle substantielle par rapport aux propositions existantes (EXISTING_PROPOSALS_TO_AVOID).\nRejette systématiquement les simples reformulations, synonymes ou changements de priorité.\nRejette toute proposition qui glisse vers une couche inférieure (ex: FEATURE formulée comme CAPABILITY).\nSi aucune ou peu de propositions ne satisfont ce critère de nouveauté, retourne un tableau réduit (0, 1 ou 2 propositions). La qualité et la nouveauté réelle priment sur la quantité.` + (diversityFocus ? ` (Angle d'exploration : ${diversityFocus})` : '');
      }

      if (agentData.runId === agentsToCall[agentsToCall.length - 1].runId) {
        systemPromptLength = promptTpl.systemPrompt.length;
        userPromptLength = userPrompt.length;
      }

      const req = {
        prompt: userPrompt,
        systemPrompt: promptTpl.systemPrompt,
        tier: "SOL" as any, 
        maxTokens: 4000,
        correlationId: `workshop-${projectId}-${layer}-${agentData.runId}`,
        metadata: { projectId, layer, agentId: agentData.agentId }
      };

      try {
        const res = await this.provider.complete(req);
        upstreamOutputs += `\n\n--- OUTPUT FROM ${agentData.runId} ---\n${res.content}`;
        finalResult = res.content; 
        if (onProgress) onProgress(agentData.runId, "done");
      } catch (e) {
        if (onProgress) onProgress(agentData.runId, "error");
        throw e;
      }
    }

    let parsedResult: any = null;

    try {
      parsedResult = safeParseModelJson(finalResult);
      parseStatus = "SUCCESS";
    } catch(e: any) {
      console.error("Failed to parse workshop output", e);
      parseStatus = "ERROR";
      throw new Error(`La réponse IA n'a pas pu être interprétée. (Agent: ${lastAgentId}, Erreur: ${e.message || String(e)})`);
    }

    const diagnostic: any = {
      selectedLayer: layer,
      routedAgentIds,
      promptId: synthesizerPromptId || lastPromptId || lastAgentId,
      promptVersion: synthesizerPromptVersion || lastPromptVersion || 1,
      synthesizerVersion: synthesizerPromptVersion || 1,
      promptFound,
      systemPromptLength,
      userPromptLength,
      upstreamOutputCount: agentsToCall.length - 1,
      parsedProposalCount: parsedResult?.proposals?.length || 0,
      parsedQuestionCount: parsedResult?.questions?.length || 0,
      parsedAssumptionCount: parsedResult?.assumptions?.length || 0,
      graphOperationCount: parsedResult?.graphOperations?.length || 0,
      usedFallback: false,
      parseStatus,
      persistenceStatus: "NOT_SAVED_YET",
      ideationIntensity,
      contributorCount: divergentAgentsToCall.length,
      rawProposalCount: parsedResult?.proposals?.length || 0,
      deduplicatedProposalCount: parsedResult?.proposals?.length || 0,
      preservedProposalCount: parsedResult?.proposals?.length || 0,
      removedDuplicateCount: 0,
      parentProposalCount: parsedResult?.proposals?.filter((p:any) => !p.parentId).length || 0,
      childProposalCount: parsedResult?.proposals?.filter((p:any) => p.parentId).length || 0,
    };

    // ================================================================
    // PERSIST PROPOSALS avec PostProcessor TF-IDF (garantie de liaison)
    // ================================================================
    const persistedProposals: DesignProposal[] = [];
    if (parsedResult?.proposals) {
      // Charger les parents directs autorisés pour le PostProcessor
      const directParentGroups = layer === 'INTENTION'
        ? []
        : await this.selectDirectParents(projectId, layer);
      const directParentsFlat: DesignProposal[] = directParentGroups.flatMap(g => g.proposals);
      const validDirectIds = new Set(directParentsFlat.map(u => u.id));

      const allAncestryGroups = layer === 'INTENTION'
        ? []
        : await this.selectAncestryProposals(projectId, layer);
      const allAncestryFlat: DesignProposal[] = allAncestryGroups.flatMap(g => g.proposals);
      const validAncestryIds = new Set(allAncestryFlat.map(u => u.id));

      for (const p of parsedResult.proposals) {
        // Résolution des liens (Prompt as best effort, PostProcessor as guarantee)
        const links: LinkResolution = layer === 'INTENTION'
          ? { parentId: null, lineage: [], linkSource: null, linkConfidence: null }
          : resolveProposalLinks(p as ParsedProposal, directParentsFlat);

        // Filtrer les dependencyIds et parentProposalIds
        const safeDependencyIds = (p.dependencies ?? []).filter((id: string) => validAncestryIds.has(id as EntityId));
        const safeParentProposalIds = (p.parentProposalIds || p.relatedProposalIds || [])
          .filter((id: string) => validDirectIds.has(id as EntityId) && id !== links.parentId);
        
        if (links.parentId && !safeParentProposalIds.includes(links.parentId)) {
          safeParentProposalIds.unshift(links.parentId);
        }

        // Détection des doublons avant persistance
        const dupCheck = checkForDuplicateProposal(
          { title: p.title, description: p.description, shortPitch: p.shortPitch, parentId: links.parentId as any, parentProposalIds: safeParentProposalIds as any },
          [...currentPropsForAvoid, ...persistedProposals]
        );

        if (dupCheck.isDuplicate) {
          duplicateCount++;
          const dupLogMsg = dupCheck.level === 'CERTAIN' ? 'PROPOSAL_DUPLICATE_REJECTED' : 'PROPOSAL_PROBABLE_DUPLICATE_REJECTED';
          options?.onLog?.({
            message: dupLogMsg,
            category: "VALIDATION",
            context: {
              projectId,
              layer,
              generationBatchId,
              title: p.title,
              level: dupCheck.level,
              reason: dupCheck.reason
            }
          });
          continue;
        }

        const dp = createDesignProposal({
          projectId,
          layer,
          title: p.title,
          description: p.description,
          rationale: p.justification || "",
          targetPlatforms: project?.targetPlatforms || [],
          origin: 'AI_ASSISTED',
          originPerspective: p.originPerspective || "System",
          shortPitch: p.shortPitch || p.title,
          status: 'PROPOSED',
          parentId: links.parentId as EntityId | null,
          rootProposalId: p.rootProposalId || null,
          childrenIds: p.childrenIds || [],
          relatedProposalIds: p.relatedProposalIds || [],
          dependencyIds: safeDependencyIds,
          consequenceIds: p.consequenceIds || [],
          lineage: links.lineage as EntityId[],
          linkSource: links.linkSource,
          linkConfidence: links.linkConfidence,
          priority: p.priority || 'MEDIUM',
          complexity: p.complexity || 'M',
          confidence: p.confidence || 50,
          originAgentId: p.originAgent || lastAgentId,
          category: p.type || "General",
          alternatives: [],
          risks: [],
          parentProposalIds: safeParentProposalIds,
          layerData: p.specificData || undefined,
          generationBatchId,
          generatedAt,
          generationMode: mode,
          variationIndex,
          sourceBatchId,
          userDiversityFocus: diversityFocus,
          originOperationId: `op-${generationBatchId}`
        });
        await this.repos.designProposals.save(dp);
        persistedProposals.push(dp);
        p.id = dp.id; // Assign real ID
      }
      diagnostic.persistenceStatus = "SAVED";
      diagnostic.persistedProposalCount = persistedProposals.length;
      diagnostic.linkedCount = persistedProposals.filter(p => p.parentId).length;
      diagnostic.autoMatchedCount = persistedProposals.filter(p => p.linkSource === 'AUTO_MATCHED').length;
      diagnostic.aiLinkedCount = persistedProposals.filter(p => p.linkSource === 'AI').length;

      options?.onLog?.({
        message: "GENERATION_BATCH_CREATED",
        category: "PERSISTENCE",
        context: {
          projectId,
          layer,
          generationBatchId,
          sourceBatchId,
          generationMode: mode,
          variationIndex,
          diversityFocus,
          proposalCount: persistedProposals.length,
          duplicateCount,
          removedProposalCount,
          protectedProposalCount,
        }
      });

      const endLogMessage = mode === 'INITIAL' ? 'GENERATION_INITIAL_COMPLETED' : 'VARIATION_COMPLETED';
      options?.onLog?.({
        message: endLogMessage,
        category: "GENERATION",
        context: {
          projectId,
          layer,
          generationBatchId,
          sourceBatchId,
          generationMode: mode,
          variationIndex,
          diversityFocus,
          receivedCount: parsedResult?.proposals?.length || 0,
          persistedCount: persistedProposals.length,
          duplicateCount,
        }
      });
    }

    diagnostic.generationBatchId = generationBatchId;
    diagnostic.generationMode = mode;
    diagnostic.variationIndex = variationIndex;
    diagnostic.userDiversityFocus = diversityFocus;
    diagnostic.receivedCount = parsedResult?.proposals?.length || 0;
    diagnostic.addedCount = persistedProposals.length;
    diagnostic.duplicateCount = duplicateCount;

    return {
      ...parsedResult,
      proposals: persistedProposals,
      generationBatchId,
      generationMode: mode,
      variationIndex,
      userDiversityFocus: diversityFocus,
      receivedCount: parsedResult?.proposals?.length || 0,
      addedCount: persistedProposals.length,
      duplicateCount,
      diagnostic
    };
  }

  async createProposal(params: {
    projectId: EntityId;
    layer: DesignLayer;
    title: string;
    description: string;
    rationale: string;
    targetPlatforms: TargetPlatform[];
    origin: 'AI_ASSISTED' | 'MANUAL' | 'IMPORTED_FROM_BRIEF';
  }): Promise<DesignProposal> {
    const proposal = createDesignProposal({
      ...params,
      status: 'PROPOSED',
      alternatives: [],
      risks: [],
      parentProposalIds: [],
      category: 'Uncategorized',
    });
    
    await this.repos.designProposals.save(proposal);
    return proposal;
  }

  async updateProposalStatus(proposalId: EntityId, status: DesignProposal['status']): Promise<DesignProposal> {
    const proposal = await this.repos.designProposals.getById(proposalId);
    if (!proposal) throw new Error("Proposition introuvable");
    const updated = {
      ...proposal,
      status,
      updatedAt: new Date().toISOString()
    };
    await this.repos.designProposals.save(updated);

    // CASCADE DESCENDANTE (Correctif 4) : Si rejet ou report, marquer les enfants exclusifs à revoir
    if (status === 'REJECTED' || status === 'DEFERRED') {
      const allProposals = await this.repos.designProposals.getByProjectId(proposal.projectId);
      for (const p of allProposals) {
        // Si l'enfant n'a QUE CE parent (ou que le parent direct est ce proposal) et n'est pas verrouillé
        const isExclusiveChild = p.parentId === proposalId && (p.parentProposalIds || []).length === 0;
        if (isExclusiveChild && p.status === 'PROPOSED') {
          await this.repos.designProposals.save({
            ...p,
            status: 'NEEDS_REVIEW' as any, // Cast nécessaire car on injecte un état d'alerte métier pour l'UI, géré par le type PathStatus implicitement
            updatedAt: new Date().toISOString(),
            rationale: `[Cascade] Parent ${status}. ` + (p.rationale || '')
          });
        }
      }
    }

    return updated;
  }

  async submitUserFeedback(proposalId: EntityId, feedbackText: string): Promise<DesignProposal> {
    const proposal = await this.repos.designProposals.getById(proposalId);
    if (!proposal) throw new Error("Proposition introuvable");
    const updated = {
      ...proposal,
      rationale: proposal.rationale ? `${proposal.rationale}\n\n[Critique Utilisateur] : ${feedbackText}` : `[Critique Utilisateur] : ${feedbackText}`,
      updatedAt: new Date().toISOString()
    };
    await this.repos.designProposals.save(updated);
    return updated;
  }

  async getGraph(projectId: EntityId): Promise<DesignGraph> {
    let graph = await this.repos.designGraphs.getByProjectId(projectId);
    if (!graph) {
      graph = createDesignGraph(projectId);
      await this.repos.designGraphs.save(graph);
    }
    return graph;
  }

  async freezeBaseline(projectId: EntityId, versionLabel: string, userId: string): Promise<DesignBaseline> {
    const project = await this.repos.projects.getById(projectId);
    if (!project) throw new Error("Project not found");

    const proposals = await this.repos.designProposals.getByProjectId(projectId);
    const acceptedProposals = proposals.filter(p => p.status === 'ACCEPTED');
    
    const graph = await this.getGraph(projectId);

    // Validation
    if (acceptedProposals.length === 0) {
      throw new Error("Cannot freeze baseline with no accepted proposals");
    }

    const baseline: DesignBaseline = {
      id: createId(),
      projectId,
      versionLabel,
      frozenAt: new Date().toISOString(),
      frozenBy: userId,
      contentHash: "hash_placeholder", // Implement crypto hash in real usage
      snapshot: {
        proposals: acceptedProposals,
        graph,
        targetPlatforms: project.targetPlatforms,
      },
      validationChecklist: [{ rule: "Has accepted proposals", passed: true }],
      status: "ACTIVE",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.repos.designBaselines.save(baseline);

    // Mettre à jour le projet
    await this.repos.projects.save({
      ...project,
      designStatus: 'VALIDATED',
      activeBaselineId: baseline.id,
      updatedAt: new Date().toISOString(),
      version: project.version + 1,
    });

    return baseline;
  }

  async getDesignBaselineSummary(projectId: EntityId): Promise<DesignBaselineSummary> {
    const baselines = await this.repos.designBaselines.getByProjectId(projectId);
    const activeBaseline = baselines.find((b) => b.status === "ACTIVE") || baselines[0] || null;
    const proposals = await this.repos.designProposals.getByProjectId(projectId);

    const totals = {
      proposals: proposals.length,
      accepted: proposals.filter((p) => p.status === "ACCEPTED").length,
      rejected: proposals.filter((p) => p.status === "REJECTED").length,
      pending: proposals.filter((p) => p.status === "PROPOSED").length,
      deferred: proposals.filter((p) => p.status === "DEFERRED").length,
    };

    const acceptedByLayer: Record<DesignLayer, number> = {
      INTENTION: 0,
      HYPOTHESIS: 0,
      CAPABILITY: 0,
      FEATURE: 0,
      JOURNEY: 0,
      SCREEN: 0,
    };

    const acceptedByType: Record<string, number> = {};
    const acceptedProposals = proposals.filter((p) => p.status === "ACCEPTED");

    acceptedProposals.forEach((p) => {
      if (acceptedByLayer[p.layer] !== undefined) {
        acceptedByLayer[p.layer]++;
      }
      const typeKey = p.category || p.layer;
      acceptedByType[typeKey] = (acceptedByType[typeKey] || 0) + 1;
    });

    const acceptedIds = new Set(acceptedProposals.map((p) => p.id));
    const topLevelAccepted = acceptedProposals
      .filter((p) => !p.parentId || !acceptedIds.has(p.parentId))
      .map((p) => {
        const childCount = acceptedProposals.filter((c) => c.parentId === p.id).length;
        return {
          id: p.id,
          title: p.title,
          layer: p.layer,
          type: p.category || p.layer,
          childCount,
        };
      });

    let isStale = false;
    let staleCount = 0;

    if (activeBaseline) {
      const frozenTime = new Date(activeBaseline.frozenAt).getTime();
      const newAcceptedAfterFrozen = acceptedProposals.filter(
        (p) => new Date(p.updatedAt).getTime() > frozenTime
      );
      if (newAcceptedAfterFrozen.length > 0) {
        isStale = true;
        staleCount = newAcceptedAfterFrozen.length;
      }
    }

    const intentions = acceptedProposals.filter((p) => p.layer === "INTENTION").map((p) => p.title);
    const screens = acceptedProposals.filter((p) => p.layer === "SCREEN").map((p) => p.title);
    const features = acceptedProposals.filter((p) => p.layer === "FEATURE").map((p) => p.title);

    let executiveSummary = "";
    if (acceptedProposals.length === 0) {
      executiveSummary = "Aucune proposition de conception validée pour le moment. La mission utilisera uniquement les éléments bruts du brief.";
    } else {
      executiveSummary = `La conception validée comprend ${totals.accepted} éléments scellés. `;
      if (intentions.length > 0) executiveSummary += `Intentions majeures : ${intentions.slice(0, 3).join(", ")}. `;
      if (features.length > 0) executiveSummary += `Fonctionnalités clés : ${features.slice(0, 3).join(", ")}. `;
      if (screens.length > 0) executiveSummary += `Écrans cibles : ${screens.slice(0, 3).join(", ")}.`;
    }

    return {
      baselineId: activeBaseline?.id || null,
      versionLabel: activeBaseline?.versionLabel || null,
      frozenAt: activeBaseline?.frozenAt || null,
      isStale,
      staleCount,
      totals,
      acceptedByLayer,
      acceptedByType,
      topLevelAccepted,
      executiveSummary,
    };
  }

  async getWeavingGraph(projectId: EntityId): Promise<{ nodes: any[]; edges: WeavingEdge[] }> {
    const proposals = await this.repos.designProposals.getByProjectId(projectId);
    const validProposals = proposals.filter((p) => p.status === "ACCEPTED" || p.status === "PROPOSED");
    const validIds = new Set(validProposals.map((p) => p.id));

    const nodes = validProposals.map((p) => ({
      id: p.id,
      title: p.title,
      layer: p.layer,
      status: p.status,
      type: p.category || p.layer,
      originPerspective: p.originPerspective,
      parentId: p.parentId,
      lineage: p.lineage || [],
      dependencies: p.dependencyIds || [],
      relatedProposalIds: p.relatedProposalIds || [],
    }));

    const edges: WeavingEdge[] = [];
    const edgeSet = new Set<string>();

    validProposals.forEach((p) => {
      // 1. FILIATION edge
      if (p.parentId && validIds.has(p.parentId)) {
        const edgeId = `filiation-${p.parentId}-${p.id}`;
        if (!edgeSet.has(edgeId)) {
          edgeSet.add(edgeId);
          edges.push({ id: edgeId, source: p.parentId, target: p.id, kind: "FILIATION" });
        }
      } else if (p.lineage && p.lineage.length > 0) {
        for (let i = p.lineage.length - 1; i >= 0; i--) {
          const ancestorId = p.lineage[i] as EntityId;
          if (ancestorId && validIds.has(ancestorId) && ancestorId !== p.id) {
            const edgeId = `orphan-${ancestorId}-${p.id}`;
            if (!edgeSet.has(edgeId)) {
              edgeSet.add(edgeId);
              edges.push({ id: edgeId, source: ancestorId, target: p.id, kind: "FILIATION", isOrphanFallback: true });
            }
            break;
          }
        }
      }

      // 2. NAVIGATION edge via dependencyIds
      if (p.dependencyIds && Array.isArray(p.dependencyIds)) {
        p.dependencyIds.forEach((depId) => {
          if (validIds.has(depId) && depId !== p.id) {
            const edgeId = `nav-${depId}-${p.id}`;
            if (!edgeSet.has(edgeId)) {
              edgeSet.add(edgeId);
              edges.push({ id: edgeId, source: depId, target: p.id, kind: "NAVIGATION" });
            }
          }
        });
      }

      // 3. RELATED edge via relatedProposalIds
      if (p.relatedProposalIds && Array.isArray(p.relatedProposalIds)) {
        p.relatedProposalIds.forEach((relId) => {
          if (validIds.has(relId) && relId !== p.id) {
            const pairKey = [p.id, relId].sort().join("-");
            const edgeId = `rel-${pairKey}`;
            if (!edgeSet.has(edgeId)) {
              edgeSet.add(edgeId);
              edges.push({ id: edgeId, source: p.id, target: relId, kind: "RELATED" });
            }
          }
        });
      }
    });

    return { nodes, edges };
  }

  async startDeepIdeationSwarm(
    projectId: EntityId,
    proposalId: EntityId,
    mode: "expand" | "alternatives" = "expand"
  ): Promise<{ proposals: DesignProposal[]; diagnostic?: any }> {
    const sourceProposal = await this.repos.designProposals.getById(proposalId);
    if (!sourceProposal) {
      throw new Error("Proposition introuvable");
    }

    if (sourceProposal.lineage && sourceProposal.lineage.length >= 5) {
      throw new Error("Profondeur maximale de tissage (5 niveaux) atteinte pour cette branche.");
    }

    const agentId = mode === "alternatives" ? "WORKSHOP-ALTERNATIVES" : "WORKSHOP-IDEATOR";
    const promptTpl = await this.repos.prompts.getActivePrompt(agentId);

    const contextText = `PROPOSITION SOURCE À DÉVELOPPER / APPROFONDIR :
- Titre : ${sourceProposal.title}
- Couche : ${sourceProposal.layer}
- Description : ${sourceProposal.description}
- Justification : ${sourceProposal.rationale}
- Origine : ${sourceProposal.originPerspective}

MISSION : Génère 3 à 4 propositions enfants directement rattachées et déclinées de cette proposition source pour tisser l'application.`;

    const req = {
      prompt: `${contextText}\n\nApplique strictement ton rôle et produit le format JSON conforme.`,
      systemPrompt: promptTpl?.systemPrompt || "Tu es un assistant de conception produit spécialisé.",
      tier: "SOL" as any,
      maxTokens: 4000,
      correlationId: `deep-swarm-${projectId}-${proposalId}`,
    };

    const res = await this.provider.complete(req);
    let parsed: any = null;
    try {
      parsed = safeParseModelJson(res.content) as any;
    } catch {
      parsed = null;
    }

    const rawProposals = parsed?.proposals || [];

    const nextLayerMap: Record<DesignLayer, DesignLayer> = {
      INTENTION: "HYPOTHESIS",
      HYPOTHESIS: "CAPABILITY",
      CAPABILITY: "FEATURE",
      FEATURE: "JOURNEY",
      JOURNEY: "SCREEN",
      SCREEN: "SCREEN",
    };

    const targetLayer = mode === "alternatives" ? sourceProposal.layer : (nextLayerMap[sourceProposal.layer] || "SCREEN");

    if (!Array.isArray(rawProposals) || rawProposals.length === 0) {
      return {
        proposals: [],
        diagnostic: {
          success: false,
          code: "NO_PROPOSALS_GENERATED",
          step: mode === "alternatives" ? "ALTERNATIVES_GENERATION" : "DEEPEN_GENERATION",
          agentId,
          promptId: promptTpl?.id || "N/A",
          promptVersion: promptTpl?.version || "N/A",
          sourceProposalId: proposalId,
          targetLayer,
          layer: targetLayer,
          parsedCount: 0,
          rejectedCount: 0,
          invalidReferenceCount: 0,
          persistenceCount: 0,
          persistedProposalIds: [],
          reasons: [
            `L'agent ${agentId} n'a pas pu produire de variante valide pour "${sourceProposal.title}".`,
            `La proposition source (${sourceProposal.layer}) manque peut-être de détails pour faire émerger de nouvelles déclinaisons.`
          ],
        }
      };
    }



    const newProposals: DesignProposal[] = [];
    for (const raw of rawProposals) {
      const prop = createDesignProposal({
        projectId,
        layer: targetLayer,
        title: raw.title || "Nouvelle proposition déclinée",
        shortPitch: raw.shortPitch || raw.title,
        category: raw.type || raw.category || targetLayer,
        description: raw.description || "",
        rationale: raw.justification || raw.rationale || `Décliné de : ${sourceProposal.title}`,
        userValue: raw.userValue || "",
        status: "PROPOSED",
        origin: "AI_ASSISTED",
        alternatives: [],
        risks: [],
        parentProposalIds: sourceProposal.id ? [sourceProposal.id] : [],
        targetPlatforms: sourceProposal.targetPlatforms || ["WEB_NEXTJS"],
        originAgentId: agentId,
        originPerspective: sourceProposal.originPerspective || "DeepSwarm",
        parentId: sourceProposal.id,
        rootProposalId: sourceProposal.rootProposalId || sourceProposal.id,
        lineage: [...(sourceProposal.lineage || []), sourceProposal.id],
        layerData: raw.specificData || undefined,
      });
      await this.repos.designProposals.save(prop);
      newProposals.push(prop);
    }

    return {
      proposals: newProposals,
      diagnostic: {
        success: newProposals.length > 0,
        code: "SUCCESS",
        step: mode === "alternatives" ? "ALTERNATIVES_GENERATION" : "DEEPEN_GENERATION",
        agentId,
        promptId: promptTpl?.id || "N/A",
        promptVersion: promptTpl?.version || "N/A",
        sourceProposalId: proposalId,
        targetLayer,
        layer: targetLayer,
        parsedCount: rawProposals.length,
        rejectedCount: 0,
        invalidReferenceCount: 0,
        persistenceCount: newProposals.length,
        persistedProposalIds: newProposals.map(p => p.id),
        reasons: []
      }
    };
  }

  async getFeaturePaths(projectId: EntityId): Promise<import("@pbh/domain").FeaturePath[]> {
    const proposals = await this.repos.designProposals.getByProjectId(projectId);
    return computeFeaturePaths(proposals);
  }

  async arbitratePath(
    projectId: EntityId,
    capabilityId: EntityId,
    action: 'ACCEPT_PROPOSED' | 'DEFER_PROPOSED' | 'REJECT_BRANCH'
  ): Promise<{ updatedCount: number; path: import("@pbh/domain").FeaturePath }> {
    const allProposals = await this.repos.designProposals.getByProjectId(projectId);
    const paths = computeFeaturePaths(allProposals);
    const targetPath = paths.find(p => p.capabilityProposal?.id === capabilityId || p.primaryJourneyId === capabilityId || p.id === capabilityId || p.canonicalNodeIds.includes(capabilityId));
    if (!targetPath) throw new Error("Feature Path non trouvé pour cette capacité.");

    let updatedCount = 0;
    const targetStatus = action === 'ACCEPT_PROPOSED' ? 'ACCEPTED' : action === 'DEFER_PROPOSED' ? 'DEFERRED' : 'REJECTED';

    // Seuls les nœuds avec statut PROPOSED du path sont modifiables collectivement
    const nodesToEvaluate = [
      ...targetPath.features,
      ...targetPath.journeys,
      ...targetPath.screens,
    ].filter(n => n.proposal.status === 'PROPOSED');

    for (const node of nodesToEvaluate) {
      // Correctif 3 : Protection des nœuds partagés lors des actions destructives (Reject / Defer)
      if ((action === 'REJECT_BRANCH' || action === 'DEFER_PROPOSED') && node.isShared) {
        // On ne rejette pas un élément partagé si d'autres paths pourraient encore en avoir besoin (sauf arbitrage explicite 1-à-1 par le user)
        continue;
      }
      await this.updateProposalStatus(node.proposal.id, targetStatus);
      updatedCount++;
    }

    const refreshProposals = await this.repos.designProposals.getByProjectId(projectId);
    const updatedPaths = computeFeaturePaths(refreshProposals);
    const updatedPath = updatedPaths.find(p => p.capabilityProposal?.id === capabilityId || p.primaryJourneyId === capabilityId || p.id === capabilityId || p.canonicalNodeIds.includes(capabilityId)) || updatedPaths[0]!;

    return { updatedCount, path: updatedPath };
  }

  /**
   * Essaim Vertical : Génère en cascade séquentielle de bout en bout les sous-couches 
   * (CAPABILITY -> FEATURE -> JOURNEY -> SCREEN) sous forme de Feature Paths fonctionnels.
   */
  async generateVerticalPathsFromCapabilities(
    projectId: EntityId,
    ideationIntensity: 'STANDARD' | 'ABUNDANT' | 'EXHAUSTIVE' = 'ABUNDANT',
    brainstormingMode: boolean = false
  ): Promise<{ paths: import("@pbh/domain").FeaturePath[]; summary: string; generatedCount: number }> {
    let allProposals = await this.repos.designProposals.getByProjectId(projectId);

    // 1. Vérification stricte des conditions d'activation
    const acceptedIntentions = allProposals.filter(p => p.layer === 'INTENTION' && (p.status === 'ACCEPTED' || p.status === 'LOCKED'));
    const acceptedCapabilities = allProposals.filter(p => p.layer === 'CAPABILITY' && (p.status === 'ACCEPTED' || p.status === 'LOCKED'));

    if (acceptedIntentions.length === 0) {
      throw new Error("Activation impossible : Vous devez d'abord valider au moins une INTENTION dans le brief ou l'atelier.");
    }
    if (acceptedCapabilities.length === 0) {
      throw new Error("Activation impossible : Vous devez d'abord valider au moins une CAPACITÉ (CAPABILITY) avant de déclencher l'essaim vertical.");
    }

    let generatedCount = 0;
    let newFeaturesCount = 0;
    let newJourneysCount = 0;
    let newScreensCount = 0;

    // Correctif 2 : Idempotence de l'Essaim Vertical
    // On ne génère une couche que s'il manque des éléments par rapport à la couche validée supérieure.
    const capabilitiesIds = new Set(acceptedCapabilities.map(c => c.id));
    
    // Vérifier si des FEATURE existent déjà pour ces capacités
    const existingFeatures = allProposals.filter(p => p.layer === 'FEATURE');
    const existingFeatureParentIds = new Set(existingFeatures.map(f => f.parentId));
    
    // Si toutes les capacités n'ont pas encore de FEATURE générée, on lance l'étape FEATURE
    // (Simplification de la règle d'idempotence stricte pour ne pas bloquer les évolutions : 
    // On ne bloque la génération que si un Path est DÉJÀ complet. L'utilisateur attend de la nouveauté s'il relance).
    const isFeaturePhaseComplete = Array.from(capabilitiesIds).every(id => existingFeatureParentIds.has(id));
    
    if (!isFeaturePhaseComplete || existingFeatures.length === 0) {
      const featureResult = await this.generateProposals(projectId, 'FEATURE', ideationIntensity, brainstormingMode);
      newFeaturesCount = featureResult.length || 0;
      generatedCount += newFeaturesCount;
      // Rafraîchir pour l'étape suivante
      allProposals = await this.repos.designProposals.getByProjectId(projectId);
    }

    const currentFeatures = allProposals.filter(p => p.layer === 'FEATURE' && (p.status === 'ACCEPTED' || p.status === 'PROPOSED'));
    const featureIds = new Set(currentFeatures.map(f => f.id));
    const existingJourneys = allProposals.filter(p => p.layer === 'JOURNEY');
    const existingJourneyParentIds = new Set(existingJourneys.map(j => j.parentId));
    
    const isJourneyPhaseComplete = featureIds.size > 0 && Array.from(featureIds).every(id => existingJourneyParentIds.has(id));

    if (!isJourneyPhaseComplete || existingJourneys.length === 0) {
      const journeyResult = await this.generateProposals(projectId, 'JOURNEY', ideationIntensity, brainstormingMode);
      newJourneysCount = journeyResult.length || 0;
      generatedCount += newJourneysCount;
      allProposals = await this.repos.designProposals.getByProjectId(projectId);
    }

    const currentJourneys = allProposals.filter(p => p.layer === 'JOURNEY' && (p.status === 'ACCEPTED' || p.status === 'PROPOSED'));
    const journeyIds = new Set(currentJourneys.map(j => j.id));
    const existingScreens = allProposals.filter(p => p.layer === 'SCREEN');
    const existingScreenParentIds = new Set(existingScreens.map(s => s.parentId));

    const isScreenPhaseComplete = journeyIds.size > 0 && Array.from(journeyIds).every(id => existingScreenParentIds.has(id));

    if (!isScreenPhaseComplete || existingScreens.length === 0) {
      const screenResult = await this.generateProposals(projectId, 'SCREEN', ideationIntensity, brainstormingMode);
      newScreensCount = screenResult.length || 0;
      generatedCount += newScreensCount;
    }

    // 5. Calcul déterministe des Feature Paths mis à jour
    const updatedProposals = await this.repos.designProposals.getByProjectId(projectId);
    const paths = computeFeaturePaths(updatedProposals);

    let summary = "";
    if (generatedCount === 0) {
      summary = `L'essaim vertical n'a rien généré de nouveau car tous les chemins fonctionnels semblent déjà complets (Idempotence activée). Refusez ou supprimez une branche pour forcer sa régénération.`;
    } else {
      summary = `Essaim vertical terminé avec succès ! ${generatedCount} proposition(s) générée(s) (${newFeaturesCount} Fonctions, ${newJourneysCount} Parcours, ${newScreensCount} Écrans) réparties sur ${paths.length} path(s).`;
    }

    return { paths, summary, generatedCount };
  }

  async getNodePathContext(projectId: EntityId, proposalId: EntityId): Promise<{
    canonicalProposal: DesignProposal;
    pathIds: string[];
    intentionIds: EntityId[];
    hypothesisIds: EntityId[];
    capabilityIds: EntityId[];
    featureIds: EntityId[];
    journeyIds: EntityId[];
    screenIds: EntityId[];
    directParentIds: EntityId[];
    directChildIds: EntityId[];
    dependencyIds: EntityId[];
    relatedProposalIds: EntityId[];
    sharedAcrossPathIds: string[];
    sharedUsageCount: number;
    impactScope: string[];
    reviewState: string;
    warnings: string[];
    stepUsages: { journeyId: EntityId; stepNumber: number; stepAction: string }[];
  }> {
    const proposal = await this.repos.designProposals.getById(proposalId);
    if (!proposal) throw new Error("Proposition introuvable");

    const allProps = await this.repos.designProposals.getByProjectId(projectId);
    const paths = computeFeaturePaths(allProps);

    const matchingPaths = paths.filter(p => p.canonicalNodeIds.includes(proposalId));
    const pathIds = matchingPaths.map(p => p.id);
    
    const directParentIds = [
      ...(proposal.parentId ? [proposal.parentId] : []),
      ...(proposal.parentProposalIds || [])
    ];
    const directChildren = allProps.filter(p => p.parentId === proposalId || (p.parentProposalIds || []).includes(proposalId));
    const directChildIds = directChildren.map(c => c.id);

    const stepUsages: { journeyId: EntityId; stepNumber: number; stepAction: string }[] = [];
    allProps.filter(p => p.layer === 'JOURNEY').forEach(j => {
      const jData = j.layerData as any;
      const steps = Array.isArray(jData?.steps) ? jData.steps : [];
      steps.forEach((st: any, idx: number) => {
        if ((st.featureIds || []).includes(proposalId) || (st.screenIds || []).includes(proposalId) || st.screenId === proposalId) {
          stepUsages.push({
            journeyId: j.id,
            stepNumber: st.stepNumber || (idx + 1),
            stepAction: st.userAction || st.action || `Étape ${idx + 1}`
          });
        }
      });
    });

    const impactScope = Array.from(new Set<string>([
      ...matchingPaths.map(p => p.title),
      ...directChildren.map(c => `${c.title} (${c.layer})`)
    ]));

    return {
      canonicalProposal: proposal,
      pathIds,
      intentionIds: Array.from(new Set(matchingPaths.flatMap(p => p.intentionIds))),
      hypothesisIds: Array.from(new Set(matchingPaths.flatMap(p => p.hypothesisIds))),
      capabilityIds: Array.from(new Set(matchingPaths.flatMap(p => p.capabilityIds))),
      featureIds: Array.from(new Set(matchingPaths.flatMap(p => p.featureIds))),
      journeyIds: Array.from(new Set(matchingPaths.flatMap(p => p.journeyIds))),
      screenIds: Array.from(new Set(matchingPaths.flatMap(p => p.screenIds))),
      directParentIds,
      directChildIds,
      dependencyIds: proposal.dependencyIds || [],
      relatedProposalIds: proposal.relatedProposalIds || [],
      sharedAcrossPathIds: pathIds,
      sharedUsageCount: pathIds.length,
      impactScope,
      reviewState: proposal.status,
      warnings: pathIds.length > 1 ? [`Nœud partagé dans ${pathIds.length} paths d'expérience.`] : [],
      stepUsages,
    };
  }
}
