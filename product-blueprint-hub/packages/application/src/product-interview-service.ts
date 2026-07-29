import {
  EntityId,
  ProductInterviewSession,
  KnowledgeAssertion,
  ProductInterviewMessage,
  FunctionalBlueprint,
  ProductInterviewContradiction,
  BlueprintSectionId,
  BlueprintSection,
  BLUEPRINT_SECTION_TITLES,
  computeMaturity,
} from "@pbh/domain";
import { RepositoryRegistry } from "@pbh/repositories";

export class ProductInterviewService {
  constructor(private readonly repos: RepositoryRegistry) {}

  async getSession(projectId: EntityId): Promise<ProductInterviewSession | null> {
    return this.repos.productInterviewSessions.getByProjectId(projectId);
  }

  async initSession(projectId: EntityId): Promise<{
    session: ProductInterviewSession;
    blueprint: FunctionalBlueprint;
    isNew: boolean;
  }> {
    const existing = await this.repos.productInterviewSessions.getByProjectId(projectId);
    if (existing) {
      const blueprint = await this.repos.functionalBlueprints.getBySessionId(existing.id);
      return { session: existing, blueprint: blueprint!, isNew: false };
    }

    const project = await this.repos.projects.getById(projectId);
    const now = new Date().toISOString();
    const sessionId = `pi_session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const session: ProductInterviewSession = {
      id: sessionId,
      projectId,
      status: "IN_PROGRESS",
      maturityStep: "EXPLORATION",
      questionCount: 0,
      blockingUnknownsCount: 0,
      importantUnknownsCount: 0,
      openContradictionsCount: 0,
      allowFinalize: false,
      startedAt: now,
      lastActivityAt: now,
      version: 1,
    };

    // 14 Blueprint Sections
    const sectionIds: BlueprintSectionId[] = [
      "ORIGINAL_INTUITION",
      "REAL_PROBLEM",
      "DECISION_TO_SIMPLIFY",
      "MINIMAL_PROMISE",
      "USAGE_MOMENT",
      "VALUE_LOOP",
      "PRIMARY_EXPERIENCE",
      "MVP_SCOPE",
      "DATA_MATRIX",
      "RULES_AND_AI",
      "WEAK_STATES",
      "TRUST_AND_CONTROL",
      "EVOLUTION",
      "TRANSMISSION",
    ];

    const sections: Record<BlueprintSectionId, BlueprintSection> = {} as any;
    for (const sid of sectionIds) {
      sections[sid] = {
        id: sid,
        title: BLUEPRINT_SECTION_TITLES[sid],
        summary: sid === "ORIGINAL_INTUITION" && project?.description ? project.description : "",
        status: sid === "ORIGINAL_INTUITION" && project?.description ? "TO_CONFIRM" : "EMPTY",
        assertionIds: [],
        decisionIds: [],
        unknownIds: [],
        contradictionIds: [],
        lastUpdatedAt: now,
        version: 1,
      };
    }

    const blueprint: FunctionalBlueprint = {
      id: `pi_bp_${sessionId}`,
      projectId,
      sessionId,
      sections,
      version: 1,
    };

    await this.repos.productInterviewSessions.save(session);
    await this.repos.functionalBlueprints.save(blueprint);

    // If project has description/idea, create an initial assertion
    if (project?.description) {
      const assertion: KnowledgeAssertion = {
        id: `pi_assert_${Date.now()}_1`,
        projectId,
        sessionId,
        sectionId: "ORIGINAL_INTUITION",
        statement: project.description,
        status: "INFERRED",
        source: "PROJECT_IDEA",
        confidence: 90,
        impactedSectionIds: ["ORIGINAL_INTUITION"],
        createdAt: now,
        updatedAt: now,
        version: 1,
      };
      await this.repos.knowledgeAssertions.save(assertion);
    }

    return { session, blueprint, isNew: true };
  }

  async getBlueprint(projectId: EntityId): Promise<FunctionalBlueprint | null> {
    return this.repos.functionalBlueprints.getByProjectId(projectId);
  }

  async getAssertions(sessionId: EntityId): Promise<KnowledgeAssertion[]> {
    return this.repos.knowledgeAssertions.getBySessionId(sessionId);
  }

  async getMessages(sessionId: EntityId): Promise<ProductInterviewMessage[]> {
    return this.repos.productInterviewMessages.getBySessionId(sessionId);
  }

  async getContradictions(sessionId: EntityId): Promise<ProductInterviewContradiction[]> {
    return this.repos.productInterviewContradictions.getBySessionId(sessionId);
  }

  async confirmAssertion(assertionId: EntityId): Promise<KnowledgeAssertion> {
    const assertion = await this.repos.knowledgeAssertions.getById(assertionId);
    if (!assertion) throw new Error("Assertion non trouvée");
    const updated: KnowledgeAssertion = {
      ...assertion,
      status: "CONFIRMED",
      updatedAt: new Date().toISOString(),
      version: assertion.version + 1,
    };
    await this.repos.knowledgeAssertions.save(updated);
    await this.refreshSessionMaturity(assertion.sessionId);
    return updated;
  }

  async excludeAssertion(assertionId: EntityId): Promise<KnowledgeAssertion> {
    const assertion = await this.repos.knowledgeAssertions.getById(assertionId);
    if (!assertion) throw new Error("Assertion non trouvée");
    const updated: KnowledgeAssertion = {
      ...assertion,
      status: "EXCLUDED",
      updatedAt: new Date().toISOString(),
      version: assertion.version + 1,
    };
    await this.repos.knowledgeAssertions.save(updated);
    await this.refreshSessionMaturity(assertion.sessionId);
    return updated;
  }

  async deferAssertion(assertionId: EntityId): Promise<KnowledgeAssertion> {
    const assertion = await this.repos.knowledgeAssertions.getById(assertionId);
    if (!assertion) throw new Error("Assertion non trouvée");
    const updated: KnowledgeAssertion = {
      ...assertion,
      status: "DEFERRED",
      updatedAt: new Date().toISOString(),
      version: assertion.version + 1,
    };
    await this.repos.knowledgeAssertions.save(updated);
    await this.refreshSessionMaturity(assertion.sessionId);
    return updated;
  }

  async pauseSession(sessionId: EntityId): Promise<ProductInterviewSession> {
    const session = await this.repos.productInterviewSessions.getById(sessionId);
    if (!session) throw new Error("Session non trouvée");
    const updated: ProductInterviewSession = {
      ...session,
      status: "PAUSED",
      lastActivityAt: new Date().toISOString(),
      version: session.version + 1,
    };
    await this.repos.productInterviewSessions.save(updated);
    return updated;
  }

  async finalizeSession(sessionId: EntityId): Promise<ProductInterviewSession> {
    const session = await this.repos.productInterviewSessions.getById(sessionId);
    if (!session) throw new Error("Session non trouvée");

    const contradictions = await this.repos.productInterviewContradictions.getBySessionId(sessionId);
    const openBlocking = contradictions.filter((c) => c.status === "OPEN" && c.isBlocking);
    if (openBlocking.length > 0) {
      throw new Error(`Impossible de finaliser : ${openBlocking.length} contradiction(s) bloquante(s) ouverte(s).`);
    }

    const now = new Date().toISOString();
    const updated: ProductInterviewSession = {
      ...session,
      status: "FINALIZED",
      maturityStep: "READY",
      allowFinalize: true,
      lastActivityAt: now,
      finalizedAt: now,
      version: session.version + 1,
    };
    await this.repos.productInterviewSessions.save(updated);
    return updated;
  }

  private async refreshSessionMaturity(sessionId: EntityId): Promise<void> {
    const session = await this.repos.productInterviewSessions.getById(sessionId);
    if (!session) return;
    const assertions = await this.repos.knowledgeAssertions.getBySessionId(sessionId);
    const blueprint = await this.repos.functionalBlueprints.getBySessionId(sessionId);
    const contradictions = await this.repos.productInterviewContradictions.getBySessionId(sessionId);

    const mat = computeMaturity(assertions, blueprint?.sections || ({} as any), contradictions);
    const updated: ProductInterviewSession = {
      ...session,
      maturityStep: mat.maturityStep,
      blockingUnknownsCount: mat.blockingUnknownsCount,
      openContradictionsCount: mat.openContradictionsCount,
      allowFinalize: mat.allowFinalize,
      lastActivityAt: new Date().toISOString(),
      version: session.version + 1,
    };
    await this.repos.productInterviewSessions.save(updated);
  }
}
