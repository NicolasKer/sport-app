import React, { useMemo, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CloudUpload,
  Dumbbell,
  Flame,
  History,
  Info,
  Repeat,
  Sparkles,
  Timer,
  Trophy,
} from 'lucide-react';
import {
  ActiveExerciseState,
  ActiveSetState,
  ActiveWorkoutSession,
  Feeling,
} from '../types/workout';
import { RestTimer } from './RestTimer';

interface WorkoutSessionViewProps {
  session: ActiveWorkoutSession;
  syncStatusText: string;
  isSyncing: boolean;
  onUpdateSession: (updated: ActiveWorkoutSession, triggerSync?: boolean) => void;
  onFinishWorkout: () => void;
  onExitWithoutFinishing: () => void;
}

const FEELING_OPTIONS: { value: Feeling; label: string; emoji: string; colorClass: string }[] = [
  { value: 'Facile', label: 'Facile', emoji: '🟢', colorClass: 'feel-easy' },
  { value: 'Modéré', label: 'Modéré', emoji: '🟡', colorClass: 'feel-med' },
  { value: 'Difficile', label: 'Difficile', emoji: '🔴', colorClass: 'feel-hard' },
];

export const WorkoutSessionView: React.FC<WorkoutSessionViewProps> = ({
  session,
  syncStatusText,
  isSyncing,
  onUpdateSession,
  onFinishWorkout,
  onExitWithoutFinishing,
}) => {
  const [activeExIdx, setActiveExIdx] = useState<number>(0);
  const [timerEndMs, setTimerEndMs] = useState<number | null>(null);
  const [timerTotalSec, setTimerTotalSec] = useState<number>(90);
  const [timerHint, setTimerHint] = useState<string>('');

  // Cardio helper fields
  const [cardioDuration, setCardioDuration] = useState<string>('25');
  const [cardioSpeed, setCardioSpeed] = useState<string>('5,3');
  const [cardioIncline, setCardioIncline] = useState<string>('10');

  const currentEx: ActiveExerciseState = session.exercises[activeExIdx] || session.exercises[0];

  const stats = useMemo(() => {
    let totalSets = 0;
    let completedSets = 0;
    let totalTonnage = 0;
    for (const ex of session.exercises) {
      for (const s of ex.sets) {
        totalSets++;
        if (s.completed) {
          completedSets++;
          if (!ex.isCardio) {
            totalTonnage += (s.weightKg || 0) * (s.reps || 0);
          }
        }
      }
    }
    const progressPct = totalSets > 0 ? Math.round((completedSets / totalSets) * 100) : 0;
    return { totalSets, completedSets, totalTonnage, progressPct };
  }, [session]);

  // Identify superset partners if current exercise has supersetGroup
  const supersetPartnerIndices = useMemo(() => {
    if (!currentEx?.supersetGroup) return [];
    return session.exercises
      .map((ex, idx) => ({ ex, idx }))
      .filter((item) => item.ex.supersetGroup === currentEx.supersetGroup)
      .map((item) => item.idx);
  }, [session.exercises, currentEx]);

  const startRestTimer = (seconds: number, hint: string) => {
    setTimerTotalSec(seconds);
    setTimerEndMs(Date.now() + seconds * 1000);
    setTimerHint(hint);
  };

  const adjustRestTimer = (deltaSec: number) => {
    if (!timerEndMs) return;
    setTimerEndMs(timerEndMs + deltaSec * 1000);
    setTimerTotalSec((prev) => Math.max(15, prev + deltaSec));
  };

  const updateSetWeightWithCascade = (exIndex: number, setIndex: number, newWeight: number) => {
    const cleanWeight = Math.max(0, Number(newWeight.toFixed(2)));
    const nextExercises = session.exercises.map((ex, i) => {
      if (i !== exIndex) return ex;
      const nextSets = ex.sets.map((s, si) => {
        if (si === setIndex) {
          return { ...s, weightKg: cleanWeight };
        }
        // Auto-propagate weight to subsequent unvalidated sets of the same exercise
        if (si > setIndex && !s.completed) {
          return { ...s, weightKg: cleanWeight };
        }
        return s;
      });
      return { ...ex, sets: nextSets };
    });
    onUpdateSession({ ...session, exercises: nextExercises }, false);
  };

  const updateSet = (
    exIndex: number,
    setIndex: number,
    updater: (prev: ActiveSetState) => ActiveSetState,
    syncNow = false
  ) => {
    const nextExercises = session.exercises.map((ex, i) => {
      if (i !== exIndex) return ex;
      const nextSets = ex.sets.map((s, si) => (si === setIndex ? updater(s) : s));
      return { ...ex, sets: nextSets };
    });
    onUpdateSession({ ...session, exercises: nextExercises }, syncNow);
  };

  const handleToggleCompleteSet = (exIndex: number, setIndex: number) => {
    const ex = session.exercises[exIndex];
    const targetSet = ex.sets[setIndex];
    const willComplete = !targetSet.completed;

    updateSet(
      exIndex,
      setIndex,
      (prev) => ({
        ...prev,
        feeling: prev.feeling || 'Modéré',
        completed: willComplete,
      }),
      session.isPreCreatedInSheet // Real-time per-set write if rows are pre-created; batch append on finish if new session
    );

    if (!willComplete) return;

    // Micro celebration if all sets of exercise are done
    const allOtherCompleted = ex.sets.every((s, idx) => (idx === setIndex ? true : s.completed));

    // Superset automatic rotation logic (e.g. 5A -> 5B -> 5A or 6A -> 6B -> 6C)
    if (ex.supersetGroup && supersetPartnerIndices.length > 1) {
      const posInGroup = supersetPartnerIndices.indexOf(exIndex);
      const nextPartnerIdx =
        supersetPartnerIndices[(posInGroup + 1) % supersetPartnerIndices.length];
      const nextPartnerEx = session.exercises[nextPartnerIdx];
      // Find if partner still has uncompleted set at same setIndex or any uncompleted set
      const partnerHasPending = nextPartnerEx.sets.some((s, si) =>
        si === setIndex ? !s.completed : !s.completed
      );

      if (partnerHasPending && nextPartnerIdx !== exIndex) {
        startRestTimer(
          ex.restSeconds || 45,
          `Enchaînement Superset → ${nextPartnerEx.codePrefix}. ${nextPartnerEx.exerciseName}`
        );
        window.setTimeout(() => {
          setActiveExIdx(nextPartnerIdx);
        }, 350);
        return;
      }
    }

    if (allOtherCompleted) {
      try {
        confetti({ particleCount: 40, spread: 60, origin: { y: 0.75 } });
      } catch {
        // Ignore
      }
      if (exIndex < session.exercises.length - 1) {
        const nextEx = session.exercises[exIndex + 1];
        startRestTimer(
          ex.restSeconds || 90,
          `Exercice terminé ! Prochain : ${nextEx.exerciseName}`
        );
      }
    } else {
      startRestTimer(
        ex.restSeconds || 90,
        `Repos avant Série ${setIndex + 2} (${ex.restLabel})`
      );
    }
  };

  const handleTogglePalier = () => {
    const willValidate = !currentEx.levelValidated;
    if (willValidate) {
      try {
        confetti({
          particleCount: 75,
          spread: 70,
          origin: { y: 0.7 },
          colors: ['#10b981', '#34d399', '#fbbf24'],
        });
      } catch {
        // Ignore
      }
    }
    const nextExercises = session.exercises.map((ex, i) =>
      i === activeExIdx ? { ...ex, levelValidated: willValidate } : ex
    );
    onUpdateSession({ ...session, exercises: nextExercises }, true);
  };

  const handleExerciseNotesChange = (notes: string, syncNow = false) => {
    const nextExercises = session.exercises.map((ex, i) => {
      if (i !== activeExIdx) return ex;
      const nextSets = ex.sets.map((s, si) => (si === 0 ? { ...s, notes } : s));
      return { ...ex, exerciseNotes: notes, sets: nextSets };
    });
    onUpdateSession({ ...session, exercises: nextExercises }, syncNow);
  };

  const applyCardioPreset = () => {
    const isCourse = currentEx.exerciseName.toLowerCase().includes('course');
    const summary = isCourse
      ? `${cardioDuration} min course rythmée à ${cardioSpeed} km/h`
      : `Effectué ${cardioDuration} min à ${cardioSpeed} km/h à ${cardioIncline}% pente`;

    const nextExercises = session.exercises.map((ex, i) => {
      if (i !== activeExIdx) return ex;
      const nextSets = ex.sets.map((s, si) =>
        si === 0
          ? {
              ...s,
              notes: summary,
              feeling: s.feeling || 'Modéré',
              completed: true,
            }
          : s
      );
      return { ...ex, exerciseNotes: summary, sets: nextSets };
    });
    onUpdateSession({ ...session, exercises: nextExercises }, true);
    try {
      confetti({ particleCount: 60, spread: 65, origin: { y: 0.7 } });
    } catch {
      // Ignore
    }
  };

  return (
    <div className="workout-screen">
      {/* Top sticky header */}
      <header className="workout-header">
        <div className="workout-header-top">
          <button
            type="button"
            className="icon-ghost-btn"
            onClick={onExitWithoutFinishing}
            aria-label="Retour à l'accueil"
          >
            <ArrowLeft size={20} />
          </button>

          <div className="workout-title-block">
            <div className="workout-session-pill">
              <span>{session.date}</span>
              {session.isPreCreatedInSheet && (
                <span className="sheet-linked-tag">Lignes Sheet liées</span>
              )}
            </div>
            <h1>{session.sessionName}</h1>
          </div>

          <button
            type="button"
            className="sync-pill-btn"
            onClick={() => onUpdateSession(session, true)}
            disabled={isSyncing}
            title="Synchroniser maintenant avec Google Sheets"
          >
            <CloudUpload size={16} className={isSyncing ? 'spin' : ''} />
            <span>{isSyncing ? 'Synchro...' : syncStatusText}</span>
          </button>
        </div>

        {/* Progress & Live Tonnage bar */}
        <div className="workout-metrics-strip">
          <div className="metric-box">
            <span className="metric-label">Progression</span>
            <span className="metric-val">
              {stats.completedSets}/{stats.totalSets} séries ({stats.progressPct}%)
            </span>
          </div>
          <div className="metric-box highlight">
            <Flame size={15} />
            <span className="metric-label">Tonnage</span>
            <span className="metric-val">{stats.totalTonnage.toLocaleString('fr-FR')} kg</span>
          </div>
        </div>
        <div className="workout-progress-track">
          <div className="workout-progress-fill" style={{ width: `${stats.progressPct}%` }} />
        </div>

        {/* Horizontal Exercise Pills */}
        <nav className="exercise-rail" aria-label="Exercices de la séance">
          {session.exercises.map((ex, idx) => {
            const doneCount = ex.sets.filter((s) => s.completed).length;
            const isAllDone = doneCount === ex.sets.length;
            const isActive = idx === activeExIdx;
            const isSuperset = Boolean(ex.supersetGroup);

            return (
              <button
                key={`${ex.exerciseName}_${idx}`}
                type="button"
                className={`ex-rail-pill ${isActive ? 'active' : ''} ${
                  isAllDone ? 'done' : ''
                } ${isSuperset ? 'superset' : ''}`}
                onClick={() => setActiveExIdx(idx)}
              >
                <span className="ex-rail-code">{ex.codePrefix}</span>
                <span className="ex-rail-name">
                  {ex.exerciseName.split('(')[0].trim().slice(0, 18)}
                </span>
                <span className="ex-rail-count">
                  {isAllDone ? <Check size={13} /> : `${doneCount}/${ex.sets.length}`}
                </span>
              </button>
            );
          })}
        </nav>
      </header>

      {/* Main Exercise Card */}
      <main className="workout-main">
        {currentEx.supersetGroup && supersetPartnerIndices.length > 1 && (
          <div className="superset-banner">
            <div className="superset-banner-left">
              <Repeat size={16} />
              <span>
                <strong>SUPERSET {currentEx.supersetGroup}</strong> — Alternance automatique
              </span>
            </div>
            <div className="superset-switch-btns">
              {supersetPartnerIndices.map((pIdx) => {
                const partner = session.exercises[pIdx];
                return (
                  <button
                    key={pIdx}
                    type="button"
                    className={`superset-mini-tab ${pIdx === activeExIdx ? 'active' : ''}`}
                    onClick={() => setActiveExIdx(pIdx)}
                  >
                    {partner.codePrefix}. {partner.exerciseName.split(' ')[0]}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <section className="exercise-hero-card">
          <div className="exercise-hero-top">
            <div>
              <span className="exercise-step-badge">
                Exercice {activeExIdx + 1} sur {session.exercises.length}
              </span>
              <h2>{currentEx.exerciseName}</h2>
            </div>
            <button
              type="button"
              className="manual-timer-trigger"
              onClick={() =>
                startRestTimer(
                  currentEx.restSeconds || 90,
                  `Repos manuel (${currentEx.restLabel})`
                )
              }
            >
              <Timer size={16} />
              <span>{currentEx.restLabel}</span>
            </button>
          </div>

          <div className="exercise-targets-row">
            <div className="target-chip">
              <span className="target-chip-label">Objectif</span>
              <strong>
                {currentEx.sets.length} × {currentEx.targetReps}
              </strong>
            </div>
            <div className="target-chip">
              <span className="target-chip-label">RIR Cible</span>
              <strong>{currentEx.rir || '-'}</strong>
            </div>
            <div className="target-chip">
              <span className="target-chip-label">Repos</span>
              <strong>{currentEx.restLabel}</strong>
            </div>
          </div>

          {currentEx.instructions && (
            <div className="exercise-instructions">
              <Info size={15} />
              <span>{currentEx.instructions}</span>
            </div>
          )}

          {/* Previous session memory & progressive overload hint */}
          {currentEx.lastSessionSummary && (
            <div className="last-perf-banner">
              <div className="last-perf-header">
                <span className="last-perf-title">
                  <History size={14} /> Dernière séance ({currentEx.lastSessionSummary.date})
                </span>
                {currentEx.lastSessionSummary.levelWasValidated && (
                  <span className="overload-badge">
                    <Sparkles size={13} /> Palier validé : +2.5 kg suggéré !
                  </span>
                )}
              </div>
              <div className="last-perf-sets">{currentEx.lastSessionSummary.setsText}</div>
              {currentEx.lastSessionSummary.lastNotes && (
                <div className="last-perf-note">
                  💡 Note précédente : « {currentEx.lastSessionSummary.lastNotes} »
                </div>
              )}
            </div>
          )}
        </section>

        {/* Cardio Dedicated Finisher UI OR Strength Sets List */}
        {currentEx.isCardio ? (
          <section className="cardio-card">
            <h3>🏃 Finisher Cardio Tapis</h3>
            <p className="cardio-sub">
              Cible du programme : <strong>{currentEx.targetReps}</strong>{' '}
              {currentEx.instructions ? `(${currentEx.instructions})` : ''}
            </p>

            <div className="cardio-grid">
              <div className="field-group">
                <label htmlFor="cardio-duration">Durée (min)</label>
                <input
                  id="cardio-duration"
                  name="cardioDuration"
                  type="text"
                  inputMode="decimal"
                  value={cardioDuration}
                  onChange={(e) => setCardioDuration(e.target.value)}
                />
              </div>
              <div className="field-group">
                <label htmlFor="cardio-speed">Vitesse (km/h)</label>
                <input
                  id="cardio-speed"
                  name="cardioSpeed"
                  type="text"
                  inputMode="decimal"
                  value={cardioSpeed}
                  onChange={(e) => setCardioSpeed(e.target.value)}
                />
              </div>
              <div className="field-group">
                <label htmlFor="cardio-incline">Pente (%)</label>
                <input
                  id="cardio-incline"
                  name="cardioIncline"
                  type="text"
                  inputMode="decimal"
                  value={cardioIncline}
                  onChange={(e) => setCardioIncline(e.target.value)}
                />
              </div>
            </div>

            <fieldset className="feeling-fieldset">
              <legend>Ressenti Cardio</legend>
              <div className="feeling-radios">
                {FEELING_OPTIONS.map((opt) => {
                  const currentFeel = currentEx.sets[0]?.feeling || 'Modéré';
                  const radioId = `cardio-feel-${opt.value}`;
                  return (
                    <label
                      key={opt.value}
                      htmlFor={radioId}
                      className={`feeling-pill ${opt.colorClass} ${
                        currentFeel === opt.value ? 'selected' : ''
                      }`}
                    >
                      <input
                        type="radio"
                        id={radioId}
                        name="cardio-feeling"
                        className="visually-hidden"
                        checked={currentFeel === opt.value}
                        onChange={() =>
                          updateSet(activeExIdx, 0, (s) => ({ ...s, feeling: opt.value }), true)
                        }
                      />
                      <span>{opt.emoji}</span>
                      <span>{opt.label}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="field-group" style={{ marginTop: '0.75rem' }}>
              <label htmlFor="cardio-custom-note">
                Remarque enregistrée dans le Google Sheet (Col M)
              </label>
              <input
                id="cardio-custom-note"
                name="cardioCustomNote"
                type="text"
                value={currentEx.exerciseNotes}
                placeholder="Ex: Effectué 25 min à 5,3 km/h à 10%"
                onChange={(e) => handleExerciseNotesChange(e.target.value)}
                onBlur={(e) => handleExerciseNotesChange(e.target.value, true)}
              />
            </div>

            <button
              type="button"
              className={`primary-validate-btn ${currentEx.sets[0]?.completed ? 'done' : ''}`}
              onClick={applyCardioPreset}
            >
              <CheckCircle2 size={20} />
              <span>
                {currentEx.sets[0]?.completed
                  ? 'Cardio validé dans la séance ! (Mettre à jour)'
                  : 'Valider le Finisher Cardio'}
              </span>
            </button>
          </section>
        ) : (
          <section className="sets-list">
            {currentEx.sets.map((s, setIdx) => {
              const setTonnage = Math.round((s.weightKg || 0) * (s.reps || 0) * 10) / 10;
              const weightInputId = `weight-${activeExIdx}-${setIdx}`;
              const repsInputId = `reps-${activeExIdx}-${setIdx}`;
              const feelGroupName = `feeling-${activeExIdx}-${setIdx}`;

              return (
                <div
                  key={s.setNumber}
                  className={`set-card ${s.completed ? 'set-card-completed' : ''}`}
                >
                  <div className="set-card-header">
                    <div className="set-badge-wrap">
                      <span className="set-number-badge">Série {s.setNumber}</span>
                      <span className="set-target-mini">
                        Cible : {s.targetReps} reps · RIR {s.rir}
                      </span>
                    </div>
                    <span className="set-tonnage-pill">{setTonnage} kg</span>
                  </div>

                  <div className="set-controls-grid">
                    {/* Weight Control */}
                    <div className="stepper-box">
                      <label htmlFor={weightInputId}>Charge (kg)</label>
                      <div className="stepper-row">
                        <button
                          type="button"
                          className="step-btn"
                          onClick={() =>
                            updateSetWeightWithCascade(activeExIdx, setIdx, s.weightKg - 2.5)
                          }
                          aria-label="Moins 2,5 kg"
                        >
                          -2.5
                        </button>
                        <input
                          id={weightInputId}
                          name={weightInputId}
                          type="text"
                          inputMode="decimal"
                          className="stepper-input"
                          value={s.weightKg}
                          onChange={(e) => {
                            const val = e.target.value.replace(',', '.');
                            const num = parseFloat(val);
                            updateSetWeightWithCascade(
                              activeExIdx,
                              setIdx,
                              isNaN(num) ? 0 : num
                            );
                          }}
                        />
                        <button
                          type="button"
                          className="step-btn"
                          onClick={() =>
                            updateSetWeightWithCascade(activeExIdx, setIdx, s.weightKg + 2.5)
                          }
                          aria-label="Plus 2,5 kg"
                        >
                          +2.5
                        </button>
                      </div>
                    </div>

                    {/* Reps Control */}
                    <div className="stepper-box">
                      <label htmlFor={repsInputId}>Répétitions</label>
                      <div className="stepper-row">
                        <button
                          type="button"
                          className="step-btn"
                          onClick={() =>
                            updateSet(activeExIdx, setIdx, (prev) => ({
                              ...prev,
                              reps: Math.max(0, prev.reps - 1),
                            }))
                          }
                          aria-label="Moins 1 répétition"
                        >
                          -1
                        </button>
                        <input
                          id={repsInputId}
                          name={repsInputId}
                          type="text"
                          inputMode="numeric"
                          className="stepper-input"
                          value={s.reps}
                          onChange={(e) => {
                            const num = parseInt(e.target.value, 10);
                            updateSet(activeExIdx, setIdx, (prev) => ({
                              ...prev,
                              reps: isNaN(num) ? 0 : num,
                            }));
                          }}
                        />
                        <button
                          type="button"
                          className="step-btn"
                          onClick={() =>
                            updateSet(activeExIdx, setIdx, (prev) => ({
                              ...prev,
                              reps: prev.reps + 1,
                            }))
                          }
                          aria-label="Plus 1 répétition"
                        >
                          +1
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Feeling selector + Validate Set button */}
                  <div className="set-bottom-row">
                    <fieldset className="feeling-fieldset compact">
                      <legend className="visually-hidden">Ressenti Série {s.setNumber}</legend>
                      <div className="feeling-radios">
                        {FEELING_OPTIONS.map((opt) => {
                          const radioId = `${feelGroupName}-${opt.value}`;
                          return (
                            <label
                              key={opt.value}
                              htmlFor={radioId}
                              className={`feeling-pill ${opt.colorClass} ${
                                s.feeling === opt.value ? 'selected' : ''
                              }`}
                            >
                              <input
                                type="radio"
                                id={radioId}
                                name={feelGroupName}
                                className="visually-hidden"
                                checked={s.feeling === opt.value}
                                onChange={() =>
                                  updateSet(
                                    activeExIdx,
                                    setIdx,
                                    (prev) => ({ ...prev, feeling: opt.value }),
                                    s.completed
                                  )
                                }
                              />
                              <span>{opt.emoji}</span>
                              <span>{opt.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>

                    <button
                      type="button"
                      className={`validate-set-btn ${s.completed ? 'completed' : ''}`}
                      onClick={() => handleToggleCompleteSet(activeExIdx, setIdx)}
                    >
                      <Check size={18} />
                      <span>{s.completed ? 'Validée' : 'Valider'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* Palier Validation & Notes Footer Card */}
        {!currentEx.isCardio && (
          <section className="exercise-footer-card">
            <div className="palier-row">
              <div>
                <div className="palier-title">
                  <Trophy size={16} /> Validation Palier (Colonne L)
                </div>
                <div className="palier-desc">
                  Active si toutes les séries cibles sont validées pour augmenter la charge à la prochaine séance
                </div>
              </div>
              <button
                type="button"
                className={`palier-toggle-btn ${currentEx.levelValidated ? 'active' : ''}`}
                onClick={handleTogglePalier}
                aria-pressed={currentEx.levelValidated}
              >
                {currentEx.levelValidated ? '🏆 Oui !' : 'Non'}
              </button>
            </div>

            <div className="field-group" style={{ marginTop: '0.85rem' }}>
              <label htmlFor={`ex-notes-${activeExIdx}`}>
                Remarques sur l'exercice (ex: 2 haltères de 15 kg, réglage siège...)
              </label>
              <input
                id={`ex-notes-${activeExIdx}`}
                name={`exNotes_${activeExIdx}`}
                type="text"
                placeholder="Ajouter une remarque (Colonne M du Sheet)..."
                value={currentEx.exerciseNotes}
                onChange={(e) => handleExerciseNotesChange(e.target.value, false)}
                onBlur={(e) => handleExerciseNotesChange(e.target.value, true)}
              />
            </div>
          </section>
        )}

        {/* Prev / Next Exercise Navigation */}
        <div className="exercise-nav-footer">
          <button
            type="button"
            className="secondary-nav-btn"
            disabled={activeExIdx === 0}
            onClick={() => setActiveExIdx((i) => Math.max(0, i - 1))}
          >
            <ChevronLeft size={18} /> Précédent
          </button>

          {activeExIdx < session.exercises.length - 1 && (
            <button
              type="button"
              className="primary-nav-btn"
              onClick={() => setActiveExIdx((i) => Math.min(session.exercises.length - 1, i + 1))}
            >
              Exercice suivant <ChevronRight size={18} />
            </button>
          )}
        </div>

        <button
          type="button"
          className="finish-workout-btn"
          style={{ width: '100%', marginTop: '0.25rem' }}
          onClick={() => {
            try {
              confetti({ particleCount: 120, spread: 90, origin: { y: 0.6 } });
            } catch {
              // Ignore
            }
            onFinishWorkout();
          }}
        >
          <Dumbbell size={18} /> Terminer &amp; Synchroniser la séance ({stats.completedSets} séries)
        </button>
      </main>

      {/* Floating Auto Rest Timer */}
      <RestTimer
        endTimeMs={timerEndMs}
        totalDurationSec={timerTotalSec}
        nextHint={timerHint}
        onAdjustSeconds={adjustRestTimer}
        onDismiss={() => setTimerEndMs(null)}
      />
    </div>
  );
};
