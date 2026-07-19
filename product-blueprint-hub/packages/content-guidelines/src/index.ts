/** UX vocabulary — no technical jargon */
export const LABELS = {
  // Navigation
  NAV_PROJECTS: "My Projects",
  NAV_NEW_PROJECT: "New Project",
  NAV_SETTINGS: "Settings",

  // Project states
  STATUS_DRAFT: "Draft",
  STATUS_ACTIVE: "Active",
  STATUS_ARCHIVED: "Archived",
  STATUS_DELETED: "Deleted",

  // Brief
  BRIEF_ANALYZE: "Analyze my idea",
  BRIEF_ACCEPT: "Accept",
  BRIEF_CORRECT: "Correct",
  BRIEF_REJECT: "Reject",
  BRIEF_LOCK: "Lock",

  // Mission
  MISSION_PLAN: "Plan the design",
  MISSION_RUN: "Start the mission",
  MISSION_COMPLETED: "Mission completed",

  // Decisions
  DECISION_LOCK: "Lock this decision",
  DECISION_CHANGE_REQUEST: "Request a change",

  // Audits
  AUDIT_RUN: "Run audits",
  AUDIT_PASSED: "Passed",
  AUDIT_BLOCKED: "Blocked",

  // Package
  BASELINE_FREEZE: "Freeze baseline",
  PACKAGE_GENERATE: "Generate package",
  PACKAGE_DOWNLOAD: "Download",

  // States
  STATE_LOADING: "Loading...",
  STATE_SAVING: "Saving...",
  STATE_SAVED: "Saved",
  STATE_ERROR: "An error occurred",
  STATE_EMPTY: "Nothing here yet",
  STATE_OFFLINE: "You are offline",

  // Demo
  DEMO_MODE: "Demo Mode",
  DEMO_LOGIN: "Enter demo mode",
  DEMO_BADGE: "AI Demo",
  AI_NOT_CONFIGURED: "AI connection not configured",
} as const;
