import { DesignLayer, DesignProposal, TargetPlatform, createDesignProposal } from "@pbh/domain";
import type { EntityId, DesignGraph, DesignBaseline, DesignBaselineSummary, WeavingEdge } from "@pbh/domain";
import { createDesignGraph, createId } from "@pbh/domain";
import type { RepositoryRegistry } from "@pbh/repositories";
import type { IModelProvider } from "@pbh/model-gateway";
import { safeParseModelJson } from "@pbh/model-gateway";

export class DesignWorkshopUseCases {
  constructor(
    private readonly repos: RepositoryRegistry,
    private readonly provider: IModelProvider
  ) {}

  async getProposals(projectId: EntityId, layer: DesignLayer): Promise<DesignProposal[]> {
    return this.repos.designProposals.getByLayer(projectId, layer);
  }

  private async buildUpstreamContext(projectId: EntityId, layer: DesignLayer): Promise<string> {
    const UPSTREAM_LAYERS: Record<DesignLayer, DesignLayer[]> = {
      INTENTION:  [],
      HYPOTHESIS: ['INTENTION'],
      CAPABILITY: ['INTENTION', 'HYPOTHESIS'],
      FEATURE:    ['CAPABILITY'],
      JOURNEY:    ['FEATURE'],
      SCREEN:     ['JOURNEY', 'FEATURE'],
    };

    const upstream = UPSTREAM_LAYERS[layer] || [];
    if (upstream.length === 0) {
      return "N/A — Couche initiale. Dérivez vos propositions à partir des éléments de brief confirmés.";
    }

    const sections: Record<string, any[]> = {};
    for (const upLayer of upstream) {
      const proposals = await this.repos.designProposals.getByLayer(projectId, upLayer);
      const validProposals = proposals.filter((p) => p.status === "ACCEPTED" || p.status === "PROPOSED");
      if (validProposals.length > 0) {
        sections[upLayer] = validProposals.slice(0, 20).map((p) => ({
          id: p.id,
          title: p.title,
          summary: p.description.length > 220 ? p.description.slice(0, 220) + "..." : p.description,
          category: p.category || p.originPerspective,
        }));
      }
    }

    if (Object.keys(sections).length === 0) {
      return "AUCUNE PROPOSITION AMONT VALIDÉE. Fallback : dérivez vos propositions des éléments confirmés du brief, en respectant STRICTEMENT la nature de la couche " + layer + ".";
    }

    return JSON.stringify(sections, null, 2);
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

    // Persist proposals
    const persistedProposals: DesignProposal[] = [];
    if (parsedResult?.proposals) {
      for (const p of parsedResult.proposals) {
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
          parentId: p.parentId || null,
          rootProposalId: p.rootProposalId || null,
          childrenIds: p.childrenIds || [],
          relatedProposalIds: p.relatedProposalIds || [],
          dependencyIds: p.dependencies || [],
          consequenceIds: p.consequenceIds || [],
          lineage: p.lineage || [],
          priority: p.priority || 'MEDIUM',
          complexity: p.complexity || 'M',
          confidence: p.confidence || 50,
          originAgentId: p.originAgent || lastAgentId,
          category: p.type || "General",
          alternatives: [],
          risks: [],
          parentProposalIds: []
        });
        await this.repos.designProposals.save(dp);
        persistedProposals.push(dp);
        p.id = dp.id; // Assign real ID
      }
      diagnostic.persistenceStatus = "SAVED";
      diagnostic.persistedProposalCount = persistedProposals.length;
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
}
