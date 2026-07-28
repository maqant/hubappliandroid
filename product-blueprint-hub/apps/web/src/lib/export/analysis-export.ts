import JSZip from "jszip";
import * as htmlToImage from "html-to-image";
import type { EntityId } from "@pbh/domain";
import { analysisLogCollector } from "./analysis-log-collector";
import { sanitizeAnalysisExport } from "./analysis-export-sanitizer";
import {
  buildReadmeMd,
  buildConceptionCompleteJson,
  buildConceptionLisibleMd,
  buildExperiencePathsJson,
  buildDiagnosticTechniqueJson,
  buildConsoleLogsJson,
  buildConsoleLisibleTxt,
  buildPromptsActifsTxt,
  normalizeProjectName,
  formatExportTimestamp,
  type ExportBuildContext,
} from "./analysis-export-builders";

export interface AnalysisExportOptions {
  includeMapImage?: boolean;
  includeConsoleLogs?: boolean;
  includeDebugLogs?: boolean;
  includeFullPrompts?: boolean;
  projection?: string;
  onProgress?: (step: string) => void;
}

export interface AnalysisExportResult {
  success: boolean;
  fileName: string | null;
  includedFiles: string[];
  warnings: string[];
  errors: string[];
}

const APP_VERSION = "0.16.1";

export async function exportProjectForAnalysis(
  svc: any,
  projectId: EntityId,
  options: AnalysisExportOptions = {},
  getMapElement?: () => HTMLElement | null
): Promise<AnalysisExportResult> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const includedFiles: string[] = [];

  options.onProgress?.("Chargement des données du projet...");

  let project: any = null;
  let proposals: any[] = [];
  let briefItems: any[] = [];
  let decisions: any[] = [];
  let rejectedItems: any[] = [];
  let deferredItems: any[] = [];
  let paths: any[] = [];

  try {
    project = await svc.repos.projects.getById(projectId);
    proposals = await svc.repos.designProposals.getByProjectId(projectId);
    paths = await svc.designWorkshop.getFeaturePaths(projectId);
    briefItems = await svc.repos.briefItems.getByProjectId(projectId);
    decisions = await svc.repos.decisions.getByProjectId(projectId);

    const all = proposals;
    rejectedItems = all.filter((p: any) => p.status === "REJECTED");
    deferredItems = all.filter((p: any) => p.status === "DEFERRED");
  } catch (e: any) {
    errors.push(`Erreur lors du chargement des données : ${e.message || String(e)}`);
    return {
      success: false,
      fileName: null,
      includedFiles: [],
      warnings,
      errors,
    };
  }

  // 1. Map Image Capture
  let hasMapImage = false;
  let mapImageBlob: Blob | null = null;
  let mapImageError: string | undefined = undefined;

  if (options.includeMapImage !== false && getMapElement) {
    options.onProgress?.("Génération de la cartographie...");
    try {
      const el = getMapElement();
      if (el) {
        const dataUrl = await htmlToImage.toPng(el, {
          quality: 0.95,
          pixelRatio: 1.5,
          filter: (node) => {
            if (node instanceof HTMLElement) {
              if (
                node.classList.contains("react-flow__controls") ||
                node.classList.contains("react-flow__minimap") ||
                node.getAttribute("role") === "dialog" ||
                node.classList.contains("no-export")
              ) {
                return false;
              }
            }
            return true;
          },
        });
        const res = await fetch(dataUrl);
        mapImageBlob = await res.blob();
        hasMapImage = true;
      } else {
        mapImageError = "Élément HTML de cartographie introuvable.";
        warnings.push(mapImageError);
      }
    } catch (err: any) {
      mapImageError = `Échec capture PNG : ${err.message || String(err)}`;
      warnings.push(mapImageError);
      analysisLogCollector.addEntry({
        timestamp: new Date().toISOString(),
        level: "WARN",
        category: "CARTOGRAPHY",
        message: mapImageError,
      });
    }
  }

  // 2. Collect Logs
  options.onProgress?.("Collecte des logs et diagnostics...");
  const logs = analysisLogCollector.getEntries(options.includeDebugLogs ?? false);
  const logSession = analysisLogCollector.getSessionInfo();
  const logStats = analysisLogCollector.getStatistics();

  // 3. Active Prompts (Optional)
  let activePrompts: any[] = [];
  if (options.includeFullPrompts) {
    try {
      const promptTemplates = await svc.repos.prompts.getAll();
      activePrompts = promptTemplates;
    } catch (e: any) {
      warnings.push(`Impossible de charger les prompts : ${e.message}`);
    }
  }

  // 4. Build Documents
  options.onProgress?.("Construction des documents...");
  const ctx: ExportBuildContext = {
    project,
    proposals,
    paths,
    briefItems,
    decisions,
    rejectedItems,
    deferredItems,
    logs,
    logSession,
    logStats,
    appVersion: APP_VERSION,
    hasMapImage,
    mapImageError,
    includePrompts: options.includeFullPrompts ?? false,
    activePrompts,
  };

  const readmeMd = buildReadmeMd(ctx);
  const rawConceptionJson = buildConceptionCompleteJson(ctx);
  const conceptionLisibleMd = buildConceptionLisibleMd(ctx);
  const rawPathsJson = buildExperiencePathsJson(ctx);
  const rawDiagnosticJson = buildDiagnosticTechniqueJson(ctx);
  const rawLogsJson = buildConsoleLogsJson(ctx);
  const logsLisibleTxt = buildConsoleLisibleTxt(ctx);

  // 5. Sanitize Secrets
  options.onProgress?.("Sécurisation des données...");
  const conceptionJson = sanitizeAnalysisExport(rawConceptionJson);
  const pathsJson = sanitizeAnalysisExport(rawPathsJson);
  const diagnosticJson = sanitizeAnalysisExport(rawDiagnosticJson);
  const logsJson = sanitizeAnalysisExport(rawLogsJson);

  // 6. Generate ZIP
  options.onProgress?.("Génération du fichier ZIP...");
  const zip = new JSZip();

  zip.file("README.md", readmeMd);
  includedFiles.push("README.md");

  zip.file("conception-complete.json", JSON.stringify(conceptionJson, null, 2));
  includedFiles.push("conception-complete.json");

  zip.file("conception-lisible.md", conceptionLisibleMd);
  includedFiles.push("conception-lisible.md");

  zip.file("experience-paths.json", JSON.stringify(pathsJson, null, 2));
  includedFiles.push("experience-paths.json");

  if (hasMapImage && mapImageBlob) {
    zip.file("cartographie-complete.png", mapImageBlob);
    includedFiles.push("cartographie-complete.png");
  }

  zip.file("diagnostic-technique.json", JSON.stringify(diagnosticJson, null, 2));
  includedFiles.push("diagnostic-technique.json");

  zip.file("console-logs.json", JSON.stringify(logsJson, null, 2));
  includedFiles.push("console-logs.json");

  zip.file("console-lisible.txt", logsLisibleTxt);
  includedFiles.push("console-lisible.txt");

  if (options.includeFullPrompts) {
    const promptsTxt = buildPromptsActifsTxt(ctx);
    zip.file("prompts-actifs.txt", promptsTxt);
    includedFiles.push("prompts-actifs.txt");
  }

  const normTitle = normalizeProjectName(project?.title);
  const dateStr = formatExportTimestamp();
  const zipFileName = `PBH-analyse-${normTitle}-${dateStr}.zip`;

  try {
    const contentBlob = await zip.generateAsync({ type: "blob" });
    downloadBlob(contentBlob, zipFileName);
  } catch (e: any) {
    errors.push(`Erreur lors de la génération ZIP : ${e.message || String(e)}`);
    return {
      success: false,
      fileName: null,
      includedFiles: [],
      warnings,
      errors,
    };
  }

  analysisLogCollector.addEntry({
    timestamp: new Date().toISOString(),
    level: "INFO",
    category: "EXPORT",
    message: `Export ZIP généré avec succès : ${zipFileName}`,
  });

  return {
    success: true,
    fileName: zipFileName,
    includedFiles,
    warnings,
    errors,
  };
}

