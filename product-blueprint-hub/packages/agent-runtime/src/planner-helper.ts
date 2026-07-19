import { getFixedAgents, planMission } from "./planner";
import type { MissionManifest, EntityId } from "@pbh/domain";

export { getFixedAgents };

export function planBriefMission(projectId: EntityId, name: string, briefItems: any[]) {
  return planMission({ projectId, name, briefItems });
}

export function validateMissionManifest(manifest: MissionManifest): void {
  const mandatoryIds = [
    "FIX-DIRECTOR",
    "FIX-PRODUCT",
    "FIX-SCOPE",
    "FIX-NOVICE",
    "FIX-UX",
    "FIX-DESIGN",
    "FIX-CROSSAPP",
    "FIX-ARCH",
    "FIX-AI",
    "FIX-SECURITY",
    "FIX-PRIVACY",
    "FIX-COMPLIANCE",
    "FIX-A11Y",
    "FIX-QA",
    "FIX-VERCEL",
    "FIX-COST",
    "FIX-TECH-AUDIT",
    "FIX-PACKAGE-AUDIT",
  ];

  const agentIds = new Set(manifest.agents.map((a) => a.agentId));
  for (const id of mandatoryIds) {
    if (!agentIds.has(id)) {
      throw new Error(`Missing mandatory fixed agent: ${id}`);
    }
  }
}
