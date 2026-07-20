import type {
  AgentDefinition,
  EntityId,
  MissionManifest,
  TaskDefinition,
  BriefItem,
} from "@pbh/domain";
import { createId } from "@pbh/domain";

// ============================================
// Fixed Agents — 18 mandatory guardians
// ============================================

const FIXED_AGENTS: Omit<AgentDefinition, "id" | "version" | "createdAt" | "updatedAt">[] = [
  {
    agentId: "FIX-DIRECTOR",
    name: "Mission Director",
    type: "FIXED",
    removable: false,
    purpose: "Refer to Prompt Registry.",
    failureMode: "BLOCKED if contract or proof missing.",
  },
  {
    agentId: "FIX-PRODUCT",
    name: "Product Direction",
    type: "FIXED",
    removable: false,
    purpose: "Refer to Prompt Registry.",
    failureMode: "BLOCKED if contract or proof missing.",
  },
  {
    agentId: "FIX-SCOPE",
    name: "MVP Guardian",
    type: "FIXED",
    removable: false,
    purpose: "Refer to Prompt Registry.",
    failureMode: "BLOCKED if contract or proof missing.",
  },
  {
    agentId: "FIX-NOVICE",
    name: "Non-Technical User",
    type: "FIXED",
    removable: false,
    purpose: "Refer to Prompt Registry.",
    failureMode: "BLOCKED if contract or proof missing.",
  },
  {
    agentId: "FIX-UX",
    name: "Guided UX",
    type: "FIXED",
    removable: false,
    purpose: "Refer to Prompt Registry.",
    failureMode: "BLOCKED if contract or proof missing.",
  },
  {
    agentId: "FIX-DESIGN",
    name: "Design System",
    type: "FIXED",
    removable: false,
    purpose: "Refer to Prompt Registry.",
    failureMode: "BLOCKED if contract or proof missing.",
  },
  {
    agentId: "FIX-CROSSAPP",
    name: "Cross-Application Consistency",
    type: "FIXED",
    removable: false,
    purpose: "Refer to Prompt Registry.",
    failureMode: "BLOCKED if contract or proof missing.",
  },
  {
    agentId: "FIX-ARCH",
    name: "React Vercel Architecture",
    type: "FIXED",
    removable: false,
    purpose: "Refer to Prompt Registry.",
    failureMode: "BLOCKED if contract or proof missing.",
  },
  {
    agentId: "FIX-AI",
    name: "AI Architecture",
    type: "FIXED",
    removable: false,
    purpose: "Refer to Prompt Registry.",
    failureMode: "BLOCKED if contract or proof missing.",
  },
  {
    agentId: "FIX-SECURITY",
    name: "Security",
    type: "FIXED",
    removable: false,
    purpose: "Refer to Prompt Registry.",
    failureMode: "BLOCKED if contract or proof missing.",
  },
  {
    agentId: "FIX-PRIVACY",
    name: "Privacy",
    type: "FIXED",
    removable: false,
    purpose: "Refer to Prompt Registry.",
    failureMode: "BLOCKED if contract or proof missing.",
  },
  {
    agentId: "FIX-COMPLIANCE",
    name: "Compliance",
    type: "FIXED",
    removable: false,
    purpose: "Refer to Prompt Registry.",
    failureMode: "BLOCKED if contract or proof missing.",
  },
  {
    agentId: "FIX-A11Y",
    name: "Accessibility",
    type: "FIXED",
    removable: false,
    purpose: "Refer to Prompt Registry.",
    failureMode: "BLOCKED if contract or proof missing.",
  },
  {
    agentId: "FIX-QA",
    name: "QA",
    type: "FIXED",
    removable: false,
    purpose: "Refer to Prompt Registry.",
    failureMode: "BLOCKED if contract or proof missing.",
  },
  {
    agentId: "FIX-VERCEL",
    name: "Vercel Deployment",
    type: "FIXED",
    removable: false,
    purpose: "Refer to Prompt Registry.",
    failureMode: "BLOCKED if contract or proof missing.",
  },
  {
    agentId: "FIX-COST",
    name: "Costs",
    type: "FIXED",
    removable: false,
    purpose: "Refer to Prompt Registry.",
    failureMode: "BLOCKED if contract or proof missing.",
  },
  {
    agentId: "FIX-TECH-AUDIT",
    name: "Technical Audit",
    type: "FIXED",
    removable: false,
    purpose: "Refer to Prompt Registry.",
    failureMode: "BLOCKED if contract or proof missing.",
  },
  {
    agentId: "FIX-PACKAGE-AUDIT",
    name: "Package Audit",
    type: "FIXED",
    removable: false,
    purpose: "Refer to Prompt Registry.",
    failureMode: "BLOCKED if contract or proof missing.",
  },
];