export async function exportMapImageOnly(
  projectTitle: string | undefined,
  getMapElement: () => HTMLElement | null
): Promise<{ success: boolean; fileName?: string; error?: string }> {
  if (!getMapElement) return { success: false, error: "Élément introuvable." };
  const el = getMapElement();
  if (!el) return { success: false, error: "Canvas cartographie introuvable dans le DOM." };

  try {
    const dataUrl = await htmlToImage.toPng(el, {
      quality: 0.95,
      pixelRatio: 1.5,
      filter: (node) => {
        if (node instanceof HTMLElement) {
          if (
            node.classList.contains("react-flow__controls") ||
            node.classList.contains("react-flow__minimap") ||
            node.getAttribute("role") === "dialog" ||
            node.classList.contains("no-export")
          ) {
            return false;
          }
        }
        return true;
      },
    });

    const normTitle = normalizeProjectName(projectTitle);
    const dateStr = formatExportTimestamp();
    const fileName = `PBH-cartographie-${normTitle}-${dateStr}.png`;

    const res = await fetch(dataUrl);
    const blob = await res.blob();
    downloadBlob(blob, fileName);

    return { success: true, fileName };
  } catch (e: any) {
    return { success: false, error: e.message || String(e) };
  }
}

export async function exportLogsOnly(
  _svc: any,
  projectId: EntityId,
  projectTitle?: string
): Promise<{ success: boolean; fileName?: string; error?: string }> {
  try {
    const logs = analysisLogCollector.getEntries(true);
    const logSession = analysisLogCollector.getSessionInfo();
    const logStats = analysisLogCollector.getStatistics();

    const ctx: ExportBuildContext = {
      project: { id: projectId, title: projectTitle },
      proposals: [],
      paths: [],
      briefItems: [],
      decisions: [],
      rejectedItems: [],
      deferredItems: [],
      logs,
      logSession,
      logStats,
      appVersion: APP_VERSION,
      hasMapImage: false,
      includePrompts: false,
    };

    const rawDiagnosticJson = buildDiagnosticTechniqueJson(ctx);
    const rawLogsJson = buildConsoleLogsJson(ctx);
    const logsLisibleTxt = buildConsoleLisibleTxt(ctx);

    const diagnosticJson = sanitizeAnalysisExport(rawDiagnosticJson);
    const logsJson = sanitizeAnalysisExport(rawLogsJson);

    const zip = new JSZip();
    zip.file("console-logs.json", JSON.stringify(logsJson, null, 2));
    zip.file("console-lisible.txt", logsLisibleTxt);
    zip.file("diagnostic-technique.json", JSON.stringify(diagnosticJson, null, 2));

    const normTitle = normalizeProjectName(projectTitle);
    const dateStr = formatExportTimestamp();
    const fileName = `PBH-logs-${normTitle}-${dateStr}.zip`;

    const contentBlob = await zip.generateAsync({ type: "blob" });
    downloadBlob(contentBlob, fileName);

    return { success: true, fileName };
  } catch (e: any) {
    return { success: false, error: e.message || String(e) };
  }
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
