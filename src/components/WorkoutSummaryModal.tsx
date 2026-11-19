import React, { useState } from 'react';
import {
  Award,
  CheckCircle2,
  Clock,
  Flame,
  Share2,
  Sparkles,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { shareOrDownloadRecapCard } from '../utils/shareCardGenerator';

export interface WorkoutSummaryData {
  sessionName: string;
  date: string;
  durationMinutes: number | null;
  exercisesCount?: number;
  totalSets: number;
  totalTonnage: number;
  previousSessionTonnage: number | null;
  validatedPaliers: string[];
  newRecords: { exercise: string; weightKg: number; reps: number }[];
  syncedOk: boolean;
  syncModeLabel?: string;
}

export function formatWorkoutDuration(mins: number): string {
  const safe = Math.max(1, Math.round(mins));
  if (safe >= 60) {
    const h = Math.floor(safe / 60);
    const m = safe % 60;
    return `${h}h ${String(m).padStart(2, '0')}`;
  }
  return `${safe} min`;
}

interface WorkoutSummaryModalProps {
  summary: WorkoutSummaryData | null;
  profileName?: string;
  onClose: () => void;
}

export const WorkoutSummaryModal: React.FC<WorkoutSummaryModalProps> = ({
  summary,
  profileName,
  onClose,
}) => {
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  if (!summary) return null;

  const tonnageDiff =
    summary.previousSessionTonnage !== null && summary.previousSessionTonnage > 0
      ? summary.totalTonnage - summary.previousSessionTonnage
      : null;

  const tonnageDiffPct =
    tonnageDiff !== null && summary.previousSessionTonnage
      ? Math.round((tonnageDiff / summary.previousSessionTonnage) * 1000) / 10
      : null;

  const handleShareCard = async () => {
    setIsGenerating(true);
    setShareStatus(null);
    try {
      const res = await shareOrDownloadRecapCard(summary, profileName);
      if (res.method === 'share') {
        setShareStatus('✅ Carte partagée !');
      } else if (res.method === 'download') {
        setShareStatus('📥 Image PNG téléchargée !');
      }
    } catch {
      setShareStatus('Impossible de générer l’image.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="summary-title">
      <div className="modal-sheet summary-modal-sheet">
        <div className="summary-hero-badge">
          <Trophy size={28} />
        </div>
        <h2 id="summary-title" className="summary-title">
          Séance {summary.sessionName} Terminée !
        </h2>
        <p className="summary-sub">
          {summary.syncModeLabel
            ? summary.syncModeLabel
            : summary.syncedOk
            ? '✅ Enregistrée avec succès'
            : '💾 Sauvegardée sur le téléphone (en attente de synchro)'}
        </p>

        <div className="summary-stats-grid">
          <div className="summary-stat-card">
            <div className="summary-stat-label">
              <Clock size={14} /> {summary.durationMinutes !== null ? 'Durée' : 'Exercices'}
            </div>
            <div className="summary-stat-val">
              {summary.durationMinutes !== null
                ? formatWorkoutDuration(summary.durationMinutes)
                : `${summary.exercisesCount || '—'} exos`}
            </div>
            <div className="summary-stat-meta">{summary.totalSets} séries validées</div>
          </div>

          <div className="summary-stat-card highlight">
            <div className="summary-stat-label">
              <Flame size={14} /> Tonnage Total
            </div>
            <div className="summary-stat-val">
              {summary.totalTonnage.toLocaleString('fr-FR')} kg
            </div>
            {tonnageDiff !== null && (
              <div
                className={`summary-stat-meta ${
                  tonnageDiff >= 0 ? 'diff-positive' : 'diff-neutral'
                }`}
              >
                <TrendingUp size={12} />{' '}
                {tonnageDiff >= 0 ? `+${tonnageDiff}` : tonnageDiff} kg (
                {tonnageDiffPct !== null && tonnageDiffPct >= 0
                  ? `+${tonnageDiffPct}%`
                  : `${tonnageDiffPct}%`}{' '}
                vs dernière)
              </div>
            )}
          </div>
        </div>

        {summary.newRecords.length > 0 && (
          <div className="summary-box pr-box">
            <div className="summary-box-title">
              <Award size={16} /> Nouveaux Records Battus ({summary.newRecords.length})
            </div>
            <div className="summary-chips">
              {summary.newRecords.map((pr) => (
                <span key={pr.exercise} className="summary-chip pr-chip">
                  🔥 {pr.exercise.split('(')[0].trim()} : {pr.weightKg}kg × {pr.reps}
                </span>
              ))}
            </div>
          </div>
        )}

        {summary.validatedPaliers.length > 0 && (
          <div className="summary-box palier-box">
            <div className="summary-box-title">
              <Sparkles size={16} /> Paliers Validés pour la prochaine séance
            </div>
            <div className="summary-chips">
              {summary.validatedPaliers.map((ex) => (
                <span key={ex} className="summary-chip palier-chip">
                  🏆 {ex.split('(')[0].trim()} (+2,5 kg)
                </span>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginTop: '0.9rem' }}>
          <button
            type="button"
            className="secondary-btn"
            style={{ width: '100%', minHeight: '48px', justifyContent: 'center', fontSize: '0.9rem' }}
            onClick={handleShareCard}
            disabled={isGenerating}
          >
            <Share2 size={17} />
            <span>{isGenerating ? 'Génération...' : '📸 Partager ma séance (Image)'}</span>
          </button>

          {shareStatus && (
            <div style={{ fontSize: '0.78rem', color: '#34d399', fontWeight: 600 }}>
              {shareStatus}
            </div>
          )}

          <button
            type="button"
            className="primary-validate-btn"
            style={{ marginTop: 0 }}
            onClick={onClose}
          >
            <CheckCircle2 size={18} />
            <span>Super, retour à l&apos;accueil</span>
          </button>
        </div>
      </div>
    </div>
  );
};
