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

export class DesignWorkshopUseCases {
  constructor(
    private readonly repos: RepositoryRegistry,
    private readonly provider: IModelProvider
  ) {}

  async getProposals(projectId: EntityId, layer: DesignLayer): Promise<DesignProposal[]> {
    return this.repos.designProposals.getByLayer(projectId, layer);
  }

  // Source unique de vérité du contexte amont (utilisée par buildUpstreamContext ET getUpstreamContextPreview)
  private async selectUpstreamProposals(
    projectId: EntityId,
    layer: DesignLayer
  ): Promise<{ layer: DesignLayer; proposals: DesignProposal[] }[]> {
    const UPSTREAM_LAYERS: Record<DesignLayer, DesignLayer[]> = {
      INTENTION:  [],
      HYPOTHESIS: ['INTENTION'],
      CAPABILITY: ['INTENTION', 'HYPOTHESIS'],
      FEATURE:    ['CAPABILITY'],
      JOURNEY:    ['FEATURE'],
      SCREEN:     ['JOURNEY', 'FEATURE'],
    };
    const upstream = UPSTREAM_LAYERS[layer] || [];
    const result: { layer: DesignLayer; proposals: DesignProposal[] }[] = [];
    for (const upLayer of upstream) {
      const proposals = await this.repos.designProposals.getByLayer(projectId, upLayer);
      const valid = proposals
        .filter(p => p.status === 'ACCEPTED' || p.status === 'PROPOSED')
        .slice(0, 20);
      if (valid.length > 0) {
        result.push({ layer: upLayer, proposals: valid });
      }
    }
    return result;
  }

