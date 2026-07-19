import {
  createProject,
  createSource,
  createBriefItem,
  createDecision,
  createId,
  type EntityId,
} from "@pbh/domain";

/** Create a test project with default values */
export function testProject(overrides?: Partial<Parameters<typeof createProject>[0]>) {
  return createProject({
    name: overrides?.name ?? "Test Project",
    description: overrides?.description ?? "A test project for unit testing.",
    ideaText:
      overrides?.ideaText ??
      "Build a platform that helps users manage their tasks efficiently. Users should be able to create, assign, and track tasks. The system needs to support multiple teams and provide analytics dashboards.",
  });
}

/** Create a test source */
export function testSource(projectId: EntityId) {
  return createSource({
    projectId,
    type: "TEXT",
    label: "Test Source",
    content:
      "Users need a simple way to organize their work. The system should be accessible to non-technical users. Performance is critical for large datasets.",
  });
}

/** Create a test brief item */
export function testBriefItem(projectId: EntityId, sourceId?: EntityId, segmentId?: EntityId) {
  return createBriefItem({
    projectId,
    type: "OBJECTIVE",
    statement: "Enable users to efficiently manage tasks within the application.",
    sourceId: sourceId ?? createId(),
    sourceSegmentId: segmentId ?? createId(),
    excerpt: "manage their tasks efficiently",
    confidence: 0.85,
  });
}

/** Create a test decision */
export function testDecision(projectId: EntityId) {
  return createDecision({
    projectId,
    title: "Use a structured approach",
    statement: "The system will use a structured task management approach.",
    rationale: "Structured approaches improve traceability and governance.",
  });
}
