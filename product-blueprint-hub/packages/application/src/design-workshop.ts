import type { EntityId, DesignProposal, DesignGraph, TargetPlatform, DesignLayer, DesignBaseline } from "@pbh/domain";
import { createDesignProposal, createDesignGraph, createId } from "@pbh/domain";
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

  async generateProposals(projectId: EntityId, layer: DesignLayer, onProgress?: (agentId: string, status: "pending" | "running" | "done" | "error") => void): Promise<any[]> {
    // 1. Déterminer les agents à appeler selon la couche
    let agentsToCall: string[] = [];
    if (layer === "INTENTION") agentsToCall = ["WORKSHOP-INTENT", "WORKSHOP-CRITIC", "WORKSHOP-SYNTHESIZER"];
    else if (layer === "HYPOTHESIS") agentsToCall = ["WORKSHOP-HYPOTHESIS", "WORKSHOP-CRITIC", "WORKSHOP-SYNTHESIZER"];
    else if (layer === "CAPABILITY") agentsToCall = ["WORKSHOP-CAPABILITY", "WORKSHOP-IDEATOR", "WORKSHOP-DEPENDENCIES", "WORKSHOP-SYNTHESIZER"];
    else if (layer === "FEATURE") agentsToCall = ["WORKSHOP-FEATURE", "WORKSHOP-IDEATOR", "WORKSHOP-ALTERNATIVES", "WORKSHOP-DEPENDENCIES", "WORKSHOP-SYNTHESIZER"];
    else if (layer === "JOURNEY") agentsToCall = ["WORKSHOP-JOURNEY", "WORKSHOP-DEPENDENCIES", "WORKSHOP-CRITIC", "WORKSHOP-SYNTHESIZER"];
    else if (layer === "SCREEN") agentsToCall = ["WORKSHOP-SCREEN", "WORKSHOP-JOURNEY", "WORKSHOP-DEPENDENCIES", "WORKSHOP-SYNTHESIZER"];
    else agentsToCall = ["WORKSHOP-SYNTHESIZER"];

    const project = await this.repos.projects.getById(projectId);
    const briefItems = await this.repos.briefItems.getByProjectId(projectId);
    const confirmedItems = briefItems.filter((b) => b.status === "LOCKED" || b.status === "ACCEPTED");
    
    const OUTPUT_SCHEMA_JSON = JSON.stringify({
      schemaVersion: "workshop-response-v1",
      agentId: "string",
      layer: "string",
      summary: "string",
      proposals: [{
        title: "string",
        type: "string",
        description: "string",
        justification: "string",
        userValue: "string",
        confidence: "number",
        originAgent: "string",
        priority: "string",
        complexity: "string",
        dependencies: ["string"],
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
      agentsToCall.forEach(a => onProgress(a, "pending"));
    }

    const routedAgentIds = [...agentsToCall];
    let promptFound = true;
    let systemPromptLength = 0;
    let userPromptLength = 0;
    let parseStatus = "PENDING";
    let lastAgentId = "";

    for (const agentId of agentsToCall) {
      if (onProgress) onProgress(agentId, "running");
      lastAgentId = agentId;
      const promptTpl = await this.repos.prompts.getActivePrompt(agentId);
      if (!promptTpl) {
        console.warn(`Prompt missing for ${agentId}`);
        promptFound = false;
        if (onProgress) onProgress(agentId, "error");
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
        .replace(/{{[A-Z_]+}}/g, "N/A"); // replace others with N/A

      if (agentId === agentsToCall[agentsToCall.length - 1]) {
        systemPromptLength = promptTpl.systemPrompt.length;
        userPromptLength = userPrompt.length;
      }

      const req = {
        prompt: userPrompt,
        systemPrompt: promptTpl.systemPrompt,
        tier: "SOL" as any, 
        maxTokens: 4000,
        correlationId: `workshop-${projectId}-${layer}-${agentId}`,
        metadata: { projectId, layer, agentId }
      };

      try {
        const res = await this.provider.complete(req);
        upstreamOutputs += `\n\n--- OUTPUT FROM ${agentId} ---\n${res.content}`;
        finalResult = res.content; 
        if (onProgress) onProgress(agentId, "done");
      } catch (e) {
        if (onProgress) onProgress(agentId, "error");
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

    const diagnostic = {
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
      persistenceStatus: "NOT_SAVED_YET"
    };

    return {
      ...parsedResult,
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
