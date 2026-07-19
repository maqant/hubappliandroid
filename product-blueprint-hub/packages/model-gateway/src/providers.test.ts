import { describe, it, expect, vi, beforeEach } from "vitest";
import { routeToTier } from "./gateway";
import { FakeModelProvider } from "./providers";

describe("Model Gateway & Routing", () => {
  describe("Routing tiers", () => {
    it("should route complexity to correct tier", () => {
      expect(routeToTier("LOW")).toBe("LUNA");
      expect(routeToTier("MEDIUM")).toBe("TERRA");
      expect(routeToTier("HIGH")).toBe("SOL");
      expect(routeToTier("CRITICAL")).toBe("SOL");
    });
  });

  describe("FakeModelProvider", () => {
    const provider = new FakeModelProvider();

    beforeEach(() => {
      FakeModelProvider.setDelayMode("instant");
      FakeModelProvider.setScenario("DEMO_PASSING");
    });

    it("should produce deterministic responses", async () => {
      const req1 = {
        prompt: "Analyze user registration workflow",
        systemPrompt: "Analyze the brief and extract brief items",
        tier: "TERRA" as const,
        correlationId: "test-1",
      };

      const res1 = await provider.complete(req1);
      expect(res1.provider).toBe("fake");
      expect(res1.tier).toBe("TERRA");
      expect(res1.content).toContain("items");

      // Check determinism
      const res2 = await provider.complete(req1);
      expect(res2.content).toBe(res1.content);
    });

    it("should vary based on input prompt", async () => {
      const req1 = {
        prompt: "First distinct idea description",
        systemPrompt: "Analyze the brief and extract brief items",
        tier: "TERRA" as const,
        correlationId: "test-var-1",
      };

      const req2 = {
        prompt: "Completely different second idea about something else",
        systemPrompt: "Analyze the brief and extract brief items",
        tier: "TERRA" as const,
        correlationId: "test-var-2",
      };

      const res1 = await provider.complete(req1);
      const res2 = await provider.complete(req2);
      expect(res1.content).not.toBe(res2.content);
    });

    it("should return valid structured JSON output", async () => {
      const req = {
        prompt: "Perform audit check",
        systemPrompt: "Run audit and return findings",
        tier: "SOL" as const,
        correlationId: "test-json",
      };

      const res = await provider.complete(req);
      const parsed = JSON.parse(res.content);
      expect(parsed).toHaveProperty("findings");
      expect(Array.isArray(parsed.findings)).toBe(true);
    });

    it("should never perform any network calls", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const req = {
        prompt: "Simple task",
        systemPrompt: "Simple agent prompt",
        tier: "LUNA" as const,
        correlationId: "test-no-network",
      };

      await provider.complete(req);
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it("should generate domain-specific outputs for wardrobe, tasks, and recipe applications without cross-pollution", async () => {
      // 1. Project A: Wardrobe
      const resA = await provider.complete({
        prompt:
          "Créer un projet de garde-robe connectée météo pour trier mes vêtements et suggérer des tenues.",
        systemPrompt: "Analyze the brief and extract brief items",
        tier: "TERRA",
      });
      const parsedA = JSON.parse(resA.content);
      expect(
        parsedA.items.some(
          (i: any) =>
            i.statement.toLowerCase().includes("vêtement") ||
            i.statement.toLowerCase().includes("garde-robe"),
        ),
      ).toBe(true);
      expect(
        parsedA.items.some(
          (i: any) =>
            i.statement.toLowerCase().includes("recette") ||
            i.statement.toLowerCase().includes("cooking"),
        ),
      ).toBe(false);

      // Blueprint A
      const bpA = await provider.complete({
        prompt: `Generate blueprint section: PRODUCT_VISION for mission "Mission Garde-Robe". Context:
Locked References:
- [VISION] Garde-robe intelligente météo`,
        systemPrompt: "Generate blueprint section PRODUCT_VISION",
        tier: "TERRA",
      });
      const parsedBpA = JSON.parse(bpA.content);
      expect(parsedBpA.title.toLowerCase()).toContain("garde-robe");
      expect(parsedBpA.title.toLowerCase()).not.toContain("recette");
      expect(parsedBpA.title.toLowerCase()).not.toContain("tâche");

      // 2. Project B: Task Manager
      const resB = await provider.complete({
        prompt:
          "Créer un gestionnaire de tâches d'équipe pour assigner des responsabilités et suivre l'avancement des todos.",
        systemPrompt: "Analyze the brief and extract brief items",
        tier: "TERRA",
      });
      const parsedB = JSON.parse(resB.content);
      expect(
        parsedB.items.some(
          (i: any) =>
            i.statement.toLowerCase().includes("tâche") ||
            i.statement.toLowerCase().includes("todo"),
        ),
      ).toBe(true);
      expect(
        parsedB.items.some(
          (i: any) =>
            i.statement.toLowerCase().includes("vêtement") ||
            i.statement.toLowerCase().includes("recette"),
        ),
      ).toBe(false);

      // Blueprint B
      const bpB = await provider.complete({
        prompt: `Generate blueprint section: PRODUCT_VISION for mission "Mission Tâches". Context:
Locked References:
- [USER_NEED] Assigner des tâches aux collaborateurs`,
        systemPrompt: "Generate blueprint section PRODUCT_VISION",
        tier: "TERRA",
      });
      const parsedBpB = JSON.parse(bpB.content);
      expect(parsedBpB.title.toLowerCase()).toContain("tâche");
      expect(parsedBpB.title.toLowerCase()).not.toContain("vêtement");
      expect(parsedBpB.title.toLowerCase()).not.toContain("recette");

      // 3. Project C: Recipe Book
      const resC = await provider.complete({
        prompt:
          "Créer un carnet de recettes de cuisine pour planifier mes repas de la semaine et lister les ingrédients.",
        systemPrompt: "Analyze the brief and extract brief items",
        tier: "TERRA",
      });
      const parsedC = JSON.parse(resC.content);
      expect(
        parsedC.items.some(
          (i: any) =>
            i.statement.toLowerCase().includes("recette") ||
            i.statement.toLowerCase().includes("repas") ||
            i.statement.toLowerCase().includes("ingrédient"),
        ),
      ).toBe(true);
      expect(
        parsedC.items.some(
          (i: any) =>
            i.statement.toLowerCase().includes("vêtement") ||
            i.statement.toLowerCase().includes("tâche"),
        ),
      ).toBe(false);

      // Blueprint C
      const bpC = await provider.complete({
        prompt: `Generate blueprint section: PRODUCT_VISION for mission "Mission Recettes". Context:
Locked References:
- [VISION] Carnet de recettes de cuisine`,
        systemPrompt: "Generate blueprint section PRODUCT_VISION",
        tier: "TERRA",
      });
      const parsedBpC = JSON.parse(bpC.content);
      expect(parsedBpC.title.toLowerCase()).toContain("recette");
      expect(parsedBpC.title.toLowerCase()).not.toContain("vêtement");
      expect(parsedBpC.title.toLowerCase()).not.toContain("tâche");
    });

    it("should return question items and error when prompt is too short or ambiguous (negative test case)", async () => {
      const res = await provider.complete({
        prompt: "aide",
        systemPrompt: "Analyze the brief and extract brief items",
        tier: "TERRA",
      });
      const parsed = JSON.parse(res.content);
      expect(parsed).toHaveProperty("error");
      expect(parsed.items).toHaveLength(2);
      expect(parsed.items[0].type).toBe("QUESTION");
      expect(parsed.items[1].type).toBe("QUESTION");
      // Verify no complete product is invented
      expect(parsed.items.some((i: any) => i.type === "VISION" || i.type === "USER_NEED")).toBe(
        false,
      );
    });
  });
});
