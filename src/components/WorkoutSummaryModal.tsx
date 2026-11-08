import React from 'react';
import { Award, CheckCircle2, Clock, Flame, Sparkles, TrendingUp, Trophy } from 'lucide-react';

export interface WorkoutSummaryData {
  sessionName: string;
  date: string;
  durationMinutes: number;
  totalSets: number;
  totalTonnage: number;
  previousSessionTonnage: number | null;
  validatedPaliers: string[];
  newRecords: { exercise: string; weightKg: number; reps: number }[];
  syncedOk: boolean;
}

interface WorkoutSummaryModalProps {
  summary: WorkoutSummaryData | null;
  onClose: () => void;
}

export const WorkoutSummaryModal: React.FC<WorkoutSummaryModalProps> = ({ summary, onClose }) => {
  if (!summary) return null;

  const tonnageDiff =
    summary.previousSessionTonnage !== null && summary.previousSessionTonnage > 0
      ? summary.totalTonnage - summary.previousSessionTonnage
      : null;

  const tonnageDiffPct =
    tonnageDiff !== null && summary.previousSessionTonnage
      ? Math.round((tonnageDiff / summary.previousSessionTonnage) * 1000) / 10
      : null;

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
          {summary.syncedOk
            ? '✅ Enregistrée en direct dans ton Google Sheet'
            : '💾 Sauvegardée sur le téléphone (en attente de réseau)'}
        </p>

        <div className="summary-stats-grid">
          <div className="summary-stat-card">
            <div className="summary-stat-label">
              <Clock size={14} /> Durée
            </div>
            <div className="summary-stat-val">{Math.max(1, summary.durationMinutes)} min</div>
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

        <button type="button" className="primary-validate-btn" onClick={onClose}>
          <CheckCircle2 size={18} />
          <span>Super, retour à l'accueil</span>
        </button>
      </div>
    </div>
  );
};