  private async buildUpstreamContext(projectId: EntityId, layer: DesignLayer): Promise<string> {
    const groups = await this.selectUpstreamProposals(projectId, layer);
    if (groups.length === 0) {
      if (layer === 'INTENTION') {
        return "N/A — Couche initiale. Dérivez vos propositions à partir des éléments de brief confirmés.";
      }
      return "AUCUNE PROPOSITION AMONT VALIDÉE. Fallback : dérivez vos propositions des éléments confirmés du brief, en respectant STRICTEMENT la nature de la couche " + layer + ".";
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
    const groups = await this.selectUpstreamProposals(projectId, layer);
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
    brainstormingMode: boolean = false,
    onProgress?: (agentId: string, status: "pending" | "running" | "done" | "error") => void
  ): Promise<any[]> {
    const VOLUMETRY: Record<'STANDARD' | 'ABUNDANT' | 'EXHAUSTIVE', { synthesizer: string; perAgent: string }> = {
      STANDARD:   { synthesizer: '4 à 6',   perAgent: '2 à 3' },
      ABUNDANT:   { synthesizer: '8 à 10',  perAgent: '3 à 4' },
      EXHAUSTIVE: { synthesizer: '12 à 16', perAgent: '4 à 5' },
    };

    const vol = VOLUMETRY[ideationIntensity] || VOLUMETRY.ABUNDANT;
    const brainstormFlag = brainstormingMode ? "ON" : "OFF";
    const upstreamContext = await this.buildUpstreamContext(projectId, layer);

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
      schemaVersion: "workshop-response-v1",
      agentId: "string",
      layer: "string",
      summary: "string",
      proposals: [{
        id: "string",
        parentId: "string (optional)",
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
        actions: ["string"]
      }],
      questions: [{
        statement: "string",
        importance: "string"
      }],
      assumptions: [{
        statement: "string",
        impact: "string"
      }],
      warnings: [{
        message: "string",
        severity: "string"
      }],
      graphOperations: [{
        type: "string",
        node: "string"
      }]
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

      let userPrompt = promptTpl.userPromptTemplate
        .replace(/{{LANGUAGE}}/g, promptTpl.language)
        .replace(/{{TARGET_PLATFORM}}/g, project?.targetPlatforms?.join(", ") || "WEB_NEXTJS")
        .replace(/{{PROJECT_TITLE}}/g, project?.name || "")
        .replace(/{{PROJECT_ID}}/g, projectId)
        .replace(/{{SOURCE_TEXT}}/g, project?.ideaText || "")
        .replace(/{{CONFIRMED_ITEMS_JSON}}/g, JSON.stringify(confirmedItems.map(i => i.statement)))
        .replace(/{{CURRENT_LAYER}}/g, layer)
        .replace(/{{UPSTREAM_OUTPUTS_JSON}}/g, upstreamContext)
        .replace(/{{OUTPUT_SCHEMA_JSON}}/g, OUTPUT_SCHEMA_JSON)
        .replace(/{{IDEATION_PERSPECTIVE}}/g, agentData.perspective)
        .replace(/{{IDEATION_INTENSITY}}/g, ideationIntensity)
        .replace(/{{BRAINSTORMING_MODE}}/g, brainstormFlag)
        .replace(/{{TARGET_PROPOSAL_COUNT}}/g, vol.perAgent)
        .replace(/{{[A-Z_]+}}/g, "N/A"); 

      const req = {
        prompt: userPrompt,
        systemPrompt: promptTpl.systemPrompt + `\nTa perspective : ${agentData.perspective}`,
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

      let userPrompt = promptTpl.userPromptTemplate
        .replace(/{{LANGUAGE}}/g, promptTpl.language)
        .replace(/{{TARGET_PLATFORM}}/g, project?.targetPlatforms?.join(", ") || "WEB_NEXTJS")
        .replace(/{{PROJECT_TITLE}}/g, project?.name || "")
        .replace(/{{PROJECT_ID}}/g, projectId)
        .replace(/{{SOURCE_TEXT}}/g, project?.ideaText || "")
        .replace(/{{CONFIRMED_ITEMS_JSON}}/g, JSON.stringify(confirmedItems.map(i => i.statement)))
        .replace(/{{CURRENT_LAYER}}/g, layer)
        .replace(/{{UPSTREAM_OUTPUTS_JSON}}/g, upstreamOutputs)
        .replace(/{{OUTPUT_SCHEMA_JSON}}/g, OUTPUT_SCHEMA_JSON)
        .replace(/{{IDEATION_PERSPECTIVE}}/g, agentData.perspective)
        .replace(/{{IDEATION_INTENSITY}}/g, ideationIntensity)
        .replace(/{{BRAINSTORMING_MODE}}/g, brainstormFlag)
        .replace(/{{TARGET_PROPOSAL_COUNT}}/g, vol.synthesizer)
        .replace(/{{[A-Z_]+}}/g, "N/A");

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
      promptId: lastAgentId, // Simplified for diagnostic
      promptVersion: 1,
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
      // Charger les propositions amont pour le PostProcessor
      const upstreamGroups = layer === 'INTENTION'
        ? []
        : await this.selectUpstreamProposals(projectId, layer);
      const upstreamFlat: DesignProposal[] = upstreamGroups.flatMap(g => g.proposals);
      const validUpstreamIds = new Set(upstreamFlat.map(u => u.id));

      for (const p of parsedResult.proposals) {
        // Résolution des liens (Prompt as best effort, PostProcessor as guarantee)
        const links: LinkResolution = layer === 'INTENTION'
          ? { parentId: null, lineage: [], linkSource: null, linkConfidence: null }
          : resolveProposalLinks(p as ParsedProposal, upstreamFlat);

        // Filtrer les dependencyIds et parentProposalIds hallucinés
        const safeDependencyIds = (p.dependencies ?? []).filter((id: string) => validUpstreamIds.has(id as EntityId));
        const safeParentProposalIds = (p.parentProposalIds || p.relatedProposalIds || []).filter((id: string) => validUpstreamIds.has(id as EntityId) && id !== links.parentId);

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
          parentProposalIds: safeParentProposalIds
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
    }

    return {
      ...parsedResult,
      proposals: parsedResult.proposals, // Use the one with updated IDs
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
  ): Promise<any[]> {
    const sourceProposal = await this.repos.designProposals.getById(proposalId);
    if (!sourceProposal) throw new Error("Proposal not found");

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
    const parsed = safeParseModelJson(res.content) as any;
    const rawProposals = parsed?.proposals || [];
    if (!Array.isArray(rawProposals) || rawProposals.length === 0) return [];

    const nextLayerMap: Record<DesignLayer, DesignLayer> = {
      INTENTION: "HYPOTHESIS",
      HYPOTHESIS: "CAPABILITY",
      CAPABILITY: "FEATURE",
      FEATURE: "JOURNEY",
      JOURNEY: "SCREEN",
      SCREEN: "SCREEN",
    };

    const targetLayer = nextLayerMap[sourceProposal.layer] || "SCREEN";

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
      });
      await this.repos.designProposals.save(prop);
      newProposals.push(prop);
    }

    return newProposals;
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
    const targetPath = paths.find(p => p.capabilityProposal.id === capabilityId);
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
    const updatedPath = updatedPaths.find(p => p.capabilityProposal.id === capabilityId)!;

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
}
