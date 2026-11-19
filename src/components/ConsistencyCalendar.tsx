import React, { useMemo, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Flame } from 'lucide-react';

interface PastSessionSummary {
  date: string;
  sessionName: string;
  totalTonnage: number;
  totalSets: number;
}

interface ConsistencyCalendarProps {
  pastSessions: PastSessionSummary[];
}

function getIsoWeekKey(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  const dayNum = (d.getDay() + 6) % 7; // Mon=0 .. Sun=6
  d.setDate(d.getDate() - dayNum + 3); // nearest Thursday
  const firstThursday = new Date(d.getFullYear(), 0, 4);
  const firstDayNum = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNum + 3);
  const weekNo = 1 + Math.round((d.getTime() - firstThursday.getTime()) / 604800000);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const MONTH_NAMES_FR = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

export const ConsistencyCalendar: React.FC<ConsistencyCalendarProps> = ({ pastSessions }) => {
  const now = new Date();
  const [viewYear, setViewYear] = useState<number>(now.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(now.getMonth());
  const [selectedDayIso, setSelectedDayIso] = useState<string | null>(null);

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, PastSessionSummary[]>();
    for (const s of pastSessions) {
      if (!map.has(s.date)) map.set(s.date, []);
      map.get(s.date)!.push(s);
    }
    return map;
  }, [pastSessions]);

  const weeklyStreak = useMemo(() => {
    if (pastSessions.length === 0) return 0;
    const activeWeeks = new Set(pastSessions.map((s) => getIsoWeekKey(s.date)));
    const cursor = new Date();
    let streak = 0;

    // Allow current week to still be in progress without breaking last week's streak
    const thisWeekKey = getIsoWeekKey(toIsoDate(cursor));
    if (!activeWeeks.has(thisWeekKey)) {
      cursor.setDate(cursor.getDate() - 7);
    }

    for (let i = 0; i < 104; i++) {
      const key = getIsoWeekKey(toIsoDate(cursor));
      if (activeWeeks.has(key)) {
        streak++;
        cursor.setDate(cursor.getDate() - 7);
      } else {
        break;
      }
    }
    return streak;
  }, [pastSessions]);

  const monthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;
  const sessionsThisViewMonth = useMemo(
    () => pastSessions.filter((s) => s.date.startsWith(monthPrefix)).length,
    [pastSessions, monthPrefix]
  );

  const calendarCells = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const startOffset = (firstDay.getDay() + 6) % 7; // Monday = 0
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: (null | { day: number; iso: string })[] = [];

    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(
        2,
        '0'
      )}`;
      cells.push({ day, iso });
    }
    return cells;
  }, [viewYear, viewMonth]);

  const todayIso = toIsoDate(now);
  const selectedDaySessions = selectedDayIso ? sessionsByDate.get(selectedDayIso) || [] : [];

  const shiftMonth = (delta: number) => {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
    setSelectedDayIso(null);
  };

  return (
    <section className="pr-section" style={{ marginBottom: '1.25rem' }}>
      <div className="section-heading">
        <CalendarIcon size={18} />
        <h2>Assiduité &amp; Régularité</h2>
      </div>

      <div className="consistency-card">
        <div className="consistency-kpis">
          <div className="consistency-kpi streak">
            <span className="kpi-label">
              <Flame size={13} /> Série en cours
            </span>
            <strong>
              {weeklyStreak} sem.
            </strong>
          </div>
          <div className="consistency-kpi">
            <span className="kpi-label">Ce mois-ci</span>
            <strong>{sessionsThisViewMonth} séances</strong>
          </div>
          <div className="consistency-kpi">
            <span className="kpi-label">Total cumulé</span>
            <strong>{pastSessions.length}</strong>
          </div>
        </div>

        <div className="calendar-nav-row">
          <button
            type="button"
            className="icon-mini-btn"
            onClick={() => shiftMonth(-1)}
            aria-label="Mois précédent"
          >
            <ChevronLeft size={16} />
          </button>
          <strong>
            {MONTH_NAMES_FR[viewMonth]} {viewYear}
          </strong>
          <button
            type="button"
            className="icon-mini-btn"
            onClick={() => shiftMonth(1)}
            aria-label="Mois suivant"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="calendar-weekdays">
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>

        <div className="calendar-grid">
          {calendarCells.map((cell, idx) => {
            if (!cell) return <div key={`empty_${idx}`} className="calendar-cell empty" />;
            const daySessions = sessionsByDate.get(cell.iso);
            const hasWorkout = Boolean(daySessions && daySessions.length > 0);
            const isToday = cell.iso === todayIso;
            const isSelected = cell.iso === selectedDayIso;

            return (
              <button
                key={cell.iso}
                type="button"
                className={`calendar-cell ${hasWorkout ? 'workout' : ''} ${
                  isToday ? 'today' : ''
                } ${isSelected ? 'selected' : ''}`}
                onClick={() => setSelectedDayIso(hasWorkout ? cell.iso : null)}
                aria-label={`${cell.iso}${hasWorkout ? ' — Séance validée' : ''}`}
              >
                <span>{cell.day}</span>
                {hasWorkout && <span className="calendar-dot" aria-hidden="true" />}
              </button>
            );
          })}
        </div>

        {selectedDayIso && selectedDaySessions.length > 0 && (
          <div className="calendar-day-detail">
            {selectedDaySessions.map((s, idx) => (
              <div key={idx} className="calendar-detail-row">
                <strong>
                  {selectedDayIso} · {s.sessionName}
                </strong>
                <span>
                  {s.totalSets} séries · {Math.round(s.totalTonnage).toLocaleString('fr-FR')} kg
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
