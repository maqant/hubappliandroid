import { DesignLayer, DesignProposal, TargetPlatform, createDesignProposal } from "@pbh/domain";
import type { EntityId, DesignGraph, DesignBaseline } from "@pbh/domain";
import { createDesignGraph, createId } from "@pbh/domain";
import type { RepositoryRegistry } from "@pbh/repositories";
import type { IModelProvider } from "@pbh/model-gateway";

export class DesignWorkshopUseCases {
  constructor(
    private readonly repos: RepositoryRegistry,
    private readonly provider: IModelProvider
  ) {}

  async getProposals(projectId: EntityId, layer: DesignLayer): Promise<DesignProposal[]> {
    return this.repos.designProposals.getByLayer(projectId, layer);
  }

  async generateProposals(
    projectId: EntityId,
    layer: DesignLayer,
    ideationIntensity: 'STANDARD' | 'ABUNDANT' | 'EXHAUSTIVE' = 'ABUNDANT',
    onProgress?: (agentId: string, status: "pending" | "running" | "done" | "error") => void
  ): Promise<any[]> {
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
    const confirmedItems = briefItems.filter((b) => b.status === "LOCKED" || b.status === "ACCEPTED");
    
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
        .replace(/{{UPSTREAM_OUTPUTS_JSON}}/g, "N/A") // First layer
        .replace(/{{OUTPUT_SCHEMA_JSON}}/g, OUTPUT_SCHEMA_JSON)
        .replace(/{{IDEATION_PERSPECTIVE}}/g, agentData.perspective)
        .replace(/{{IDEATION_INTENSITY}}/g, ideationIntensity)
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
      const match = finalResult.match(/\{[\s\S]*\}/);
      const jsonStr = match ? match[0] : finalResult;
      parsedResult = JSON.parse(jsonStr);
      parseStatus = "SUCCESS";
    } catch(e) {
      console.error("Failed to parse workshop output", e);
      parseStatus = "ERROR";
      throw new Error(`La réponse IA n'a pas pu être interprétée. (Agent: ${lastAgentId}, Erreur: ${String(e)})`);
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
}
