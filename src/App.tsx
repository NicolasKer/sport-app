import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Calendar,
  CheckCircle2,
  Cloud,
  Dumbbell,
  Flame,
  Play,
  RefreshCw,
  Settings,
  Sparkles,
  Zap,
} from 'lucide-react';
import {
  buildBatchOperationsForSession,
  buildDeleteSessionOperations,
  buildWorkoutSession,
  clearOfflineQueue,
  fetchSheetData,
  getOfflineQueue,
  loadActiveSessionDraft,
  ParsedSheetData,
  saveActiveSessionDraft,
  syncBatchOperations,
} from './services/sheetsApi';
import { ActiveWorkoutSession, JournalRow } from './types/workout';
import { WorkoutSessionView } from './components/WorkoutSessionView';
import { HistoryAndStatsView } from './components/HistoryAndStatsView';
import { SettingsModal } from './components/SettingsModal';
import { WorkoutSummaryData, WorkoutSummaryModal } from './components/WorkoutSummaryModal';
import { normalizeExerciseKey } from './services/sheetsApi';

function getTodayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export const App: React.FC = () => {
  const [sheetData, setSheetData] = useState<ParsedSheetData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'home' | 'history'>('home');
  const [activeSession, setActiveSession] = useState<ActiveWorkoutSession | null>(() =>
    loadActiveSessionDraft()
  );
  const [selectedDate, setSelectedDate] = useState<string>(getTodayIso());
  const [syncStatusText, setSyncStatusText] = useState<string>('Connecté');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [workoutSummary, setWorkoutSummary] = useState<WorkoutSummaryData | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchSheetData();
      setSheetData(data);
      setSyncStatusText(
        data.source === 'gsheets-plugin'
          ? 'Sheet Live'
          : data.source === 'apps-script'
          ? 'Cloud Live'
          : 'Hors-ligne'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleStartPreCreated = (pre: {
    date: string;
    sessionName: string;
    rows: JournalRow[];
  }) => {
    if (!sheetData) return;
    const session = buildWorkoutSession(sheetData, pre.sessionName, pre.date, pre.rows);
    setActiveSession(session);
    saveActiveSessionDraft(session);
  };

  const handleStartTemplate = (sessionId: string) => {
    if (!sheetData) return;
    // Check if there is already a pre-created session for this date + sessionId
    const matchingPre = sheetData.preCreatedSessions.find(
      (p) => p.date === selectedDate && p.sessionName === sessionId
    );
    const session = buildWorkoutSession(
      sheetData,
      sessionId,
      selectedDate,
      matchingPre?.rows
    );
    setActiveSession(session);
    saveActiveSessionDraft(session);
  };

  const getLastSheetRowNumber = () => {
    if (!sheetData || sheetData.journalRows.length === 0) return 125;
    return Math.max(...sheetData.journalRows.map((r) => r.sheetRowNumber || 125));
  };

  const handleUpdateActiveSession = async (
    updated: ActiveWorkoutSession,
    triggerSync = false
  ) => {
    setActiveSession(updated);
    saveActiveSessionDraft(updated);

    // Only auto-sync mid-workout for existing pre-created rows ('write' with sheetRowNumber), NEVER 'append'.
    // New rows without sheetRowNumber are appended once when clicking 'Terminer & Synchroniser la séance'!
    if (triggerSync && updated.isPreCreatedInSheet) {
      const ops = buildBatchOperationsForSession(updated, getLastSheetRowNumber(), false);
      if (ops.length > 0) {
        setIsSyncing(true);
        const res = await syncBatchOperations(ops);
        setIsSyncing(false);
        if (res.ok) {
          setSyncStatusText('Synchronisé ✓');
        } else {
          setSyncStatusText('Sauvé localement');
        }
      }
    } else {
      setSyncStatusText('Prêt (envoi fin de séance)');
    }
  };

  const handleFinishWorkout = async () => {
    if (!activeSession) return;
    const anyExplicitlyCompleted = activeSession.exercises.some((ex) =>
      ex.sets.some((s) => s.completed)
    );
    if (!anyExplicitlyCompleted) {
      showToast('Valide au moins une série (bouton ✓ Valider) avant de terminer la séance !');
      return;
    }

    setIsSyncing(true);
    const sessionToSync: ActiveWorkoutSession = activeSession;
    const ops = buildBatchOperationsForSession(sessionToSync, getLastSheetRowNumber());
    const res = await syncBatchOperations(ops);
    setIsSyncing(false);

    // Compute workout summary stats before closing activeSession
    const durationMinutes = Math.max(
      1,
      Math.round((Date.now() - (activeSession.startedAt || Date.now())) / 60000)
    );
    let totalSets = 0;
    let totalTonnage = 0;
    const validatedPaliers: string[] = [];
    const newRecords: { exercise: string; weightKg: number; reps: number }[] = [];

    for (const ex of sessionToSync.exercises) {
      if (ex.levelValidated) validatedPaliers.push(ex.exerciseName);
      let exBestWeight = 0;
      let exBestReps = 0;
      for (const s of ex.sets) {
        if (!s.completed) continue;
        totalSets++;
        if (!ex.isCardio) {
          totalTonnage += (s.weightKg || 0) * (s.reps || 0);
          if ((s.weightKg || 0) > exBestWeight) {
            exBestWeight = s.weightKg || 0;
            exBestReps = s.reps || 0;
          }
        }
      }

      if (!ex.isCardio && exBestWeight > 0 && sheetData) {
        const normKey = normalizeExerciseKey(ex.exerciseName);
        const prevMax = sheetData.journalRows
          .filter(
            (r) =>
              r.date !== activeSession.date &&
              normalizeExerciseKey(r.exercise) === normKey &&
              (r.weightKg || 0) > 0
          )
          .reduce((max, r) => Math.max(max, r.weightKg || 0), 0);

        if (prevMax > 0 && exBestWeight > prevMax) {
          newRecords.push({
            exercise: ex.exerciseName,
            weightKg: exBestWeight,
            reps: exBestReps,
          });
        }
      }
    }

    // Previous session of same type tonnage
    let previousSessionTonnage: number | null = null;
    if (sheetData) {
      const sameTypeRows = sheetData.journalRows.filter(
        (r) =>
          r.sessionName === activeSession.sessionName &&
          r.date !== activeSession.date &&
          ((r.weightKg || 0) > 0 || (r.reps || 0) > 0)
      );
      const prevDates = Array.from(new Set(sameTypeRows.map((r) => r.date))).sort();
      if (prevDates.length > 0) {
        const latestPrevDate = prevDates[prevDates.length - 1];
        previousSessionTonnage = sameTypeRows
          .filter((r) => r.date === latestPrevDate)
          .reduce((sum, r) => sum + (r.weightKg || 0) * (r.reps || 0), 0);
      }
    }

    saveActiveSessionDraft(null);
    setActiveSession(null);

    setWorkoutSummary({
      sessionName: activeSession.sessionName,
      date: activeSession.date,
      durationMinutes,
      totalSets,
      totalTonnage: Math.round(totalTonnage * 10) / 10,
      previousSessionTonnage:
        previousSessionTonnage !== null ? Math.round(previousSessionTonnage * 10) / 10 : null,
      validatedPaliers,
      newRecords,
      syncedOk: res.ok,
    });

    await loadData();
  };

  const handleEditHistorySession = (date: string, sessionName: string, rows: JournalRow[]) => {
    if (!sheetData) return;
    const session = buildWorkoutSession(sheetData, sessionName, date, rows);
    setActiveSession(session);
    saveActiveSessionDraft(session);
  };

  const handleDeleteHistorySession = async (
    date: string,
    sessionName: string,
    rows: JournalRow[]
  ) => {
    const ops = buildDeleteSessionOperations(rows);
    if (ops.length === 0) return;
    setIsSyncing(true);
    const res = await syncBatchOperations(ops);
    setIsSyncing(false);
    if (res.ok) {
      showToast(`Séance ${sessionName} (${date}) supprimée du Sheet !`);
      await loadData();
    } else {
      showToast('Suppression mise en file d’attente');
      await loadData();
    }
  };

  const handleFlushOfflineQueue = async () => {
    const q = getOfflineQueue();
    if (q.length === 0) return;
    setIsSyncing(true);
    const res = await syncBatchOperations(q);
    setIsSyncing(false);
    if (res.ok) {
      clearOfflineQueue();
      showToast('Toutes les modifications en attente ont été envoyées au Sheet !');
      await loadData();
    } else {
      showToast(res.error || 'Impossible de synchroniser pour le moment');
    }
  };

  // Compute rotation recommendation and recent 7-day sessions (must be above early return!)
  const rotationInfo = React.useMemo(() => {
    if (!sheetData) return { nextRecommendedId: 'Upper', lastSession: null, recentSessionsCount: 0 };
    const filledRows = sheetData.journalRows.filter(
      (r) => (r.weightKg && r.weightKg > 0) || (r.reps && r.reps > 0) || r.notes !== ''
    );
    const uniqueSessions: { date: string; sessionName: string }[] = [];
    const seen = new Set<string>();
    for (const r of filledRows) {
      const k = `${r.date}__${r.sessionName}`;
      if (!seen.has(k)) {
        seen.add(k);
        uniqueSessions.push({ date: r.date, sessionName: r.sessionName });
      }
    }
    uniqueSessions.sort((a, b) => a.date.localeCompare(b.date));
    const lastSession = uniqueSessions.length > 0 ? uniqueSessions[uniqueSessions.length - 1] : null;

    const cycle = ['Upper', 'Lower + Cardio', 'Full Body'];
    let nextRecommendedId = 'Upper';
    if (lastSession) {
      const idx = cycle.findIndex((c) => c.toLowerCase() === lastSession.sessionName.toLowerCase());
      if (idx >= 0) {
        nextRecommendedId = cycle[(idx + 1) % cycle.length];
      }
    }

    // Sessions in the last 7 days relative to latest date or today
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    const recentSessionsCount = uniqueSessions.filter((s) => s.date >= cutoffIso).length;

    return { nextRecommendedId, lastSession, recentSessionsCount };
  }, [sheetData]);

  if (activeSession) {
    return (
      <>
        <WorkoutSessionView
          session={activeSession}
          syncStatusText={syncStatusText}
          isSyncing={isSyncing}
          onUpdateSession={handleUpdateActiveSession}
          onFinishWorkout={handleFinishWorkout}
          onExitWithoutFinishing={() => {
            setActiveSession(null);
          }}
        />
        {toastMessage && <div className="toast-banner">{toastMessage}</div>}
      </>
    );
  }

  const offlineCount = getOfflineQueue().length;
  const savedDraft = loadActiveSessionDraft();

  return (
    <div className="app-shell">
      {/* Top App Bar */}
      <header className="app-topbar">
        <div className="brand-block">
          <div className="brand-logo">
            <Dumbbell size={20} />
          </div>
          <div>
            <div className="brand-name">IronPulse</div>
            <div className="brand-sub">Suivi &amp; Recomposition · Nicolas</div>
          </div>
        </div>

        <div className="topbar-actions">
          <button
            type="button"
            className={`conn-badge ${sheetData?.source === 'gsheets-plugin' ? 'live' : ''}`}
            onClick={() => setIsSettingsOpen(true)}
          >
            <Cloud size={14} />
            <span>
              {sheetData?.source === 'gsheets-plugin'
                ? 'Sheet Connecté'
                : sheetData?.source === 'apps-script'
                ? 'Apps Script'
                : 'Mode Local'}
            </span>
          </button>
          <button
            type="button"
            className="icon-ghost-btn"
            onClick={loadData}
            aria-label="Rafraîchir les données du Google Sheet"
          >
            <RefreshCw size={18} className={isLoading ? 'spin' : ''} />
          </button>
          <button
            type="button"
            className="icon-ghost-btn"
            onClick={() => setIsSettingsOpen(true)}
            aria-label="Paramètres de synchronisation"
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      <main className="app-content">
        {offlineCount > 0 && (
          <section className="resume-banner" style={{ marginBottom: '1rem' }}>
            <div>
              <span className="resume-tag">Enregistré sur ce téléphone</span>
              <h3>{offlineCount} série(s) prête(s) à envoyer au Sheet</h3>
              <p>Tes séries sont bien gardées dans l'Historique de l'appli !</p>
            </div>
            <div className="resume-actions">
              <button
                type="button"
                className="primary-play-btn"
                onClick={handleFlushOfflineQueue}
                disabled={isSyncing}
              >
                <Cloud size={15} /> {isSyncing ? 'Envoi...' : 'Synchro Sheet'}
              </button>
              <button
                type="button"
                className="discard-draft-btn"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(JSON.stringify(getOfflineQueue()));
                    showToast('Données copiées ! Tu peux les coller dans le chat Antigravity.');
                  } catch {
                    // Ignore
                  }
                }}
              >
                Copier données
              </button>
            </div>
          </section>
        )}

        {activeTab === 'home' ? (
          <div className="home-view">
            {/* Resume unfinished draft if present */}
            {savedDraft && (
              <section className="resume-banner">
                <div>
                  <span className="resume-tag">Séance en cours</span>
                  <h3>
                    {savedDraft.sessionName} ({savedDraft.date})
                  </h3>
                  <p>
                    {
                      savedDraft.exercises.reduce(
                        (acc, ex) => acc + ex.sets.filter((s) => s.completed).length,
                        0
                      )
                    }{' '}
                    séries validées
                  </p>
                </div>
                <div className="resume-actions">
                  <button
                    type="button"
                    className="primary-play-btn"
                    onClick={() => setActiveSession(savedDraft)}
                  >
                    <Play size={16} /> Reprendre
                  </button>
                  <button
                    type="button"
                    className="discard-draft-btn"
                    onClick={() => {
                      saveActiveSessionDraft(null);
                      setSheetData((prev) => (prev ? { ...prev } : null));
                    }}
                  >
                    Fermer
                  </button>
                </div>
              </section>
            )}

            {/* Pre-created sessions detected directly in Google Sheet (e.g. rows 101-125) */}
            {sheetData && sheetData.preCreatedSessions.length > 0 && (
              <section className="precreated-section">
                <div className="section-heading">
                  <Sparkles size={18} className="accent-icon" />
                  <h2>Séance prête dans ton Google Sheet</h2>
                </div>
                {sheetData.preCreatedSessions.map((pre) => {
                  const uniqueExCount = new Set(pre.rows.map((r) => r.exercise)).size;
                  return (
                    <div key={`${pre.date}_${pre.sessionName}`} className="precreated-card">
                      <div className="precreated-top">
                        <div>
                          <span className="precreated-badge">
                            Prête à remplir · Lignes {pre.rows[0]?.sheetRowNumber}–
                            {pre.rows[pre.rows.length - 1]?.sheetRowNumber}
                          </span>
                          <h3>{pre.sessionName}</h3>
                          <p className="precreated-meta">
                            📅 {pre.date} · {uniqueExCount} exercices ({pre.rows.length} séries)
                          </p>
                        </div>
                        <button
                          type="button"
                          className="start-precreated-btn"
                          onClick={() => handleStartPreCreated(pre)}
                        >
                          <Play size={18} />
                          <span>Go !</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </section>
            )}

            {/* Date Picker + Start New Workout from Référence Programme */}
            <section className="templates-section">
              {rotationInfo.lastSession && (
                <div className="rotation-status-card">
                  <div className="rotation-status-top">
                    <div>
                      <span className="rotation-eyebrow">Rythme &amp; Rotation</span>
                      <div className="rotation-next-title">
                        ⭐ Prochaine séance : <strong>{rotationInfo.nextRecommendedId}</strong>
                      </div>
                      <div className="rotation-last-sub">
                        Dernière validée : {rotationInfo.lastSession.sessionName} (
                        {rotationInfo.lastSession.date})
                      </div>
                    </div>
                    <div className="weekly-ring-badge">
                      <strong>{Math.min(3, rotationInfo.recentSessionsCount)}/3</strong>
                      <span>7 derniers j.</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="templates-header-row">
                <div className="section-heading">
                  <Zap size={18} />
                  <h2>Ton Programme (3 séances)</h2>
                </div>
                <div className="date-picker-inline">
                  <label htmlFor="workout-date-picker">
                    <Calendar size={14} /> Date :
                  </label>
                  <input
                    id="workout-date-picker"
                    name="workoutDate"
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="templates-grid">
                {sheetData?.templates.map((tpl) => {
                  const supersetCount = new Set(
                    tpl.exercises.map((e) => e.supersetGroup).filter(Boolean)
                  ).size;
                  const totalSets = tpl.exercises.reduce((s, e) => s + e.setsCount, 0);
                  const isRecommended = tpl.id === rotationInfo.nextRecommendedId;

                  return (
                    <article
                      key={tpl.id}
                      className={`template-card ${isRecommended ? 'recommended-tpl-card' : ''}`}
                    >
                      <div className="template-card-top">
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                            <span className="day-pill">{tpl.dayBadge}</span>
                            {isRecommended && (
                              <span className="recommended-pill">⭐ Prochaine séance</span>
                            )}
                          </div>
                          <h3>{tpl.id}</h3>
                        </div>
                        <button
                          type="button"
                          className="launch-tpl-btn"
                          onClick={() => handleStartTemplate(tpl.id)}
                        >
                          <Play size={16} /> Démarrer
                        </button>
                      </div>

                      <div className="template-chips">
                        <span>{tpl.exercises.length} exercices</span>
                        <span>·</span>
                        <span>{totalSets} séries</span>
                        {supersetCount > 0 && (
                          <>
                            <span>·</span>
                            <span className="superset-tag">Superset inclus</span>
                          </>
                        )}
                      </div>

                      <ul className="template-ex-preview">
                        {tpl.exercises.map((ex) => (
                          <li key={`${ex.codePrefix}_${ex.name}`}>
                            <span className="tpl-ex-code">{ex.codePrefix}</span>
                            <span className="tpl-ex-name">{ex.name}</span>
                            <span className="tpl-ex-sets">
                              {ex.setsCount > 1
                                ? `${ex.setsCount}×${ex.targetReps}`
                                : ex.targetReps}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>
        ) : (
          sheetData && (
            <HistoryAndStatsView
              journalRows={sheetData.journalRows}
              onEditSession={handleEditHistorySession}
              onDeleteSession={handleDeleteHistorySession}
            />
          )
        )}
      </main>

      {/* Bottom Tab Navigation */}
      <nav className="bottom-tabbar" aria-label="Navigation principale">
        <button
          type="button"
          className={`tabbar-item ${activeTab === 'home' ? 'active' : ''}`}
          onClick={() => setActiveTab('home')}
        >
          <Flame size={20} />
          <span>Entraînement</span>
        </button>
        <button
          type="button"
          className={`tabbar-item ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <BarChart3 size={20} />
          <span>Historique &amp; PR</span>
        </button>
      </nav>

      <SettingsModal
        isOpen={isSettingsOpen}
        dataSource={sheetData?.source || 'local-cache'}
        offlineQueueCount={offlineCount}
        onClose={() => setIsSettingsOpen(false)}
        onRefreshSheet={loadData}
        onFlushOfflineQueue={handleFlushOfflineQueue}
      />

      <WorkoutSummaryModal
        summary={workoutSummary}
        onClose={() => setWorkoutSummary(null)}
      />

      {toastMessage && (
        <div className="toast-banner" role="status">
          <CheckCircle2 size={18} />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
