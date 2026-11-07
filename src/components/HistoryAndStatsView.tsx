import React, { useMemo } from 'react';
import { Award, Calendar, Flame, TrendingUp, Trophy } from 'lucide-react';
import { JournalRow } from '../types/workout';

interface HistoryAndStatsViewProps {
  journalRows: JournalRow[];
}

export const HistoryAndStatsView: React.FC<HistoryAndStatsViewProps> = ({ journalRows }) => {
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

  return (
    <div className="history-view">
      <section className="pr-section">
        <div className="section-heading">
          <Award size={18} />
          <h2>Records & Charges Max (Sheet)</h2>
        </div>
        <div className="pr-grid">
          {personalRecords.slice(0, 8).map((pr) => (
            <div key={pr.exercise} className="pr-card">
              <div className="pr-ex-name">{pr.exercise}</div>
              <div className="pr-weight">
                {pr.maxWeight} <span>kg</span>
              </div>
              <div className="pr-meta">
                × {pr.reps} reps · {pr.date.slice(5)}
              </div>
            </div>
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
                    <div key={exName} className="history-ex-line">
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
    </div>
  );
};
