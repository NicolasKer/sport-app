import React, { useMemo, useState } from 'react';
import { Award, Calendar, Edit3, Flame, LineChart, Trash2, TrendingUp, Trophy, X } from 'lucide-react';
import { JournalRow } from '../types/workout';
import { normalizeExerciseKey } from '../services/sheetsApi';

interface HistoryAndStatsViewProps {
  journalRows: JournalRow[];
  onEditSession: (date: string, sessionName: string, rows: JournalRow[]) => void;
  onDeleteSession: (date: string, sessionName: string, rows: JournalRow[]) => void;
}

export const HistoryAndStatsView: React.FC<HistoryAndStatsViewProps> = ({
  journalRows,
  onEditSession,
  onDeleteSession,
}) => {
  const [selectedExerciseName, setSelectedExerciseName] = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<'avgWeight' | 'tonnage' | 'maxWeight'>('avgWeight');
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [selectedSessionType, setSelectedSessionType] = useState<
    'Full Body' | 'Lower + Cardio' | 'Upper'
  >('Full Body');

  const pastSessions = useMemo(() => {
    const groups = new Map<
      string,
      {
        date: string;
        sessionName: string;
        totalTonnage: number;
        totalSets: number;
        validatedPaliers: string[];
        exercises: Map<string, JournalRow[]>;
        allRows: JournalRow[];
      }
    >();

    for (const r of journalRows) {
      const hasData =
        (r.weightKg !== null && r.weightKg > 0) ||
        (r.reps !== null && r.reps > 0) ||
        r.feeling !== '' ||
        r.notes !== '';
      if (!hasData) continue;

      const key = `${r.date}__${r.sessionName}`;
      if (!groups.has(key)) {
        groups.set(key, {
          date: r.date,
          sessionName: r.sessionName,
          totalTonnage: 0,
          totalSets: 0,
          validatedPaliers: [],
          exercises: new Map(),
          allRows: [],
        });
      }
      const g = groups.get(key)!;
      g.allRows.push(r);
      g.totalSets += 1;
      g.totalTonnage += (r.weightKg || 0) * (r.reps || 0);
      if (r.levelValidated && !g.validatedPaliers.includes(r.exercise)) {
        g.validatedPaliers.push(r.exercise);
      }
      if (!g.exercises.has(r.exercise)) {
        g.exercises.set(r.exercise, []);
      }
      g.exercises.get(r.exercise)!.push(r);
    }

    return Array.from(groups.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [journalRows]);

  const personalRecords = useMemo(() => {
    const prMap = new Map<
      string,
      {
        exercise: string;
        avgWeightLatest: number;
        maxWeight: number;
        reps: number;
        date: string;
        levelValidated: boolean;
      }
    >();

    // Group by exercise + date to compute session averages as well
    for (const r of journalRows) {
      if (!r.weightKg || r.weightKg <= 0) continue;
      const existing = prMap.get(r.exercise);
      if (
        !existing ||
        r.weightKg > existing.maxWeight ||
        (r.weightKg === existing.maxWeight && (r.reps || 0) > existing.reps)
      ) {
        prMap.set(r.exercise, {
          exercise: r.exercise,
          avgWeightLatest: r.weightKg,
          maxWeight: r.weightKg,
          reps: r.reps || 0,
          date: r.date,
          levelValidated: r.levelValidated,
        });
      }
    }

    return Array.from(prMap.values()).sort((a, b) => b.maxWeight - a.maxWeight);
  }, [journalRows]);

  const exerciseProgression = useMemo(() => {
    if (!selectedExerciseName) return [];
    const targetKey = normalizeExerciseKey(selectedExerciseName);
    const byDate = new Map<
      string,
      {
        date: string;
        weights: number[];
        avgWeight: number;
        maxWeight: number;
        bestReps: number;
        sessionTonnage: number;
        setsText: string;
      }
    >();

    for (const r of journalRows) {
      if (!r.weightKg || r.weightKg <= 0) continue;
      if (normalizeExerciseKey(r.exercise) !== targetKey) continue;

      if (!byDate.has(r.date)) {
        byDate.set(r.date, {
          date: r.date,
          weights: [],
          avgWeight: r.weightKg,
          maxWeight: r.weightKg,
          bestReps: r.reps || 0,
          sessionTonnage: 0,
          setsText: '',
        });
      }
      const entry = byDate.get(r.date)!;
      entry.weights.push(r.weightKg);
      const sumW = entry.weights.reduce((acc, w) => acc + w, 0);
      entry.avgWeight = Math.round((sumW / entry.weights.length) * 10) / 10;

      if (r.weightKg >= entry.maxWeight) {
        entry.maxWeight = r.weightKg;
        entry.bestReps = r.reps || 0;
      }
      entry.sessionTonnage += (r.weightKg || 0) * (r.reps || 0);
      entry.setsText = entry.setsText
        ? `${entry.setsText} · ${r.weightKg}×${r.reps || 0}`
        : `${r.weightKg}×${r.reps || 0}`;
    }

    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [journalRows, selectedExerciseName]);

  const sessionTypeProgression = useMemo(() => {
    return pastSessions
      .filter((s) => s.sessionName === selectedSessionType && s.totalTonnage > 0)
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [pastSessions, selectedSessionType]);

  return (
    <div className="history-view">
      <section className="pr-section" style={{ marginBottom: '1.25rem' }}>
        <div className="section-heading">
          <LineChart size={18} />
          <h2>Évolution du Tonnage par Séance</h2>
        </div>

        <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.65rem' }}>
          {(['Full Body', 'Lower + Cardio', 'Upper'] as const).map((type) => (
            <button
              key={type}
              type="button"
              className={`superset-mini-tab ${selectedSessionType === type ? 'active' : ''}`}
              style={{ flex: 1 }}
              onClick={() => setSelectedSessionType(type)}
            >
              {type}
            </button>
          ))}
        </div>

        <div className="chart-container" style={{ marginBottom: 0 }}>
          {sessionTypeProgression.length === 0 ? (
            <div className="chart-caption">Aucune séance enregistrée pour {selectedSessionType}.</div>
          ) : (
            <>
              <div className="chart-caption">
                Tonnage total soulevé sur <strong>{selectedSessionType}</strong> (
                {sessionTypeProgression.length} séance{sessionTypeProgression.length > 1 ? 's' : ''})
              </div>
              <svg viewBox="0 0 320 135" className="progression-svg">
                {(() => {
                  const values = sessionTypeProgression.map((s) => s.totalTonnage);
                  const minV = Math.min(...values) * 0.9;
                  const maxV = Math.max(...values) * 1.05 || 100;
                  const range = Math.max(50, maxV - minV);

                  const points = sessionTypeProgression.map((s, idx) => {
                    const x =
                      sessionTypeProgression.length === 1
                        ? 160
                        : 38 + (idx / (sessionTypeProgression.length - 1)) * 244;
                    const y = 100 - ((s.totalTonnage - minV) / range) * 70;
                    return { x, y, ...s };
                  });

                  const polylinePoints = points.map((pt) => `${pt.x},${pt.y}`).join(' ');

                  return (
                    <>
                      <line x1="24" y1="105" x2="296" y2="105" stroke="rgba(255,255,255,0.1)" />
                      {points.length > 1 && (
                        <polyline
                          fill="none"
                          stroke="#06b6d4"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          points={polylinePoints}
                        />
                      )}
                      {points.map((pt) => (
                        <g key={pt.date}>
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r="5"
                            fill="#06b6d4"
                            stroke="#090d16"
                            strokeWidth="2"
                          />
                          <text
                            x={pt.x}
                            y={pt.y - 10}
                            textAnchor="middle"
                            fill="#f8fafc"
                            fontSize="9.5"
                            fontWeight="700"
                          >
                            {Math.round(pt.totalTonnage)}kg
                          </text>
                          <text
                            x={pt.x}
                            y={122}
                            textAnchor="middle"
                            fill="#94a3b8"
                            fontSize="9"
                          >
                            {pt.date.slice(5)}
                          </text>
                        </g>
                      ))}
                    </>
                  );
                })()}
              </svg>
            </>
          )}
        </div>
      </section>

      <section className="pr-section">
        <div className="section-heading">
          <Award size={18} />
          <h2>Records &amp; Progression (touche un exo)</h2>
        </div>
        <div className="pr-grid">
          {personalRecords.slice(0, 10).map((pr) => (
            <button
              key={pr.exercise}
              type="button"
              className="pr-card clickable-pr-card"
              onClick={() => setSelectedExerciseName(pr.exercise)}
            >
              <div className="pr-ex-name">{pr.exercise.split('(')[0].trim()}</div>
              <div className="pr-weight">
                {pr.maxWeight} <span>kg</span>
              </div>
              <div className="pr-meta">
                × {pr.reps} reps · {pr.date.slice(5)} 📈
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="sessions-history-section">
        <div className="section-heading">
          <TrendingUp size={18} />
          <h2>Journal des Séances ({pastSessions.length})</h2>
        </div>

        <div className="session-history-list">
          {pastSessions.map((sess) => {
            const sessKey = `${sess.date}_${sess.sessionName}`;
            const isConfirmingDelete = confirmDeleteKey === sessKey;

            return (
              <article key={sessKey} className="history-session-card">
                <div className="history-session-header">
                  <div>
                    <span className="history-date">
                      <Calendar size={13} /> {sess.date}
                    </span>
                    <h3>{sess.sessionName}</h3>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <div className="history-tonnage-badge">
                      <Flame size={14} />
                      <span>{sess.totalTonnage.toLocaleString('fr-FR')} kg</span>
                    </div>
                    <button
                      type="button"
                      className="history-action-btn"
                      title="Modifier cette séance"
                      onClick={() => onEditSession(sess.date, sess.sessionName, sess.allRows)}
                    >
                      <Edit3 size={15} />
                    </button>
                    <button
                      type="button"
                      className="history-action-btn danger"
                      title="Supprimer cette séance"
                      onClick={() =>
                        setConfirmDeleteKey(isConfirmingDelete ? null : sessKey)
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {isConfirmingDelete && (
                  <div className="delete-confirm-strip">
                    <span>Supprimer cette séance du Sheet ?</span>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        type="button"
                        className="confirm-del-btn"
                        onClick={() => {
                          setConfirmDeleteKey(null);
                          onDeleteSession(sess.date, sess.sessionName, sess.allRows);
                        }}
                      >
                        Oui, supprimer
                      </button>
                      <button
                        type="button"
                        className="cancel-del-btn"
                        onClick={() => setConfirmDeleteKey(null)}
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                )}

              {sess.validatedPaliers.length > 0 && (
                <div className="history-paliers-strip">
                  <Trophy size={14} />
                  <span>
                    Paliers validés : <strong>{sess.validatedPaliers.join(', ')}</strong>
                  </span>
                </div>
              )}

              <div className="history-ex-rows">
                {Array.from(sess.exercises.entries()).map(([exName, rows]) => {
                  const shortExName = exName.split('(')[0].trim();
                  return (
                    <div
                      key={exName}
                      className="history-ex-line"
                      onClick={() => setSelectedExerciseName(exName)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') setSelectedExerciseName(exName);
                      }}
                    >
                      <span className="history-ex-title">{shortExName}</span>
                      <div className="history-ex-badges">
                        {rows.map((r, idx) => (
                          <span key={idx} className="history-set-chip">
                            {r.weightKg && r.weightKg > 0
                              ? `${r.weightKg}×${r.reps || 0}`
                              : r.notes
                              ? r.notes.slice(0, 22)
                              : 'Fait'}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
            );
          })}
        </div>
      </section>

      {/* Exercise Progression Chart Modal */}
      {selectedExerciseName && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="chart-modal-title"
          onClick={() => setSelectedExerciseName(null)}
        >
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <LineChart size={20} color="#10b981" />
                <h2 id="chart-modal-title" style={{ fontSize: '1.05rem' }}>
                  {selectedExerciseName.split('(')[0].trim()}
                </h2>
              </div>
              <button
                type="button"
                className="icon-ghost-btn"
                onClick={() => setSelectedExerciseName(null)}
                aria-label="Fermer"
              >
                <X size={20} />
              </button>
            </div>

            {exerciseProgression.length === 0 ? (
              <p className="gas-help-text">Pas encore de données de charge pour cet exercice.</p>
            ) : (
              <>
                <div
                  style={{
                    display: 'flex',
                    gap: '0.35rem',
                    marginBottom: '0.65rem',
                  }}
                >
                  <button
                    type="button"
                    className={`superset-mini-tab ${chartMode === 'avgWeight' ? 'active' : ''}`}
                    style={{ flex: 1 }}
                    onClick={() => setChartMode('avgWeight')}
                  >
                    Charge Moy.
                  </button>
                  <button
                    type="button"
                    className={`superset-mini-tab ${chartMode === 'tonnage' ? 'active' : ''}`}
                    style={{ flex: 1 }}
                    onClick={() => setChartMode('tonnage')}
                  >
                    Tonnage
                  </button>
                  <button
                    type="button"
                    className={`superset-mini-tab ${chartMode === 'maxWeight' ? 'active' : ''}`}
                    style={{ flex: 1 }}
                    onClick={() => setChartMode('maxWeight')}
                  >
                    Charge Max
                  </button>
                </div>

                <div className="chart-container">
                  <div className="chart-caption">
                    {chartMode === 'avgWeight'
                      ? 'Évolution de la Charge Moyenne des séries (kg)'
                      : chartMode === 'tonnage'
                      ? 'Évolution du Tonnage Total sur cet exercice (kg)'
                      : 'Évolution de la Charge Max (kg)'}
                  </div>
                  <svg viewBox="0 0 320 140" className="progression-svg">
                    {(() => {
                      const values = exerciseProgression.map((p) =>
                        chartMode === 'avgWeight'
                          ? p.avgWeight
                          : chartMode === 'tonnage'
                          ? p.sessionTonnage
                          : p.maxWeight
                      );
                      const minV = Math.min(...values) * 0.9;
                      const maxV = Math.max(...values) * 1.05 || 10;
                      const range = Math.max(2, maxV - minV);

                      const points = exerciseProgression.map((p, idx) => {
                        const val =
                          chartMode === 'avgWeight'
                            ? p.avgWeight
                            : chartMode === 'tonnage'
                            ? p.sessionTonnage
                            : p.maxWeight;
                        const x =
                          exerciseProgression.length === 1
                            ? 160
                            : 34 + (idx / (exerciseProgression.length - 1)) * 252;
                        const y = 105 - ((val - minV) / range) * 75;
                        return { x, y, val, ...p };
                      });

                      const polylinePoints = points.map((pt) => `${pt.x},${pt.y}`).join(' ');

                      return (
                        <>
                          <line x1="24" y1="108" x2="296" y2="108" stroke="rgba(255,255,255,0.1)" />
                          {points.length > 1 && (
                            <polyline
                              fill="none"
                              stroke="#10b981"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              points={polylinePoints}
                            />
                          )}
                          {points.map((pt) => (
                            <g key={pt.date}>
                              <circle
                                cx={pt.x}
                                cy={pt.y}
                                r="5"
                                fill="#10b981"
                                stroke="#090d16"
                                strokeWidth="2"
                              />
                              <text
                                x={pt.x}
                                y={pt.y - 10}
                                textAnchor="middle"
                                fill="#f8fafc"
                                fontSize="10"
                                fontWeight="700"
                              >
                                {pt.val}kg
                              </text>
                              <text
                                x={pt.x}
                                y={125}
                                textAnchor="middle"
                                fill="#94a3b8"
                                fontSize="9"
                              >
                                {pt.date.slice(5)}
                              </text>
                            </g>
                          ))}
                        </>
                      );
                    })()}
                  </svg>
                </div>

                <div className="history-ex-rows" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {exerciseProgression
                    .slice()
                    .reverse()
                    .map((p) => (
                      <div key={p.date} className="history-ex-line">
                        <span className="history-ex-title">
                          {p.date} <small style={{ color: '#10b981' }}>(moy. {p.avgWeight}kg)</small>
                        </span>
                        <div className="history-ex-badges">
                          <span className="history-set-chip">{p.setsText}</span>
                          <span
                            className="history-set-chip"
                            style={{ color: '#fbbf24', fontWeight: 700 }}
                          >
                            {p.sessionTonnage} kg
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
