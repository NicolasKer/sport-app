import React, { useMemo, useState } from 'react';
import { Award, Calendar, Flame, LineChart, TrendingUp, Trophy, X } from 'lucide-react';
import { JournalRow } from '../types/workout';
import { normalizeExerciseKey } from '../services/sheetsApi';

interface HistoryAndStatsViewProps {
  journalRows: JournalRow[];
}

export const HistoryAndStatsView: React.FC<HistoryAndStatsViewProps> = ({ journalRows }) => {
  const [selectedExerciseName, setSelectedExerciseName] = useState<string | null>(null);

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
        });
      }
      const g = groups.get(key)!;
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
      { exercise: string; maxWeight: number; reps: number; date: string; levelValidated: boolean }
    >();

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
      { date: string; maxWeight: number; bestReps: number; sessionTonnage: number; setsText: string }
    >();

    for (const r of journalRows) {
      if (!r.weightKg || r.weightKg <= 0) continue;
      if (normalizeExerciseKey(r.exercise) !== targetKey) continue;

      if (!byDate.has(r.date)) {
        byDate.set(r.date, {
          date: r.date,
          maxWeight: r.weightKg,
          bestReps: r.reps || 0,
          sessionTonnage: 0,
          setsText: '',
        });
      }
      const entry = byDate.get(r.date)!;
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

  return (
    <div className="history-view">
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
          {pastSessions.map((sess) => (
            <article key={`${sess.date}_${sess.sessionName}`} className="history-session-card">
              <div className="history-session-header">
                <div>
                  <span className="history-date">
                    <Calendar size={13} /> {sess.date}
                  </span>
                  <h3>{sess.sessionName}</h3>
                </div>
                <div className="history-tonnage-badge">
                  <Flame size={14} />
                  <span>{sess.totalTonnage.toLocaleString('fr-FR')} kg</span>
                </div>
              </div>

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
          ))}
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
                <div className="chart-container">
                  <div className="chart-caption">Évolution de la Charge Max (kg)</div>
                  <svg viewBox="0 0 320 140" className="progression-svg">
                    {(() => {
                      const weights = exerciseProgression.map((p) => p.maxWeight);
                      const minW = Math.min(...weights) * 0.9;
                      const maxW = Math.max(...weights) * 1.05 || 10;
                      const range = Math.max(5, maxW - minW);

                      const points = exerciseProgression.map((p, idx) => {
                        const x =
                          exerciseProgression.length === 1
                            ? 160
                            : 34 + (idx / (exerciseProgression.length - 1)) * 252;
                        const y = 105 - ((p.maxWeight - minW) / range) * 75;
                        return { x, y, ...p };
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
                                {pt.maxWeight}kg
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
                        <span className="history-ex-title">{p.date}</span>
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
