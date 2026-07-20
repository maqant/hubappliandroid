"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { TargetPlatform } from "@pbh/domain";
import { useServices } from "@/services";
import { useTranslation } from "@/i18n";

export default function NewProjectPage() {
  const { projects } = useServices();
  const router = useRouter();
  const { t } = useTranslation();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ideaText, setIdeaText] = useState("");
  const [targetPlatform, setTargetPlatform] = useState<TargetPlatform | "">("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const autosaveTimer = useRef<ReturnType<typeof setTimeout>>(null);

  // Autosave draft
  const saveDraft = useCallback(() => {
    if (!name && !description && !ideaText) return;
    setSaveStatus("saving");
    const draft = { name, description, ideaText, targetPlatform, savedAt: new Date().toISOString() };
    localStorage.setItem("pbh_draft_project", JSON.stringify(draft));
    setTimeout(() => setSaveStatus("saved"), 300);
  }, [name, description, ideaText, targetPlatform]);

  // Load draft on mount
  useEffect(() => {
    const draft = localStorage.getItem("pbh_draft_project");
    if (draft) {
      try {
        const parsed = JSON.parse(draft);
        setName(parsed.name || "");
        setDescription(parsed.description || "");
        setIdeaText(parsed.ideaText || "");
        setTargetPlatform(parsed.targetPlatform || "");
      } catch {
        // ignore
      }
    }
  }, []);

  // Autosave on change
  useEffect(() => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(saveDraft, 1000);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [name, description, ideaText, targetPlatform, saveDraft]);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!targetPlatform) newErrors.targetPlatform = "Veuillez choisir un type de produit.";
    if (!name.trim()) newErrors.name = "Project name is required";
    if (name.length > 200) newErrors.name = "Name must be 200 characters or less";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const project = await projects.createProject(
        name.trim(),
        description.trim(),
        ideaText.trim(),
        [targetPlatform as TargetPlatform]
      );
      localStorage.removeItem("pbh_draft_project");
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setErrors({ submit: String(err) });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <h1>{t("newProject.title")}</h1>
        <div
          className={`save-indicator save-indicator-${saveStatus === "saving" ? "saving" : saveStatus === "saved" ? "saved" : ""}`}
        >
          <div className="save-indicator-dot" />
          {saveStatus === "saving" && t("newProject.savingDraft")}
          {saveStatus === "saved" && t("newProject.draftSaved")}
        </div>
      </div>

      <div className="page-content" style={{ maxWidth: 720 }}>
        <form onSubmit={handleSubmit}>
          {/* Target Platform */}
          <div className="mb-6">
            <label className="label label-required">Quel type de produit souhaitez-vous concevoir ?</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
              <div 
                className={`platform-card ${targetPlatform === 'ANDROID_EXPO' ? 'selected' : ''}`}
                onClick={() => setTargetPlatform('ANDROID_EXPO')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <div style={{ fontSize: '1.5rem' }}>📱</div>
                  <h3 style={{ margin: 0, fontWeight: 600 }}>Application mobile Android</h3>
                </div>
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-neutral-500)' }}>Application installée sur un téléphone Android, développée avec React Native et Expo.</p>
              </div>
              <div 
                className={`platform-card ${targetPlatform === 'WEB_NEXTJS' ? 'selected' : ''}`}
                onClick={() => setTargetPlatform('WEB_NEXTJS')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <div style={{ fontSize: '1.5rem' }}>🌐</div>
                  <h3 style={{ margin: 0, fontWeight: 600 }}>Application web</h3>
                </div>
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-neutral-500)' }}>Application React utilisée directement dans un navigateur et déployable sur le web.</p>
              </div>
            </div>
            {errors.targetPlatform && <div className="error-text mt-2">{errors.targetPlatform}</div>}
          </div>

          {/* Project Name */}
          <div className="mb-6">
            <label htmlFor="project-name" className="label label-required">
              {t("newProject.nameLabel")}
            </label>
            <input
              id="project-name"
              className={`input ${errors.name ? "input-error" : ""}`}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("newProject.namePlaceholder")}
              maxLength={200}
              autoFocus
            />
            {errors.name && <div className="error-text">{errors.name}</div>}
          </div>

          {/* Description */}
          <div className="mb-6">
            <label htmlFor="project-description" className="label">
              {t("newProject.descLabel")}
            </label>
            <input
              id="project-description"
              className="input"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("newProject.descPlaceholder")}
              maxLength={2000}
            />
          </div>

          {/* Idea Text */}
          <div className="mb-6">
            <label htmlFor="project-idea" className="label">
              {t("newProject.ideaLabel")}
            </label>
            <p className="text-sm text-muted mb-2">{t("newProject.ideaPlaceholder")}</p>
            <textarea
              id="project-idea"
              className="textarea"
              value={ideaText}
              onChange={(e) => setIdeaText(e.target.value)}
              placeholder="Décrivez votre idée de produit ici...&#10;&#10;Par exemple:&#10;Nous avons besoin d'une application de garde-robe connectée intelligente. L'utilisateur doit pouvoir lister ses vêtements par matière et recevoir des suggestions adaptées à la météo (pluie, température)..."
              maxLength={50000}
              style={{ minHeight: 250 }}
            />
            <div className="text-xs text-muted mt-1">
              {ideaText.length.toLocaleString()} / 50,000 characters
            </div>
          </div>

          {/* Submit error */}
          {errors.submit && (
            <div className="toast toast-error mb-4" style={{ position: "static" }}>
              {errors.submit}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-4">
            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={isSubmitting || !name.trim()}
            >
              {isSubmitting ? (
                <>
                  <div
                    className="loading-spinner"
                    style={{ width: 16, height: 16, borderWidth: 2 }}
                  />
                  {t("action.loading")}
                </>
              ) : (
                t("newProject.createBtn")
              )}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => router.push("/projects")}
            >
              {t("action.cancel")}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
