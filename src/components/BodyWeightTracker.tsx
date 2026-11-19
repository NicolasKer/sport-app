import React, { useMemo, useState } from 'react';
import { Plus, Scale, Trash2 } from 'lucide-react';
import { BodyWeightEntry } from '../types/workout';

interface BodyWeightTrackerProps {
  entries: BodyWeightEntry[];
  onAddEntry: (entry: BodyWeightEntry) => void;
  onDeleteEntry: (date: string) => void;
}

function getTodayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const BodyWeightTracker: React.FC<BodyWeightTrackerProps> = ({
  entries,
  onAddEntry,
  onDeleteEntry,
}) => {
  const [dateInput, setDateInput] = useState<string>(getTodayIso());
  const [weightInput, setWeightInput] = useState<string>(() => {
    const latest = entries[entries.length - 1];
    return latest ? String(latest.weightKg) : '';
  });

  const enrichedPoints = useMemo(() => {
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    return sorted.map((item) => {
      const targetMs = new Date(`${item.date}T12:00:00`).getTime();
      const windowItems = sorted.filter((other) => {
        const ms = new Date(`${other.date}T12:00:00`).getTime();
        const diffDays = (targetMs - ms) / 86400000;
        return diffDays >= 0 && diffDays <= 6;
      });
      const avg7 =
        windowItems.reduce((sum, w) => sum + w.weightKg, 0) / Math.max(1, windowItems.length);
      return {
        ...item,
        avg7: Math.round(avg7 * 10) / 10,
      };
    });
  }, [entries]);

  const latest = enrichedPoints[enrichedPoints.length - 1] || null;
  const previous7d =
    enrichedPoints.length >= 2 ? enrichedPoints[Math.max(0, enrichedPoints.length - 2)] : null;
  const deltaAvg =
    latest && previous7d ? Math.round((latest.avg7 - previous7d.avg7) * 10) / 10 : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(weightInput.replace(',', '.'));
    if (isNaN(num) || num <= 20 || num > 300 || !dateInput) return;
    onAddEntry({ date: dateInput, weightKg: Math.round(num * 10) / 10 });
  };

  return (
    <section className="pr-section" style={{ marginBottom: '1.25rem' }}>
      <div className="section-heading">
        <Scale size={18} />
        <h2>Poids de Corps &amp; Moyenne 7 jours</h2>
      </div>

      <div className="bodyweight-card">
        <div className="bw-kpis-row">
          <div className="bw-kpi">
            <span>Dernière pesée</span>
            <strong>{latest ? `${latest.weightKg} kg` : '—'}</strong>
          </div>
          <div className="bw-kpi highlight">
            <span>Moyenne 7 jours</span>
            <strong>{latest ? `${latest.avg7} kg` : '—'}</strong>
          </div>
          <div className="bw-kpi">
            <span>Tendance</span>
            <strong
              style={{
                color:
                  deltaAvg === null
                    ? 'var(--text-secondary)'
                    : deltaAvg < 0
                    ? '#34d399'
                    : deltaAvg > 0
                    ? '#fbbf24'
                    : 'var(--text-primary)',
              }}
            >
              {deltaAvg === null ? '—' : `${deltaAvg > 0 ? '+' : ''}${deltaAvg} kg`}
            </strong>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bw-form-row">
          <input
            type="date"
            aria-label="Date de pesée"
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
            style={{ maxWidth: '145px' }}
          />
          <input
            type="text"
            inputMode="decimal"
            aria-label="Poids en kg"
            placeholder="Ex : 78,4"
            value={weightInput}
            onChange={(e) => setWeightInput(e.target.value)}
          />
          <button type="submit" className="primary-btn-sm" style={{ minHeight: '48px', flexShrink: 0 }}>
            <Plus size={16} /> Pesée
          </button>
        </form>

        {enrichedPoints.length > 0 && (
          <>
            <div className="chart-container" style={{ marginTop: '0.75rem', marginBottom: '0.6rem' }}>
              <div className="chart-caption" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Courbe lissée (moyenne 7j)</span>
                <span style={{ color: '#38bdf8' }}>— Moy. 7j · ● Pesée</span>
              </div>
              <svg viewBox="0 0 320 120" className="progression-svg">
                {(() => {
                  const recent = enrichedPoints.slice(-14);
                  const allVals = recent.flatMap((p) => [p.weightKg, p.avg7]);
                  const minV = Math.min(...allVals) - 0.8;
                  const maxV = Math.max(...allVals) + 0.8;
                  const range = Math.max(1, maxV - minV);

                  const pts = recent.map((p, idx) => {
                    const x = recent.length === 1 ? 160 : 34 + (idx / (recent.length - 1)) * 252;
                    const yRaw = 92 - ((p.weightKg - minV) / range) * 65;
                    const yAvg = 92 - ((p.avg7 - minV) / range) * 65;
                    return { x, yRaw, yAvg, ...p };
                  });

                  const avgLine = pts.map((pt) => `${pt.x},${pt.yAvg}`).join(' ');
                  return (
                    <>
                      <line x1="24" y1="96" x2="296" y2="96" stroke="rgba(255,255,255,0.1)" />
                      {pts.length > 1 && (
                        <polyline
                          fill="none"
                          stroke="#38bdf8"
                          strokeWidth="2.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          points={avgLine}
                        />
                      )}
                      {pts.map((pt, i) => (
                        <g key={pt.date}>
                          <circle
                            cx={pt.x}
                            cy={pt.yRaw}
                            r="3.8"
                            fill="#10b981"
                            stroke="#090d16"
                            strokeWidth="1.5"
                          />
                          {(pts.length <= 6 || i === 0 || i === pts.length - 1) && (
                            <text
                              x={pt.x}
                              y={pt.yAvg - 8}
                              textAnchor="middle"
                              fill="#f8fafc"
                              fontSize="9"
                              fontWeight="700"
                            >
                              {pt.avg7}kg
                            </text>
                          )}
                          {(pts.length <= 6 || i === 0 || i === pts.length - 1) && (
                            <text
                              x={pt.x}
                              y={112}
                              textAnchor="middle"
                              fill="#94a3b8"
                              fontSize="8.5"
                            >
                              {pt.date.slice(5)}
                            </text>
                          )}
                        </g>
                      ))}
                    </>
                  );
                })()}
              </svg>
            </div>

            <div className="bw-history-chips">
              {enrichedPoints
                .slice(-5)
                .reverse()
                .map((p) => (
                  <div key={p.date} className="bw-entry-pill">
                    <span>
                      {p.date.slice(5)} : <strong>{p.weightKg} kg</strong>
                    </span>
                    <button
                      type="button"
                      className="bw-del-btn"
                      onClick={() => onDeleteEntry(p.date)}
                      aria-label={`Supprimer la pesée du ${p.date}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
};