export function getFixedAgents(): AgentDefinition[] {
  const now = new Date().toISOString();
  return FIXED_AGENTS.map((a) => ({
    ...a,
    id: createId(),
    version: 1,
    createdAt: now,
    updatedAt: now,
  }));
}

// ============================================
// Dynamic Agent Creation
// ============================================

export function createDynamicAgents(briefItems: BriefItem[]): AgentDefinition[] {
  const now = new Date().toISOString();
  const agents: AgentDefinition[] = [];

  // Detect unique domains from brief items
  const domains = new Set<string>();
  for (const item of briefItems) {
    if (item.status === "ACCEPTED" || item.status === "CORRECTED" || item.status === "LOCKED") {
      if (item.type === "USER_NEED") domains.add("user-research");
      if (item.type === "RISK") domains.add("risk-analysis");
      if (item.type === "CONSTRAINT") domains.add("constraint-validation");
    }
  }

  if (domains.has("user-research")) {
    agents.push({
      id: createId(),
      agentId: "DYN-USER-RESEARCH",
      name: "User Research Specialist",
      type: "DYNAMIC",
      removable: true,
      purpose: "Deep analysis of user needs and personas.",
      failureMode: "DEGRADED quality of user analysis.",
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (domains.has("risk-analysis")) {
    agents.push({
      id: createId(),
      agentId: "DYN-RISK-ANALYST",
      name: "Risk Analyst",
      type: "DYNAMIC",
      removable: true,
      purpose: "Detailed risk assessment and mitigation planning.",
      failureMode: "DEGRADED risk coverage.",
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  return agents;
}

// ============================================
// Mission Planning
// ============================================

export function planMission(params: {
  projectId: EntityId;
  name: string;
  briefItems: BriefItem[];
  budgetTokens?: number;
}): MissionManifest {
  const now = new Date().toISOString();
  const missionId = createId();

  const fixedAgents = getFixedAgents();
  const dynamicAgents = createDynamicAgents(params.briefItems);
  const allAgents = [...fixedAgents, ...dynamicAgents];

  const tasks = createTasksFromAgents(missionId, params.projectId, allAgents, params.briefItems);

  const totalBudget = params.budgetTokens ?? 100000;

  return {
    id: missionId,
    projectId: params.projectId,
    name: params.name,
    status: "PLANNED",
    agents: allAgents,
    tasks,
    totalBudgetTokens: totalBudget,
    usedBudgetTokens: 0,
    totalCalls: 0,
    risks: [
      "Brief items may need revision during execution.",
      "Dynamic agents may need adjustment based on findings.",
    ],
    assumptions: [
      "All LOCKED decisions remain stable during execution.",
      "FakeModelProvider produces deterministic outputs.",
    ],
    gates: [
      "G01",
      "G02",
      "G03",
      "G04",
      "G05",
      "G06",
      "G07",
      "G08",
      "G09",
      "G10",
      "G11",
      "G12",
      "G13",
      "G14",
      "G15",
      "G16",
      "G17",
      "G18",
      "G19",
      "G20",
    ],
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

function createTasksFromAgents(
  missionId: EntityId,
  projectId: EntityId,
  agents: AgentDefinition[],
  _briefItems: BriefItem[],
): TaskDefinition[] {
  const now = new Date().toISOString();
  const tasks: TaskDefinition[] = [];

  // Phase 1: Analysis tasks (parallel)
  const analysisAgents = agents.filter((a) =>
    ["FIX-PRODUCT", "FIX-SCOPE", "FIX-NOVICE", "FIX-UX"].includes(a.agentId),
  );
  const analysisTaskIds: EntityId[] = [];

  for (const agent of analysisAgents) {
    const taskId = createId();
    analysisTaskIds.push(taskId);
    tasks.push({
      id: taskId,
      projectId,
      missionId,
      agentId: agent.agentId,
      name: `${agent.name} Analysis`,
      description: `${agent.purpose} — Phase 1 parallel analysis.`,
      status: "PENDING",
      dependencies: [],
      parallelGroup: "phase-1-analysis",
      modelTier: "TERRA",
      maxIterations: 3,
      budgetTokens: 5000,
      outputs: [],
      checkpointData: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Phase 2: Design tasks (depend on analysis)
  const designAgents = agents.filter((a) =>
    ["FIX-DESIGN", "FIX-CROSSAPP", "FIX-ARCH", "FIX-AI"].includes(a.agentId),
  );
  const designTaskIds: EntityId[] = [];

  for (const agent of designAgents) {
    const taskId = createId();
    designTaskIds.push(taskId);
    tasks.push({
      id: taskId,
      projectId,
      missionId,
      agentId: agent.agentId,
      name: `${agent.name} Design`,
      description: `${agent.purpose} — Phase 2 design.`,
      status: "PENDING",
      dependencies: analysisTaskIds,
      parallelGroup: "phase-2-design",
      modelTier: "TERRA",
      maxIterations: 3,
      budgetTokens: 5000,
      outputs: [],
      checkpointData: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Phase 3: Security & Compliance (depend on design)
  const securityAgents = agents.filter((a) =>
    ["FIX-SECURITY", "FIX-PRIVACY", "FIX-COMPLIANCE", "FIX-A11Y"].includes(a.agentId),
  );
  const securityTaskIds: EntityId[] = [];

  for (const agent of securityAgents) {
    const taskId = createId();
    securityTaskIds.push(taskId);
    tasks.push({
      id: taskId,
      projectId,
      missionId,
      agentId: agent.agentId,
      name: `${agent.name} Review`,
      description: `${agent.purpose} — Phase 3 security & compliance.`,
      status: "PENDING",
      dependencies: designTaskIds,
      parallelGroup: "phase-3-security",
      modelTier: "TERRA",
      maxIterations: 2,
      budgetTokens: 3000,
      outputs: [],
      checkpointData: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Phase 4: Audits (depend on all previous)
  const auditAgents = agents.filter((a) =>
    ["FIX-QA", "FIX-TECH-AUDIT", "FIX-PACKAGE-AUDIT", "FIX-COST", "FIX-VERCEL"].includes(a.agentId),
  );

  for (const agent of auditAgents) {
    tasks.push({
      id: createId(),
      projectId,
      missionId,
      agentId: agent.agentId,
      name: `${agent.name} Audit`,
      description: `${agent.purpose} — Phase 4 final audits.`,
      status: "PENDING",
      dependencies: securityTaskIds,
      parallelGroup: "phase-4-audit",
      modelTier: agent.agentId === "FIX-TECH-AUDIT" ? "SOL" : "TERRA",
      maxIterations: 2,
      budgetTokens: 4000,
      outputs: [],
      checkpointData: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Phase 5: Director synthesis (depends on audits)
  const allPrevIds = tasks.map((t) => t.id);
  tasks.push({
    id: createId(),
    projectId,
    missionId,
    agentId: "FIX-DIRECTOR",
    name: "Mission Synthesis",
    description: "Final synthesis and blueprint consolidation.",
    status: "PENDING",
    dependencies: allPrevIds,
    parallelGroup: null,
    modelTier: "SOL",
    maxIterations: 1,
    budgetTokens: 8000,
    outputs: [],
    checkpointData: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });

  // Dynamic agent tasks
  const dynamicAgents = agents.filter((a) => a.type === "DYNAMIC");
  for (const agent of dynamicAgents) {
    tasks.push({
      id: createId(),
      projectId,
      missionId,
      agentId: agent.agentId,
      name: `${agent.name} Specialist Task`,
      description: `${agent.purpose} — Dynamic specialist.`,
      status: "PENDING",
      dependencies: analysisTaskIds,
      parallelGroup: "phase-2-design",
      modelTier: "LUNA",
      maxIterations: 2,
      budgetTokens: 2000,
      outputs: [],
      checkpointData: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  return tasks;
}

export { FIXED_AGENTS };
