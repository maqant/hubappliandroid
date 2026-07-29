"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
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

  const [mounted, setMounted] = useState<boolean>(false);
  const [groups, setGroups] = useState<HistoricalDuplicateGroup[]>([]);
  const [selectedGroupIdx, setSelectedGroupIdx] = useState<number>(0);
  const [primarySelections, setPrimarySelections] = useState<Record<string, EntityId>>({});
  const [confirmingGroupId, setConfirmingGroupId] = useState<string | null>(null);

  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [isMerging, setIsMerging] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  if (!mounted || !isOpen) return null;

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

  const modalJSX = (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
          border: '1px solid #cbd5e1',
          width: '100%',
          maxWidth: '960px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#0f172a',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid #e2e8f0',
            backgroundColor: '#f8fafc',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0
          }}
        >
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              🔍 Auditer &amp; Fusionner les Doublons Historiques
              <span style={{ fontSize: '11px', padding: '2px 8px', backgroundColor: '#dbeafe', color: '#1e40af', fontWeight: 600, borderRadius: '9999px' }}>
                v0.22.1
              </span>
            </h3>
            <p style={{ fontSize: '12px', color: '#64748b', marginTop: '2px', margin: 0 }}>
              Analyse consultative sans écriture. Détecte les redondances sémantiques et structurelles.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '20px',
              fontWeight: 'bold',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '6px'
            }}
          >
            ✕
          </button>
        </header>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {error && (
            <div style={{ padding: '12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '12px', borderRadius: '8px', fontWeight: 500 }}>
              ⚠️ {error}
            </div>
          )}

          {isAnalyzing ? (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔍</div>
              <p style={{ fontSize: '14px', fontWeight: 500, color: '#475569', margin: 0 }}>Analyse des propositions historiques en cours...</p>
            </div>
          ) : groups.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
              <div style={{ fontSize: '36px', marginBottom: '12px' }}>✨</div>
              <h4 style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e293b', margin: 0 }}>Aucun doublon historique détecté</h4>
              <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', maxWidth: '400px', marginLeft: 'auto', marginRight: 'auto' }}>
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{ padding: '16px', backgroundColor: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '12px', color: '#78350f' }}>
                    <h4 style={{ fontWeight: 'bold', fontSize: '14px', margin: 0 }}>
                      🛡️ Confirmation de la fusion protégée (Groupe {confirmGroup.layer})
                    </h4>
                    <p style={{ fontSize: '12px', color: '#92400e', marginTop: '4px', margin: 0 }}>
                      Vérifiez ci-dessous le transfert des liaisons avant de déclencher la fusion.
                    </p>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', fontSize: '12px' }}>
                    {/* Element conservé (Principal) */}
                    <div style={{ padding: '16px', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ fontWeight: 'bold', color: '#065f46', fontSize: '14px' }}>
                        ⭐ Élément principal conservé
                      </div>
                      <div style={{ padding: '10px', backgroundColor: '#ffffff', borderRadius: '6px', border: '1px solid #a7f3d0' }}>
                        <div style={{ fontWeight: 'bold', color: '#0f172a' }}>{targetProp?.title}</div>
                        <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                          Statut : <span style={{ fontWeight: 600, color: '#047857' }}>{targetProp?.status}</span> | ID: {targetProp?.id}
                        </div>
                      </div>
                      <p style={{ color: '#334155', fontSize: '11px', margin: 0 }}>
                        Cet élément recevra toutes les relations, dépendances et enfants des éléments secondaires.
                      </p>
                    </div>

                    {/* Eléments fusionnés (SUPERSEDED) */}
                    <div style={{ padding: '16px', backgroundColor: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ fontWeight: 'bold', color: '#581c87', fontSize: '14px' }}>
                        📌 Éléments secondaires passés en SUPERSEDED ({sourceProps.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {sourceProps.map((s: DesignProposal) => (
                          <div key={s.id} style={{ padding: '8px', backgroundColor: '#ffffff', borderRadius: '6px', border: '1px solid #e9d5ff' }}>
                            <div style={{ fontWeight: 'bold', color: '#0f172a' }}>{s.title}</div>
                            <div style={{ fontSize: '10px', color: '#64748b' }}>Statut actuel : {s.status} | ID: {s.id}</div>
                          </div>
                        ))}
                      </div>
                      <p style={{ color: '#334155', fontSize: '11px', margin: 0 }}>
                        🔒 Aucun élément ne sera supprimé en base. Ils seront archivés sous le statut SUPERSEDED avec référence vers l&apos;élément principal.
                      </p>
                    </div>
                  </div>

                  {/* Impact Summary */}
                  <div style={{ padding: '16px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontWeight: 'bold', color: '#1e293b' }}>📊 Conséquences estimées de la fusion :</div>
                    <ul style={{ paddingLeft: '20px', color: '#475569', margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <li><strong>{confirmGroup.mergeImpact.childCountToReassign}</strong> proposition(s) enfant(s) seront réaffectée(s) vers {targetProp?.title}.</li>
                      <li><strong>{confirmGroup.mergeImpact.dependentCountToReassign}</strong> liaison(s) dépendante(s) seront réorientée(s).</li>
                      <li>Les Experience Paths seront automatiquement recalculés sans interrompre le graphe.</li>
                    </ul>
                  </div>

                  {/* Actions Confirmation */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
                    <button
                      onClick={() => setConfirmingGroupId(null)}
                      style={{ padding: '8px 16px', backgroundColor: '#f1f5f9', color: '#334155', fontSize: '12px', fontWeight: 600, borderRadius: '8px', border: 'none', cursor: 'pointer' }}
                      disabled={isMerging}
                    >
                      &larr; Annuler et revenir
                    </button>
                    <button
                      onClick={() => handleExecuteMerge(confirmGroup)}
                      style={{ padding: '8px 20px', backgroundColor: '#059669', color: '#ffffff', fontSize: '12px', fontWeight: 'bold', borderRadius: '8px', border: 'none', cursor: 'pointer' }}
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
            <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '24px' }}>
              {/* Left Column: Group Tabs */}
              <div style={{ flex: '1 1 260px', maxWidth: '320px', display: 'flex', flexDirection: 'column', gap: '8px', borderRight: '1px solid #e2e8f0', paddingRight: '16px' }}>
                <h4 style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', margin: 0 }}>
                  Groupes Détectés ({groups.length})
                </h4>
                {groups.map((g: HistoricalDuplicateGroup, idx: number) => {
                  const isSelected = idx === selectedGroupIdx;
                  return (
                    <button
                      key={g.id}
                      onClick={() => setSelectedGroupIdx(idx)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '12px',
                        borderRadius: '10px',
                        border: `2px solid ${isSelected ? '#3b82f6' : '#e2e8f0'}`,
                        backgroundColor: isSelected ? '#eff6ff' : '#ffffff',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 'bold', fontSize: '12px', color: '#0f172a' }}>
                            {g.layer === "JOURNEY" ? "🗺️ JOURNEY" : "🖥️ SCREEN"}
                          </span>
                          <span
                            style={{
                              fontSize: '10px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontWeight: 'bold',
                              backgroundColor: g.confidence === "HIGH" ? "#fee2e2" : "#fef3c7",
                              color: g.confidence === "HIGH" ? "#991b1b" : "#92400e"
                            }}
                          >
                            {g.confidence === "HIGH" ? "Haute" : "Moyenne"}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: '#475569', marginTop: '4px', fontWeight: 500 }}>
                          {g.proposals.map((p: DesignProposal) => p.title).join(" vs ")}
                        </div>
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 'bold', padding: '2px 6px', backgroundColor: '#f1f5f9', borderRadius: '9999px', color: '#334155' }}>
                        {g.proposalIds.length}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Right Column: Group Details & Side-by-Side Comparison */}
              {currentGroup && (
                <div style={{ flex: '2 1 480px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Similarity Signals & Differences Header */}
                  <div style={{ padding: '16px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#334155', marginBottom: '6px' }}>💡 Signaux de ressemblance :</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {currentGroup.similarities.map((sig, sIdx: number) => (
                          <span
                            key={sIdx}
                            style={{ padding: '4px 10px', backgroundColor: '#dbeafe', color: '#1e40af', fontSize: '11px', fontWeight: 600, borderRadius: '6px', border: '1px solid #bfdbfe' }}
                            title={sig.description}
                          >
                            ✓ {sig.label}
                          </span>
                        ))}
                      </div>
                    </div>

                    {currentGroup.differences.length > 0 && (
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>🔍 Différences notables :</div>
                        <ul style={{ paddingLeft: '18px', fontSize: '11px', color: '#475569', margin: 0 }}>
                          {currentGroup.differences.map((diff: string, dIdx: number) => (
                            <li key={dIdx}>{diff}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Proposals Side-by-Side Cards */}
                  <div>
                    <h5 style={{ fontSize: '12px', fontWeight: 'bold', color: '#334155', margin: 0, marginBottom: '8px' }}>
                      Sélectionnez l&apos;élément principal à conserver :
                    </h5>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                      {currentGroup.proposals.map((prop: DesignProposal) => {
                        const targetId = primarySelections[currentGroup.id] || currentGroup.primaryCandidateId;
                        const isPrimary = targetId === prop.id;
                        const isRecommended = currentGroup.primaryCandidateId === prop.id;

                        return (
                          <div
                            key={prop.id}
                            onClick={() => handleSelectPrimary(currentGroup.id, prop.id)}
                            style={{
                              padding: '16px',
                              borderRadius: '12px',
                              border: `2px solid ${isPrimary ? '#10b981' : '#e2e8f0'}`,
                              backgroundColor: isPrimary ? '#ecfdf5' : '#ffffff',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                              boxShadow: isPrimary ? '0 4px 6px -1px rgba(0, 0, 0, 0.1)' : 'none'
                            }}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', fontSize: '12px', color: '#0f172a', cursor: 'pointer' }}>
                                  <input
                                    type="radio"
                                    name={`primary-${currentGroup.id}`}
                                    checked={isPrimary}
                                    onChange={() => handleSelectPrimary(currentGroup.id, prop.id)}
                                    style={{ accentColor: '#10b981' }}
                                  />
                                  {prop.title}
                                </label>
                                {isRecommended && (
                                  <span style={{ fontSize: '10px', padding: '2px 6px', backgroundColor: '#fef3c7', color: '#92400e', fontWeight: 'bold', borderRadius: '4px' }}>
                                    ⭐ Recommandé
                                  </span>
                                )}
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px' }}>
                                <span style={{ padding: '2px 6px', backgroundColor: '#f1f5f9', color: '#334155', fontWeight: 600, borderRadius: '4px' }}>
                                  {prop.status}
                                </span>
                                <span style={{ color: '#94a3b8' }}>ID: {prop.id}</span>
                              </div>

                              <p style={{ fontSize: '11px', color: '#475569', margin: 0, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                {prop.description || prop.shortPitch || "Aucune description renseignée."}
                              </p>

                              {/* Layer-Specific Normalized Details */}
                              {prop.layer === "JOURNEY" ? (
                                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #f1f5f9', fontSize: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <div style={{ fontWeight: 'bold', color: '#334155' }}>Étapes ({normalizeJourneySteps(prop.layerData).length}) :</div>
                                  <div style={{ maxHeight: '96px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {normalizeJourneySteps(prop.layerData).map((st, sIdx) => (
                                      <div key={sIdx} style={{ backgroundColor: '#f8fafc', padding: '4px 6px', borderRadius: '4px', border: '1px solid #f1f5f9', color: '#334155' }}>
                                        <span style={{ fontWeight: 'bold' }}>{st.order || sIdx + 1}.</span> {st.userAction}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #f1f5f9', fontSize: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <div style={{ fontWeight: 'bold', color: '#334155' }}>Rôle d&apos;écran :</div>
                                  <div style={{ color: '#475569', backgroundColor: '#f8fafc', padding: '4px 6px', borderRadius: '4px', border: '1px solid #f1f5f9' }}>
                                    {(prop.layerData as any)?.role || "Non renseigné"}
                                  </div>
                                </div>
                              )}
                            </div>

                            <div style={{ marginTop: '12px', paddingTop: '8px', fontSize: '10px', fontWeight: 'bold', textAlign: 'center' }}>
                              {isPrimary ? (
                                <span style={{ color: '#047857' }}>✓ Conservé comme principal</span>
                              ) : (
                                <span style={{ color: '#7e22ce' }}>Passe en SUPERSEDED</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
                    <button
                      onClick={() => setConfirmingGroupId(currentGroup.id)}
                      style={{ padding: '10px 20px', backgroundColor: '#2563eb', color: '#ffffff', fontSize: '12px', fontWeight: 'bold', borderRadius: '8px', border: 'none', cursor: 'pointer' }}
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

  return createPortal(modalJSX, document.body);
}
