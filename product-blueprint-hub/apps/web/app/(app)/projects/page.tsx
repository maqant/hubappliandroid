"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useServices, type Project } from "@/services";
import { useTranslation } from "@/i18n";

export default function ProjectsPage() {
  const { projects } = useServices();
  const router = useRouter();
  const { t, lang } = useTranslation();
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "archived">("all");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    setIsLoading(true);
    try {
      const all = await projects.listProjects();
      setProjectList(all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    } finally {
      setIsLoading(false);
    }
  }, [projects]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const filteredProjects = projectList.filter((p) => {
    if (filter === "active" && p.status === "ARCHIVED") return false;
    if (filter === "archived" && p.status !== "ARCHIVED") return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
    }
    return p.status !== "DELETED";
  });

  const handleArchive = async (id: string) => {
    await projects.archiveProject(id as import("@pbh/domain").EntityId);
    loadProjects();
  };

  const handleDelete = async (id: string) => {
    await projects.deleteProject(id as import("@pbh/domain").EntityId);
    setDeleteConfirm(null);
    loadProjects();
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (isLoading) {
    return (
      <div className="loading-state">
        <div className="loading-spinner" />
        <span>{t("action.loading")}</span>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <h1>{t("projects.title")}</h1>
        <Link href="/projects/new" className="btn btn-primary">
          {t("nav.newProject")}
        </Link>
      </div>

      <div className="page-content">
        {/* Search and filter */}
        <div className="flex items-center gap-4 mb-6">
          <input
            className="input"
            type="search"
            placeholder={t("projects.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ maxWidth: 320 }}
            aria-label="Search projects"
          />
          <div className="tabs" style={{ marginBottom: 0, borderBottom: "none" }}>
            {(["all", "active", "archived"] as const).map((f) => (
              <button
                key={f}
                className={`tab ${filter === f ? "tab-active" : ""}`}
                onClick={() => setFilter(f)}
              >
                {f === "all"
                  ? lang === "fr"
                    ? "Tous"
                    : "All"
                  : f === "active"
                    ? lang === "fr"
                      ? "Actifs"
                      : "Active"
                    : lang === "fr"
                      ? "Archivés"
                      : "Archived"}
              </button>
            ))}
          </div>
        </div>

        {/* Project list */}
        {filteredProjects.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📁</div>
            <h3>{t("projects.noProjects")}</h3>
            <p>{t("projects.createFirst")}</p>
            <Link href="/projects/new" className="btn btn-primary">
              {t("nav.newProject")}
            </Link>
          </div>
        ) : (
          <div className="grid grid-2">
            {filteredProjects.map((project) => (
              <div
                key={project.id}
                className="card card-clickable"
                onClick={() => router.push(`/projects/${project.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/projects/${project.id}`);
                  }
                }}
                aria-label={`Open project ${project.name}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 style={{ fontSize: "var(--font-size-lg)" }}>{project.name}</h3>
                  <span className={`badge badge-${project.status.toLowerCase()}`}>
                    {project.status === "ACTIVE"
                      ? lang === "fr"
                        ? "Actif"
                        : "Active"
                      : project.status === "ARCHIVED"
                        ? lang === "fr"
                          ? "Archivé"
                          : "Archived"
                        : project.status}
                  </span>
                </div>

                {project.description && (
                  <p
                    className="text-sm text-muted"
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {project.description}
                  </p>
                )}

                <div className="flex items-center justify-between mt-4">
                  <span className="text-xs text-muted">
                    {lang === "fr" ? "Mis à jour le " : "Updated "}
                    {formatDate(project.updatedAt)}
                  </span>

                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    {project.status !== "ARCHIVED" && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleArchive(project.id)}
                        aria-label={`Archive project ${project.name}`}
                      >
                        📦 {t("action.archive")}
                      </button>
                    )}
                    {deleteConfirm === project.id ? (
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(project.id)}
                      >
                        {t("action.confirm")}
                      </button>
                    ) : (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setDeleteConfirm(project.id)}
                        aria-label={`Delete project ${project.name}`}
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{lang === "fr" ? "Supprimer le projet ?" : "Delete Project?"}</h3>
            </div>
            <div className="modal-body">
              <p>
                {lang === "fr"
                  ? "Cette action est irréversible. Toutes les données du projet seront définitivement supprimées."
                  : "This action cannot be undone. All project data will be permanently removed."}
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>
                {t("action.cancel")}
              </button>
              <button className="btn btn-danger" onClick={() => handleDelete(deleteConfirm)}>
                {lang === "fr" ? "Supprimer définitivement" : "Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
