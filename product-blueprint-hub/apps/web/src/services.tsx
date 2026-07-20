"use client";

import type {
  Project,
  Source,
  BriefItem,
  Decision,
  ChangeRequest,
  Conflict,
  MissionManifest,
  Finding,
  ValidationGate,
  Artifact,
  Baseline,
  ExecutionPackage,
  RunEvent,
  EntityId,
  Run,
  ModelUsage,
  AuditEvent,
  User,
  DesignProposal,
  DesignGraph,
  DesignBaseline,
  DesignLayer,
} from "@pbh/domain";
import {
  ProjectUseCases,
  SourceUseCases,
  BriefUseCases,
  DecisionUseCases,
  MissionUseCases,
  ConflictUseCases,
  AuditUseCases,
  BaselineUseCases,
  PackageUseCases,
  DesignWorkshopUseCases,
} from "@pbh/application";
import { createLocalRepositoryRegistry, seedPrompts } from "@pbh/repositories";
import { FakeModelProvider, ModelGateway, RemoteOpenAIProvider } from "@pbh/model-gateway";
import { createContext, useContext, useMemo } from "react";

// ============================================
// Initialize services (singleton)
// ============================================

function createServices() {
  const repos = createLocalRepositoryRegistry();
  
  // Seed initial prompts asynchronously
  seedPrompts(repos).catch(console.error);


  const gateway = new ModelGateway();
  const fakeProvider = new FakeModelProvider();
  gateway.registerProvider("fake", fakeProvider);
  
  if (process.env.NEXT_PUBLIC_MODEL_PROVIDER === "openai") {
    const openaiProvider = new RemoteOpenAIProvider();
    gateway.registerProvider("openai", openaiProvider);
    gateway.setActiveProvider("openai");
  } else {
    gateway.setActiveProvider("fake");
  }

  const provider = gateway.getActiveProvider();

  return {
    repos,
    gateway,
    provider,
    projects: new ProjectUseCases(repos),
    sources: new SourceUseCases(repos),
    brief: new BriefUseCases(repos, provider),
    decisions: new DecisionUseCases(repos),
    missions: new MissionUseCases(repos, provider),
    conflicts: new ConflictUseCases(repos),
    audits: new AuditUseCases(repos, provider),
    baselines: new BaselineUseCases(repos),
    packages: new PackageUseCases(repos),
    designWorkshop: new DesignWorkshopUseCases(repos, provider),
  };
}

type Services = ReturnType<typeof createServices>;

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({ children }: { children: React.ReactNode }) {
  const services = useMemo(() => createServices(), []);
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const ctx = useContext(ServicesContext);
  if (!ctx) throw new Error("useServices must be used within ServicesProvider");
  return ctx;
}

// Re-export types for convenience
export type {
  Project,
  Source,
  BriefItem,
  Decision,
  ChangeRequest,
  Conflict,
  MissionManifest,
  Finding,
  ValidationGate,
  Artifact,
  Baseline,
  ExecutionPackage,
  RunEvent,
  EntityId,
  Run,
  ModelUsage,
  AuditEvent,
  User,
  DesignProposal,
  DesignGraph,
  DesignBaseline,
  DesignLayer,
};
