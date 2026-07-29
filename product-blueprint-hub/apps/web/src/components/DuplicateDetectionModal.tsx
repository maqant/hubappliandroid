"use client";

import { useState, useEffect } from "react";
import {
  useServices,
  type EntityId,
  type DesignProposal,
  type HistoricalDuplicateGroup,
  normalizeJourneySteps
} from "@/services";

interface DuplicateDetectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: EntityId;
  proposals: DesignProposal[];
  onMerged?: () => void;
  showToast?: (msg: string) => void;
}

export function DuplicateDetectionModal({
  isOpen,
  onClose,
  projectId,
  proposals,
  onMerged,
  showToast,
}: DuplicateDetectionModalProps) {
  const svc = useServices();

  const [groups, setGroups] = useState<HistoricalDuplicateGroup[]>([]);
  const [selectedGroupIdx, setSelectedGroupIdx] = useState<number>(0);
  const [primarySelections, setPrimarySelections] = useState<Record<string, EntityId>>({});
  const [confirmingGroupId, setConfirmingGroupId] = useState<string | null>(null);

  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [isMerging, setIsMerging] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setIsAnalyzing(true);
      setError(null);
      setConfirmingGroupId(null);
      try {
        const detected = svc.designWorkshop.detectHistoricalDuplicates(proposals);
        setGroups(detected);
        
        // Initial primary selections based on primaryCandidateId recommendation
        const initialMap: Record<string, EntityId> = {};
        detected.forEach((g: HistoricalDuplicateGroup) => {
          initialMap[g.id] = g.primaryCandidateId;
        });
        setPrimarySelections(initialMap);
        setSelectedGroupIdx(0);
      } catch (e: any) {
        setError(e.message || "Erreur lors de l'analyse des doublons.");
      } finally {
        setIsAnalyzing(false);
      }
    }
  }, [isOpen, proposals, svc]);

  if (!isOpen) return null;

  const notify = (msg: string) => {
    if (showToast) showToast(msg);
    else alert(msg);
  };

  const currentGroup = groups[selectedGroupIdx];

  const handleSelectPrimary = (groupId: string, proposalId: EntityId) => {
    setPrimarySelections(prev => ({ ...prev, [groupId]: proposalId }));
  };

  const handleExecuteMerge = async (group: HistoricalDuplicateGroup) => {
    const targetId = primarySelections[group.id] || group.primaryCandidateId;
    const sourceIds = group.proposalIds.filter((id: EntityId) => id !== targetId);

    if (sourceIds.length === 0) {
      setError("Au moins une proposition source doit être sélectionnée pour la fusion.");
      return;
    }

    setIsMerging(true);
    setError(null);

    try {
      const res = await svc.designWorkshop.mergeHistoricalProposals(projectId, targetId, sourceIds);
      notify(`✨ Fusion réussie ! ${res.reassignedCount} relation(s) réaffectée(s).`);

      // Remove merged group from local list
      const remainingGroups = groups.filter((g: HistoricalDuplicateGroup) => g.id !== group.id);
      setGroups(remainingGroups);
      setConfirmingGroupId(null);
      if (selectedGroupIdx >= remainingGroups.length) {
        setSelectedGroupIdx(Math.max(0, remainingGroups.length - 1));
      }

      if (onMerged) {
        onMerged();
      }
    } catch (e: any) {
      setError(e.message || "Erreur lors de la fusion des propositions.");
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              🔍 Auditer &amp; Fusionner les Doublons Historiques
              <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-800 font-semibold rounded-full">v0.21.0</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Analyse consultative sans écriture. Détecte les redondances sémantiques et structurelles.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-lg font-bold px-2 py-1 rounded-md"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg font-medium">
              ⚠️ {error}
            </div>
          )}

          {isAnalyzing ? (
            <div className="text-center py-12">
              <div className="animate-spin text-3xl mb-3">🔍</div>
              <p className="text-sm font-medium text-slate-600">Analyse des propositions historiques en cours...</p>
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <div className="text-4xl mb-3">✨</div>
              <h4 className="text-sm font-bold text-slate-800">Aucun doublon historique détecté</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Toutes les propositions JOURNEY et SCREEN de ce projet présentent des périmètres et actions suffisamment distincts.
              </p>
            </div>
          ) : confirmingGroupId ? (
            /* VIEW 2 : Confirmation Protégée */
            (() => {
              const confirmGroup = groups.find((g: HistoricalDuplicateGroup) => g.id === confirmingGroupId);
              if (!confirmGroup) return null;

              const targetId = primarySelections[confirmGroup.id] || confirmGroup.primaryCandidateId;
              const targetProp = confirmGroup.proposals.find((p: DesignProposal) => p.id === targetId);
              const sourceProps = confirmGroup.proposals.filter((p: DesignProposal) => p.id !== targetId);

              return (
                <div className="space-y-6">
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
                    <h4 className="font-bold text-sm flex items-center gap-2">
                      🛡️ Confirmation de la fusion protégée (Groupe {confirmGroup.layer})
                    </h4>
                    <p className="text-xs text-amber-800 mt-1">
                      Vérifiez ci-dessous le transfert des liaisons avant de déclencher la fusion.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    {/* Element conservé (Principal) */}
                    <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                      <div className="font-bold text-emerald-900 text-sm flex items-center gap-1.5">
                        ⭐ Élément principal conservé
                      </div>
                      <div className="p-2.5 bg-white rounded border border-emerald-200">
                        <div className="font-bold text-slate-900">{targetProp?.title}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Statut : <span className="font-semibold text-emerald-700">{targetProp?.status}</span> | ID: {targetProp?.id}
                        </div>
                      </div>
                      <p className="text-slate-600 text-[11px]">
                        Cet élément recevra toutes les relations, dépendances et enfants des éléments secondaires.
                      </p>
                    </div>

                    {/* Eléments fusionnés (SUPERSEDED) */}
                    <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl space-y-2">
                      <div className="font-bold text-purple-900 text-sm flex items-center gap-1.5">
                        📌 Éléments secondaires passés en SUPERSEDED ({sourceProps.length})
                      </div>
                      <div className="space-y-1.5">
                        {sourceProps.map((s: DesignProposal) => (
                          <div key={s.id} className="p-2 bg-white rounded border border-purple-200">
                            <div className="font-bold text-slate-900">{s.title}</div>
                            <div className="text-[10px] text-slate-500">Statut actuel : {s.status} | ID: {s.id}</div>
                          </div>
                        ))}
                      </div>
                      <p className="text-slate-600 text-[11px]">
                        🔒 Aucun élément ne sera supprimé en base. Ils seront archivés sous le statut SUPERSEDED avec référence vers l&apos;élément principal.
                      </p>
                    </div>
                  </div>

                  {/* Impact Summary */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2">
                    <div className="font-bold text-slate-800">📊 Conséquences estimées de la fusion :</div>
                    <ul className="list-disc pl-5 text-slate-600 space-y-1">
                      <li><strong>{confirmGroup.mergeImpact.childCountToReassign}</strong> proposition(s) enfant(s) seront réaffectée(s) vers {targetProp?.title}.</li>
                      <li><strong>{confirmGroup.mergeImpact.dependentCountToReassign}</strong> liaison(s) dépendante(s) seront réorientée(s).</li>
                      <li>Les Experience Paths seront automatiquement recalculés sans interrompre le graphe.</li>
                    </ul>
                  </div>

                  {/* Actions Confirmation */}
                  <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                    <button
                      onClick={() => setConfirmingGroupId(null)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
                      disabled={isMerging}
                    >
                      &larr; Annuler et revenir
                    </button>
                    <button
                      onClick={() => handleExecuteMerge(confirmGroup)}
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-2"
                      disabled={isMerging}
                    >
                      {isMerging ? "Fusion en cours..." : "🚀 Confirmer et exécuter la fusion"}
                    </button>
                  </div>
                </div>
              );
            })()
          ) : (
            /* VIEW 1 : Liste et Comparaison */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Group Tabs */}
              <div className="lg:col-span-4 space-y-2 border-r border-slate-200 pr-4">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                  Groupes Détectés ({groups.length})
                </h4>
                {groups.map((g: HistoricalDuplicateGroup, idx: number) => {
                  const isSelected = idx === selectedGroupIdx;
                  return (
                    <button
                      key={g.id}
                      onClick={() => setSelectedGroupIdx(idx)}
                      className={`w-full text-left p-3 rounded-xl border transition flex justify-between items-start ${
                        isSelected
                          ? "bg-blue-50 border-blue-500 shadow-sm"
                          : "bg-white border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-800">
                            {g.layer === "JOURNEY" ? "🗺️ JOURNEY" : "🖥️ SCREEN"}
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                              g.confidence === "HIGH"
                                ? "bg-red-100 text-red-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {g.confidence === "HIGH" ? "Confiance Haute" : "Confiance Moyenne"}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600 mt-1 font-medium line-clamp-1">
                          {g.proposals.map((p: DesignProposal) => p.title).join(" vs ")}
                        </div>
                      </div>
                      <span className="text-xs font-bold px-2 py-0.5 bg-slate-100 rounded-full text-slate-700">
                        {g.proposalIds.length}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Right Column: Group Details & Side-by-Side Comparison */}
              {currentGroup && (
                <div className="lg:col-span-8 space-y-5">
                  {/* Similarity Signals & Differences Header */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <div>
                      <div className="text-xs font-bold text-slate-700 mb-1.5">💡 Signaux de ressemblance :</div>
                      <div className="flex flex-wrap gap-2">
                        {currentGroup.similarities.map((sig, sIdx: number) => (
                          <span
                            key={sIdx}
                            className="px-2.5 py-1 bg-blue-100 text-blue-800 text-[11px] font-semibold rounded-md border border-blue-200"
                            title={sig.description}
                          >
                            ✓ {sig.label}
                          </span>
                        ))}
                      </div>
                    </div>

                    {currentGroup.differences.length > 0 && (
                      <div>
                        <div className="text-xs font-bold text-slate-700 mb-1">🔍 Différences notables :</div>
                        <ul className="list-disc pl-4 text-[11px] text-slate-600 space-y-0.5">
                          {currentGroup.differences.map((diff: string, dIdx: number) => (
                            <li key={dIdx}>{diff}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Proposals Side-by-Side Cards */}
                  <div>
                    <h5 className="text-xs font-bold text-slate-700 mb-2">
                      Sélectionnez l&apos;élément principal à conserver :
                    </h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {currentGroup.proposals.map((prop: DesignProposal) => {
                        const targetId = primarySelections[currentGroup.id] || currentGroup.primaryCandidateId;
                        const isPrimary = targetId === prop.id;
                        const isRecommended = currentGroup.primaryCandidateId === prop.id;

                        return (
                          <div
                            key={prop.id}
                            onClick={() => handleSelectPrimary(currentGroup.id, prop.id)}
                            className={`p-4 rounded-xl border-2 transition cursor-pointer flex flex-col justify-between ${
                              isPrimary
                                ? "bg-emerald-50/60 border-emerald-500 shadow-md"
                                : "bg-white border-slate-200 hover:border-slate-300"
                            }`}
                          >
                            <div className="space-y-2">
                              <div className="flex justify-between items-start gap-2">
                                <label className="flex items-center gap-2 font-bold text-xs text-slate-900 cursor-pointer">
                                  <input
                                    type="radio"
                                    name={`primary-${currentGroup.id}`}
                                    checked={isPrimary}
                                    onChange={() => handleSelectPrimary(currentGroup.id, prop.id)}
                                    className="text-emerald-600 focus:ring-emerald-500"
                                  />
                                  {prop.title}
                                </label>
                                {isRecommended && (
                                  <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-800 font-bold rounded">
                                    ⭐ Recommandé
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2 text-[10px]">
                                <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 font-semibold rounded">
                                  {prop.status}
                                </span>
                                <span className="text-slate-400">ID: {prop.id}</span>
                              </div>

                              <p className="text-[11px] text-slate-600 line-clamp-3">
                                {prop.description || prop.shortPitch || "Aucune description renseignée."}
                              </p>

                              {/* Layer-Specific Normalized Details */}
                              {prop.layer === "JOURNEY" ? (
                                <div className="mt-2 pt-2 border-t border-slate-100 text-[10px] space-y-1">
                                  <div className="font-bold text-slate-700">Étapes ({normalizeJourneySteps(prop.layerData).length}) :</div>
                                  <div className="max-h-24 overflow-y-auto space-y-1">
                                    {normalizeJourneySteps(prop.layerData).map((st, sIdx) => (
                                      <div key={sIdx} className="bg-slate-50 p-1 rounded border border-slate-100 text-slate-700">
                                        <span className="font-bold">{st.order || sIdx + 1}.</span> {st.userAction}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <div className="mt-2 pt-2 border-t border-slate-100 text-[10px] space-y-1">
                                  <div className="font-bold text-slate-700">Rôle d&apos;écran :</div>
                                  <div className="text-slate-600 bg-slate-50 p-1 rounded border border-slate-100">
                                    {(prop.layerData as any)?.role || "Non renseigné"}
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="mt-3 pt-2 text-[10px] font-bold text-center">
                              {isPrimary ? (
                                <span className="text-emerald-700">✓ Conservé comme principal</span>
                              ) : (
                                <span className="text-purple-600">Passe en SUPERSEDED</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                    <button
                      onClick={() => setConfirmingGroupId(currentGroup.id)}
                      className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-2"
                    >
                      🛡️ Préparer la fusion de ce groupe &rarr;
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
