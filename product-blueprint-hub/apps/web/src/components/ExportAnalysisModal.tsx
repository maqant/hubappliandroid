"use client";

import { useState } from "react";
import { useServices, type EntityId } from "@/services";
import {
  exportProjectForAnalysis,
  exportLogsOnly,
  type AnalysisExportOptions,
} from "@/lib/export/analysis-export";
import { analysisLogCollector } from "@/lib/export/analysis-log-collector";

interface ExportAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: EntityId;
  projectTitle?: string;
  getMapElement?: () => HTMLElement | null;
  showToast?: (msg: string) => void;
}

export function ExportAnalysisModal({
  isOpen,
  onClose,
  projectId,
  projectTitle,
  getMapElement,
  showToast,
}: ExportAnalysisModalProps) {
  const svc = useServices();

  const [includeMapImage, setIncludeMapImage] = useState(true);
  const [includeConsoleLogs, setIncludeConsoleLogs] = useState(true);
  const [includeDebugLogs, setIncludeDebugLogs] = useState(false);
  const [includeFullPrompts, setIncludeFullPrompts] = useState(false);

  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<string | null>(null);

  if (!isOpen) return null;

  const notify = (msg: string) => {
    if (showToast) showToast(msg);
    else alert(msg);
  };

  const handleExportZip = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportProgress("Préparation de l'export...");

    try {
      const options: AnalysisExportOptions = {
        includeMapImage,
        includeConsoleLogs,
        includeDebugLogs,
        includeFullPrompts,
        onProgress: (step) => setExportProgress(step),
      };

      const res = await exportProjectForAnalysis(
        svc,
        projectId,
        options,
        getMapElement
      );

      if (res.success) {
        if (!res.includedFiles.includes("cartographie-complete.png") && includeMapImage) {
          notify("Export téléchargé, mais la cartographie n’a pas pu être capturée.");
        } else if (analysisLogCollector.getEntries().length === 0) {
          notify("Export téléchargé. Aucun log n’était disponible pour cette session.");
        } else {
          notify("Export téléchargé.");
        }
        onClose();
      } else {
        notify("L’export n’a pas pu être généré.");
      }
    } catch (e: any) {
      notify("L’export n’a pas pu être généré.");
    } finally {
      setIsExporting(false);
      setExportProgress(null);
    }
  };

  const handleExportLogsOnly = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportProgress("Export des logs...");
    try {
      const res = await exportLogsOnly(svc, projectId, projectTitle);
      if (res.success) {
        notify("Logs téléchargés.");
        onClose();
      } else {
        notify("Impossible de télécharger les logs.");
      }
    } catch {
      notify("Impossible de télécharger les logs.");
    } finally {
      setIsExporting(false);
      setExportProgress(null);
    }
  };

  const handleClearLogs = () => {
    const confirmClear = confirm(
      "Voulez-vous vraiment vider les logs enregistrés pour cette session ?"
    );
    if (confirmClear) {
      analysisLogCollector.clear();
      notify("Logs vidés.");
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 no-export">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 space-y-5">
        <div className="flex justify-between items-start border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white m-0">
              📦 Exporter pour analyse
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 m-0">
              Télécharge la conception, les paths, la cartographie et les diagnostics dans un fichier ZIP.
            </p>
          </div>
          <button
            className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-lg font-bold"
            onClick={onClose}
            disabled={isExporting}
          >
            ✕
          </button>
        </div>

        {/* Options */}
        <div className="space-y-3 text-sm">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
              checked={includeMapImage}
              onChange={(e) => setIncludeMapImage(e.target.checked)}
              disabled={isExporting}
            />
            <span className="font-medium text-slate-800 dark:text-slate-200">
              Inclure la cartographie PNG (représentation graphique)
            </span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
              checked={includeConsoleLogs}
              onChange={(e) => setIncludeConsoleLogs(e.target.checked)}
              disabled={isExporting}
            />
            <span className="font-medium text-slate-800 dark:text-slate-200">
              Inclure les logs de console (INFO, WARN, ERROR)
            </span>
          </label>

          {includeConsoleLogs && (
            <div className="pl-7 space-y-2">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                  checked={includeDebugLogs}
                  onChange={(e) => setIncludeDebugLogs(e.target.checked)}
                  disabled={isExporting}
                />
                <span className="text-xs text-slate-600 dark:text-slate-300">
                  Inclure également les logs de niveau DEBUG
                </span>
              </label>

              <p className="text-xs text-slate-500 dark:text-slate-400 italic m-0">
                Inclut les erreurs et diagnostics de génération, sans clés API ni secrets.
              </p>
            </div>
          )}

          <label className="flex items-center gap-3 cursor-pointer select-none pt-1">
            <input
              type="checkbox"
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
              checked={includeFullPrompts}
              onChange={(e) => setIncludeFullPrompts(e.target.checked)}
              disabled={isExporting}
            />
            <span className="font-medium text-slate-800 dark:text-slate-200">
              Inclure le texte intégral des prompts
            </span>
          </label>
        </div>

        {/* Tip Instruction Box */}
        <div className="bg-blue-50 dark:bg-blue-950/40 p-3 rounded-lg border border-blue-200 dark:border-blue-800/60 text-xs text-blue-800 dark:text-blue-200 space-y-1">
          <div className="font-bold">💡 Instruction de diagnostic :</div>
          <p className="m-0 leading-relaxed">
            Pour diagnostiquer un problème : videz les logs, reproduisez le problème, puis exportez immédiatement l’analyse.
          </p>
        </div>

        {/* Progress State */}
        {exportProgress && (
          <div className="bg-slate-100 dark:bg-slate-800 p-2.5 rounded text-xs text-blue-600 dark:text-blue-400 font-medium flex items-center gap-2">
            <span className="animate-spin">⏳</span> {exportProgress}
          </div>
        )}

        {/* Footer Action Buttons */}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-3">
          <div className="flex justify-between items-center text-xs">
            <button
              type="button"
              className="text-slate-500 hover:text-red-600 dark:hover:text-red-400 underline font-medium"
              onClick={handleClearLogs}
              disabled={isExporting}
            >
              🗑️ Vider les logs
            </button>
            <button
              type="button"
              className="text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 underline font-medium"
              onClick={handleExportLogsOnly}
              disabled={isExporting}
            >
              📄 Télécharger uniquement les logs
            </button>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition"
              onClick={onClose}
              disabled={isExporting}
            >
              Annuler
            </button>
            <button
              type="button"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-md transition disabled:opacity-50"
              onClick={handleExportZip}
              disabled={isExporting}
            >
              {isExporting ? "⏳ Préparation…" : "📦 Exporter (ZIP)"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
