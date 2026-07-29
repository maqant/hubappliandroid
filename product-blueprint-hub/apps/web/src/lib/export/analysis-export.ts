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
  buildExportManifestJson,
  buildConsoleLogsJson,
  buildConsoleLisibleTxt,
  buildPromptsActifsTxt,
  normalizeProjectName,
  formatExportTimestamp,
  type ExportBuildContext,
  type ExportFileRegistryEntry,
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
  overallStatus: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  fileName: string | null;
  includedFiles: string[];
  warnings: string[];
  errors: string[];
  fileRegistry?: ExportFileRegistryEntry[];
}

const APP_VERSION = "0.24.0";

export async function exportProjectForAnalysis(
  svc: any,
  projectId: EntityId,
  options: AnalysisExportOptions = {},
  getMapElement?: () => HTMLElement | null
): Promise<AnalysisExportResult> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const includedFiles: string[] = [];
  const fileRegistry: ExportFileRegistryEntry[] = [];

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
    const errorMsg = `Erreur lors du chargement des données : ${e.message || String(e)}`;
    errors.push(errorMsg);
    return {
      success: false,
      overallStatus: 'FAILED',
      fileName: null,
      includedFiles: [],
      warnings,
      errors: [errorMsg],
    };
  }

  // 1. Map Image Capture with Explicit Diagnostics
  let hasMapImage = false;
  let mapImageBlob: Blob | null = null;
  let mapImageError: string | undefined = undefined;
  let cartographyCaptureStatus: { status: 'SUCCESS' | 'FAILED' | 'SKIPPED'; reason?: string; details?: string } = {
    status: 'SKIPPED',
    reason: 'CAPTURE_NOT_REQUESTED',
  };

  if (options.includeMapImage !== false) {
    if (getMapElement) {
      options.onProgress?.("Génération de la cartographie...");
      try {
        const el = getMapElement();
        if (!el) {
          mapImageError = "CONTAINER_NOT_FOUND: Le conteneur HTML de la cartographie (ReactFlow) est introuvable.";
          cartographyCaptureStatus = { status: 'FAILED', reason: 'CONTAINER_NOT_FOUND', details: mapImageError };
          warnings.push(mapImageError);
        } else if (el.offsetWidth === 0 || el.offsetHeight === 0) {
          mapImageError = "ZERO_DIMENSIONS: Le conteneur de cartographie a une largeur ou hauteur nulle.";
          cartographyCaptureStatus = { status: 'FAILED', reason: 'ZERO_DIMENSIONS', details: mapImageError };
          warnings.push(mapImageError);
        } else {
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
          cartographyCaptureStatus = { status: 'SUCCESS' };
        }
      } catch (err: any) {
        mapImageError = `CAPTURE_EXCEPTION: ${err.message || String(err)}`;
        cartographyCaptureStatus = { status: 'FAILED', reason: 'CAPTURE_EXCEPTION', details: mapImageError };
        warnings.push(mapImageError);
        analysisLogCollector.addEntry({
          timestamp: new Date().toISOString(),
          level: "WARN",
          category: "CARTOGRAPHY",
          message: mapImageError,
        });
      }
    } else {
      mapImageError = "NO_DOM_GETTER: Aucun sélecteur DOM n'a été fourni pour capturer la cartographie.";
      cartographyCaptureStatus = { status: 'FAILED', reason: 'NO_DOM_GETTER', details: mapImageError };
      warnings.push(mapImageError);
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

  // 5. Sanitize Secrets (Without Circular string)
  options.onProgress?.("Sécurisation des données...");
  const conceptionJson = sanitizeAnalysisExport(rawConceptionJson);
  const pathsJson = sanitizeAnalysisExport(rawPathsJson);
  const diagnosticJson = sanitizeAnalysisExport(rawDiagnosticJson);
  const logsJson = sanitizeAnalysisExport(rawLogsJson);

  // 6. Generate ZIP
  options.onProgress?.("Génération du fichier ZIP...");
  const zip = new JSZip();

  const addZipFile = (name: string, content: any, role: string, itemCount?: number) => {
    try {
      const strContent = typeof content === "string" ? content : JSON.stringify(content, null, 2);
      zip.file(name, strContent);
      includedFiles.push(name);
      fileRegistry.push({
        fileName: name,
        role,
        status: 'SUCCESS',
        sizeBytes: new Blob([strContent]).size,
        itemCount,
      });
    } catch (e: any) {
      fileRegistry.push({
        fileName: name,
        role,
        status: 'FAILED',
        error: e.message || String(e),
      });
      errors.push(`Échec écriture ${name} : ${e.message}`);
    }
  };

  addZipFile("README.md", readmeMd, "Documentation d'accueil et instructions", undefined);
  addZipFile("conception-complete.json", conceptionJson, "Données canoniques uniques et relations par ID (v2.0)", proposals.length);
  addZipFile("conception-lisible.md", conceptionLisibleMd, "Lecture humaine structurée par couche", proposals.length);
  addZipFile("experience-paths.json", pathsJson, "Parcours d'expérience avec nœuds référentiels (v2.0)", paths.length);
  addZipFile("diagnostic-technique.json", diagnosticJson, "Diagnostic technique et configuration de génération", undefined);
  addZipFile("console-logs.json", logsJson, "Événements de session structurés sans secrets", logs.length);
  addZipFile("console-lisible.txt", logsLisibleTxt, "Version textuelle lisible des logs", logs.length);

  if (hasMapImage && mapImageBlob) {
    zip.file("cartographie-complete.png", mapImageBlob);
    includedFiles.push("cartographie-complete.png");
    fileRegistry.push({
      fileName: "cartographie-complete.png",
      role: "Capture graphique de la cartographie",
      status: 'SUCCESS',
      sizeBytes: mapImageBlob.size,
    });
  } else if (options.includeMapImage !== false) {
    fileRegistry.push({
      fileName: "cartographie-complete.png",
      role: "Capture graphique de la cartographie",
      status: 'FAILED',
      error: mapImageError || 'PNG_CAPTURE_FAILED',
    });
  }

  if (options.includeFullPrompts) {
    const promptsTxt = buildPromptsActifsTxt(ctx);
    addZipFile("prompts-actifs.txt", promptsTxt, "Texte intégral des prompts d'agents", activePrompts.length);
  }

  // 7. Overall Status Calculation
  let overallStatus: 'SUCCESS' | 'PARTIAL' | 'FAILED' = 'SUCCESS';
  if (cartographyCaptureStatus.status === 'FAILED' || warnings.length > 0) {
    overallStatus = 'PARTIAL';
  }
  if (fileRegistry.some(f => f.role === 'Données canoniques' && f.status === 'FAILED')) {
    overallStatus = 'FAILED';
  }

  // 8. Build export-manifest.json AS THE LAST FILE
  const manifestJson = buildExportManifestJson(ctx, fileRegistry, overallStatus, cartographyCaptureStatus);
  const sanitizedManifest = sanitizeAnalysisExport(manifestJson);
  const manifestStr = JSON.stringify(sanitizedManifest, null, 2);
  zip.file("export-manifest.json", manifestStr);
  includedFiles.push("export-manifest.json");

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
      overallStatus: 'FAILED',
      fileName: null,
      includedFiles: [],
      warnings,
      errors,
      fileRegistry,
    };
  }

  return {
    success: true,
    overallStatus,
    fileName: zipFileName,
    includedFiles,
    warnings,
    errors,
    fileRegistry,
  };
}

