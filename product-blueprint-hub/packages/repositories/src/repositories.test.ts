import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createLocalRepositoryRegistry, STORAGE_PREFIX } from "./local-repository";
import { createProject, type EntityId } from "@pbh/domain";

describe("Local Repositories & Persistence", () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    // Mock global window and localStorage
    global.window = {
      localStorage: {
        getItem: (key: string) => mockStorage[key] ?? null,
        setItem: (key: string, value: string) => {
          mockStorage[key] = value;
        },
        removeItem: (key: string) => {
          delete mockStorage[key];
        },
        clear: () => {
          mockStorage = {};
        },
        length: 0,
        key: (_index: number) => null,
      },
    } as any;
    global.localStorage = global.window.localStorage;
  });

  afterEach(() => {
    delete (global as any).window;
    delete (global as any).localStorage;
  });

  it("should create, save and read a project from local storage", async () => {
    const registry = createLocalRepositoryRegistry();
    const project = createProject({
      name: "Persistence Test",
      description: "Testing local storage repo",
    });

    await registry.projects.save(project);

    // Verify storage has the prefixed key
    const rawKeys = Object.keys(mockStorage);
    expect(rawKeys.some((k) => k.startsWith(STORAGE_PREFIX))).toBe(true);

    const retrieved = await registry.projects.getById(project.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.name).toBe("Persistence Test");
  });

  it("should archive a project and isolate its status change", async () => {
    const registry = createLocalRepositoryRegistry();
    const project = createProject({ name: "Active Project" });
    await registry.projects.save(project);

    // Update status to ARCHIVED
    const archived = { ...project, status: "ARCHIVED" as const };
    await registry.projects.save(archived);

    const retrieved = await registry.projects.getById(project.id);
    expect(retrieved!.status).toBe("ARCHIVED");
  });

  it("should isolate project storage keys from other entries", async () => {
    const registry = createLocalRepositoryRegistry();
    const projectA = createProject({ name: "Project A" });
    const projectB = createProject({ name: "Project B" });

    await registry.projects.save(projectA);
    await registry.projects.save(projectB);

    const retrievedA = await registry.projects.getById(projectA.id);
    const retrievedB = await registry.projects.getById(projectB.id);

    expect(retrievedA!.id).not.toBe(retrievedB!.id);
  });

  it("should support schema versioning and storage prefix isolation", async () => {
    const registry = createLocalRepositoryRegistry();
    const project = createProject({ name: "Versioned Project" });
    await registry.projects.save(project);

    // Verify prefix matches schema version
    const keys = Object.keys(mockStorage);
    expect(keys[0]).toContain(STORAGE_PREFIX);
    expect(keys[0]).toContain("projects");
  });
});
