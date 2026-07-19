import { z } from "zod";

// ============================================
// Common schemas
// ============================================

export const EntityIdSchema = z.string().uuid();
export const TimestampSchema = z.string().datetime();

// ============================================
// Project schemas
// ============================================

export const CreateProjectSchema = z.object({
  name: z.string().min(1, "Project name is required").max(200),
  description: z.string().max(2000).default(""),
  ideaText: z.string().max(50000).default(""),
});
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

export const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  ideaText: z.string().max(50000).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
});
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;

// ============================================
// Source schemas
// ============================================

export const AddSourceSchema = z.object({
  type: z.enum(["TEXT", "FILE_TXT", "FILE_MD", "CONVERSATION"]),
  label: z.string().min(1, "Source label is required").max(200),
  content: z.string().min(1, "Source content is required").max(100000),
});
export type AddSourceInput = z.infer<typeof AddSourceSchema>;

// ============================================
// BriefItem schemas
// ============================================

export const BriefItemTypeSchema = z.enum([
  "VISION",
  "OBJECTIVE",
  "USER_NEED",
  "DECISION",
  "SUGGESTION",
  "ASSUMPTION",
  "CONSTRAINT",
  "RISK",
  "QUESTION",
  "EXAMPLE",
  "REJECTION",
  "CORRECTION",
  "SUPERSESSION",
  "OUT_OF_SCOPE",
]);

export const UpdateBriefItemSchema = z.object({
  action: z.enum(["ACCEPT", "CORRECT", "REJECT"]),
  newStatement: z.string().max(5000).optional(),
});
export type UpdateBriefItemInput = z.infer<typeof UpdateBriefItemSchema>;

// ============================================
// Decision schemas
// ============================================

export const CreateDecisionSchema = z.object({
  title: z.string().min(1).max(200),
  statement: z.string().min(1).max(5000),
  rationale: z.string().min(1).max(5000),
  relatedBriefItemIds: z.array(EntityIdSchema).default([]),
  relatedConflictId: EntityIdSchema.nullable().default(null),
});
export type CreateDecisionInput = z.infer<typeof CreateDecisionSchema>;

// ============================================
// ChangeRequest schemas
// ============================================

export const CreateChangeRequestSchema = z.object({
  targetType: z.enum(["BriefItem", "Decision"]),
  targetId: EntityIdSchema,
  reason: z.string().min(1).max(5000),
  proposedChange: z.string().min(1).max(5000),
});
export type CreateChangeRequestInput = z.infer<typeof CreateChangeRequestSchema>;

// ============================================
// Mission schemas
// ============================================

export const CreateMissionSchema = z.object({
  name: z.string().min(1).max(200).default("Default Mission"),
});
export type CreateMissionInput = z.infer<typeof CreateMissionSchema>;

// ============================================
// Conflict resolution schema
// ============================================

export const ResolveConflictSchema = z.object({
  chosenOptionId: EntityIdSchema,
  rationale: z.string().min(1).max(5000),
});
export type ResolveConflictInput = z.infer<typeof ResolveConflictSchema>;

// ============================================
// API Response schemas
// ============================================

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const ApiSuccessSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema,
    meta: z
      .object({
        timestamp: TimestampSchema,
        version: z.string(),
      })
      .optional(),
  });

// ============================================
// Health schema
// ============================================

export const HealthSchema = z.object({
  status: z.enum(["ok", "degraded", "down"]),
  provider: z.string(),
  version: z.string(),
  timestamp: TimestampSchema,
});
export type HealthResponse = z.infer<typeof HealthSchema>;