function downloadBlob(blob: Blob, fileName: string) {
  if (typeof window === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportLogsOnly(
  _arg1?: any,
  _arg2?: any,
  _arg3?: any,
  options: { includeDebugLogs?: boolean } = {}
): Promise<{ success: boolean; fileName: string | null }> {
  const logs = analysisLogCollector.getEntries(options.includeDebugLogs ?? false);
  const sessionInfo = analysisLogCollector.getSessionInfo();

  const exportData = {
    exportedAt: new Date().toISOString(),
    sessionInfo,
    logs,
  };

  const sanitized = sanitizeAnalysisExport(exportData);
  const str = JSON.stringify(sanitized, null, 2);
  const blob = new Blob([str], { type: "application/json" });
  const fileName = `PBH-logs-${formatExportTimestamp()}.json`;
  downloadBlob(blob, fileName);
  return { success: true, fileName };
}

export async function exportMapImageOnly(
  arg1?: any,
  arg2?: any
): Promise<{ success: boolean; fileName?: string; error?: string }> {
  try {
    let getMapElement: (() => HTMLElement | null) | undefined;
    let projectTitle: string | undefined;

    if (typeof arg1 === "function") {
      getMapElement = arg1;
      projectTitle = typeof arg2 === "string" ? arg2 : undefined;
    } else if (typeof arg2 === "function") {
      getMapElement = arg2;
      projectTitle = typeof arg1 === "string" ? arg1 : undefined;
    }

    const el = getMapElement ? getMapElement() : null;
    if (!el) return { success: false, error: "CONTAINER_NOT_FOUND" };

    const dataUrl = await htmlToImage.toPng(el, { quality: 0.95, pixelRatio: 1.5 });
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const fileName = `cartographie-${normalizeProjectName(projectTitle)}-${formatExportTimestamp()}.png`;
    downloadBlob(blob, fileName);
    return { success: true, fileName };
  } catch (e: any) {
    return { success: false, error: e.message || String(e) };
  }
}


