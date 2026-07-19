import { describe, it, expect } from "vitest";
import { CreateProjectSchema, AddSourceSchema, UpdateBriefItemSchema } from "./schemas";

describe("Contracts & Zod Schemas Validation", () => {
  describe("CreateProjectSchema", () => {
    it("should pass for valid project input", () => {
      const valid = {
        name: "Test Project",
        description: "A valid description",
        ideaText: "An idea text",
      };
      const res = CreateProjectSchema.safeParse(valid);
      expect(res.success).toBe(true);
    });

    it("should fail when mandatory name is absent or empty", () => {
      const invalid = {
        description: "A description",
        ideaText: "An idea text",
      };
      const res1 = CreateProjectSchema.safeParse(invalid);
      expect(res1.success).toBe(false);

      const res2 = CreateProjectSchema.safeParse({ name: "" });
      expect(res2.success).toBe(false);
    });
  });

  describe("AddSourceSchema", () => {
    it("should fail for unknown source type", () => {
      const invalid = {
        type: "UNKNOWN_TYPE",
        label: "My label",
        content: "Some content",
      };
      const res = AddSourceSchema.safeParse(invalid);
      expect(res.success).toBe(false);
    });
  });

  describe("UpdateBriefItemSchema", () => {
    it("should fail for invalid action", () => {
      const invalid = {
        action: "INVALID_ACTION",
      };
      const res = UpdateBriefItemSchema.safeParse(invalid);
      expect(res.success).toBe(false);
    });
  });
});
