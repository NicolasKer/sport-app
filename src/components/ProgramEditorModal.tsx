import React, { useEffect, useId, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import { parseRestSeconds } from '../services/sheetsApi';
import { ProgramExercise, ProgramTemplate } from '../types/workout';

interface ProgramEditorModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialTemplate: ProgramTemplate | null;
  existingTemplateCount: number;
  isSaving: boolean;
  onClose: () => void;
  onSaveTemplate: (updated: ProgramTemplate, previousId?: string) => void;
  onDeleteTemplate?: (templateId: string) => void;
}

interface EditableExerciseDraft {
  uid: string;
  codePrefix: string;
  name: string;
  setsCount: number;
  targetReps: string;
  rir: string;
  restLabel: string;
  supersetGroup: string;
  isCardio: boolean;
  instructions: string;
}

const POPULAR_EXERCISES = [
  'Développé Couché Haltères',
  'Développé Incliné Machine',
  'Presse à Cuisses',
  'Soulevé de Terre Roumain',
  'Tirage Vertical Poitrine',
  'Tirage Horizontal Poulie Basse',
  'Élévations Latérales',
  'Curl Incliné Haltères',
  'Extensions Triceps Poulie Corde',
  'Leg Curl Assis',
  'Leg Extension',
  'Fentes Bulgares',
];

function createEmptyExercise(index: number): EditableExerciseDraft {
  return {
    uid: `ex_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    codePrefix: String(index + 1),
    name: '',
    setsCount: 3,
    targetReps: '8-12',
    rir: '1-2',
    restLabel: "1'30",
    supersetGroup: '',
    isCardio: false,
    instructions: '',
  };
}

export const ProgramEditorModal: React.FC<ProgramEditorModalProps> = ({
  isOpen,
  mode,
  initialTemplate,
  existingTemplateCount,
  isSaving,
  onClose,
  onSaveTemplate,
  onDeleteTemplate,
}) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();
  const [sessionName, setSessionName] = useState<string>('');
  const [dayBadge, setDayBadge] = useState<string>('');
  const [exercises, setExercises] = useState<EditableExerciseDraft[]>([createEmptyExercise(0)]);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      setErrorMsg('');
      setConfirmDelete(false);
      if (mode === 'edit' && initialTemplate) {
        setSessionName(initialTemplate.id);
        setDayBadge(
          initialTemplate.dayBadge && initialTemplate.dayBadge !== initialTemplate.id
            ? initialTemplate.dayBadge
            : ''
        );
        setExercises(
          initialTemplate.exercises.map((ex, idx) => ({
            uid: `ex_${idx}_${ex.name.slice(0, 8)}`,
            codePrefix: ex.codePrefix || String(idx + 1),
            name: ex.name,
            setsCount: ex.setsCount || 3,
            targetReps: ex.targetReps || '8-12',
            rir: ex.rir || '1-2',
            restLabel: ex.restLabel || "1'30",
            supersetGroup: ex.supersetGroup || '',
            isCardio: ex.isCardio,
            instructions: ex.instructions || '',
          }))
        );
      } else {
        setSessionName('');
        setDayBadge('');
        setExercises([createEmptyExercise(0)]);
      }

      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [isOpen, mode, initialTemplate]);

  // Fallback click-outside dismissal for browsers lacking <dialog closedby="any"> (e.g. Safari)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || 'closedBy' in HTMLDialogElement.prototype) return;

    let pressedOutside = false;
    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      );
    };

    const onDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e) && dialog.open) {
        dialog.close();
      }
      pressedOutside = false;
    };

    dialog.addEventListener('pointerdown', onDown);
    dialog.addEventListener('pointerup', onUp);
    return () => {
      dialog.removeEventListener('pointerdown', onDown);
      dialog.removeEventListener('pointerup', onUp);
    };
  }, []);

  const handleCloseEvent = () => {
    const dialog = dialogRef.current;
    if (dialog) dialog.returnValue = '';
    onClose();
  };

  const updateExercise = (uid: string, patch: Partial<EditableExerciseDraft>) => {
    setExercises((prev) => prev.map((ex) => (ex.uid === uid ? { ...ex, ...patch } : ex)));
  };

  const moveExercise = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= exercises.length) return;
    setExercises((prev) => {
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(target, 0, item);
      return next.map((ex, i) => ({
        ...ex,
        codePrefix: ex.supersetGroup ? ex.codePrefix : String(i + 1),
      }));
    });
  };

  const removeExercise = (uid: string) => {
    setExercises((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((ex) => ex.uid !== uid);
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = sessionName.trim();
    if (!cleanName) {
      setErrorMsg('Donne un nom à ta séance (ex : Push, Pull, Samedi Bras...).');
      return;
    }

    const validExercises = exercises.filter((ex) => ex.name.trim().length > 0);
    if (validExercises.length === 0) {
      setErrorMsg('Ajoute au moins un exercice avec un nom valide.');
      return;
    }

    const cleanBadge = dayBadge.trim();
    const fullTitle = cleanBadge ? `${cleanBadge} - ${cleanName}` : cleanName;
    const lowerName = cleanName.toLowerCase();
    const icon: ProgramTemplate['icon'] =
      lowerName.includes('lower') || lowerName.includes('jambe') || lowerName.includes('leg')
        ? 'lower'
        : lowerName.includes('full') || lowerName.includes('corps')
        ? 'full'
        : 'upper';

    const mapped: ProgramExercise[] = validExercises.map((ex, idx) => {
      const code = (ex.codePrefix || String(idx + 1)).trim();
      const supMatch = code.match(/^(\d+)[A-Z]$/i);
      const restLabel = ex.restLabel.trim() || (ex.isCardio ? '-' : "1'30");
      return {
        rawSessionTitle: fullTitle,
        shortSessionName: cleanName,
        codePrefix: code,
        supersetGroup: ex.supersetGroup.trim() || (supMatch ? supMatch[1] : null),
        name: ex.name.trim(),
        setsCount: ex.isCardio ? 1 : Math.max(1, Math.min(12, ex.setsCount || 3)),
        targetReps: ex.targetReps.trim() || (ex.isCardio ? '20-25 min' : '8-12'),
        rir: ex.rir.trim() || (ex.isCardio ? '-' : '1-2'),
        restSeconds: parseRestSeconds(restLabel),
        restLabel,
        instructions: ex.instructions.trim(),
        isCardio:
          ex.isCardio ||
          ex.name.toLowerCase().includes('cardio') ||
          ex.targetReps.toLowerCase().includes('min'),
      };
    });

    onSaveTemplate(
      {
        id: cleanName,
        fullTitle,
        dayBadge: cleanBadge || cleanName,
        icon,
        exercises: mapped,
      },
      mode === 'edit' && initialTemplate ? initialTemplate.id : undefined
    );
  };

  return (
    <dialog
      ref={dialogRef}
      className="native-dialog program-editor-dialog"
      aria-labelledby={titleId}
      onClose={handleCloseEvent}
      {...({ closedby: 'any' } as Record<string, string>)}
    >
      <div className="native-dialog-card">
        <div className="modal-header">
          <h2 id={titleId}>
            {mode === 'create' ? '✨ Nouvelle séance' : `✏️ Modifier : ${initialTemplate?.id}`}
          </h2>
          <button
            type="button"
            className="icon-ghost-btn"
            onClick={() => dialogRef.current?.close()}
            aria-label="Fermer"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="program-editor-form">
          <div className="editor-top-grid">
            <div className="field-group">
              <label htmlFor="prog-session-name">Nom de la séance *</label>
              <input
                id="prog-session-name"
                name="sessionName"
                type="text"
                autoFocus
                required
                placeholder="Ex : Push, Dos & Biceps..."
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
              />
            </div>
            <div className="field-group">
              <label htmlFor="prog-day-badge">Créneau / Badge (optionnel)</label>
              <input
                id="prog-day-badge"
                name="dayBadge"
                type="text"
                placeholder="Ex : Samedi matin"
                value={dayBadge}
                onChange={(e) => setDayBadge(e.target.value)}
              />
            </div>
          </div>

          <div className="editor-ex-header-row">
            <span>Exercices de la séance ({exercises.length})</span>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => setExercises((prev) => [...prev, createEmptyExercise(prev.length)])}
            >
              <Plus size={14} /> Ajouter un exercice
            </button>
          </div>

          <datalist id="popular-exercises-datalist">
            {POPULAR_EXERCISES.map((exName) => (
              <option key={exName} value={exName} />
            ))}
          </datalist>

          <div className="editor-ex-list">
            {exercises.map((ex, idx) => (
              <div key={ex.uid} className="editor-ex-item">
                <div className="editor-ex-item-top">
                  <div className="editor-ex-code-name">
                    <input
                      type="text"
                      className="editor-code-input"
                      aria-label={`Ordre de l'exercice ${idx + 1}`}
                      value={ex.codePrefix}
                      onChange={(e) => updateExercise(ex.uid, { codePrefix: e.target.value })}
                      title="Ex: 1, 2, 5A, 5B pour un Superset"
                    />
                    <input
                      type="text"
                      list="popular-exercises-datalist"
                      aria-label={`Nom de l'exercice ${idx + 1}`}
                      placeholder="Nom de l'exercice ou machine..."
                      value={ex.name}
                      onChange={(e) => updateExercise(ex.uid, { name: e.target.value })}
                    />
                  </div>
                  <div className="editor-ex-reorder-btns">
                    <button
                      type="button"
                      className="icon-mini-btn"
                      onClick={() => moveExercise(idx, -1)}
                      disabled={idx === 0}
                      aria-label="Monter"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-mini-btn"
                      onClick={() => moveExercise(idx, 1)}
                      disabled={idx === exercises.length - 1}
                      aria-label="Descendre"
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-mini-btn danger"
                      onClick={() => removeExercise(ex.uid)}
                      disabled={exercises.length <= 1}
                      aria-label="Supprimer l'exercice"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="editor-ex-params-grid">
                  <div className="field-group">
                    <label htmlFor={`ed-sets-${ex.uid}`}>Séries</label>
                    <input
                      id={`ed-sets-${ex.uid}`}
                      type="number"
                      min={1}
                      max={12}
                      disabled={ex.isCardio}
                      value={ex.isCardio ? 1 : ex.setsCount}
                      onChange={(e) =>
                        updateExercise(ex.uid, { setsCount: parseInt(e.target.value, 10) || 1 })
                      }
                    />
                  </div>
                  <div className="field-group">
                    <label htmlFor={`ed-reps-${ex.uid}`}>Cible Reps</label>
                    <input
                      id={`ed-reps-${ex.uid}`}
                      type="text"
                      placeholder="8-12"
                      value={ex.targetReps}
                      onChange={(e) => updateExercise(ex.uid, { targetReps: e.target.value })}
                    />
                  </div>
                  <div className="field-group">
                    <label htmlFor={`ed-rest-${ex.uid}`}>Repos</label>
                    <input
                      id={`ed-rest-${ex.uid}`}
                      type="text"
                      placeholder="1'30"
                      value={ex.restLabel}
                      onChange={(e) => updateExercise(ex.uid, { restLabel: e.target.value })}
                    />
                  </div>
                  <div className="field-group">
                    <label htmlFor={`ed-rir-${ex.uid}`}>RIR</label>
                    <input
                      id={`ed-rir-${ex.uid}`}
                      type="text"
                      placeholder="1-2"
                      value={ex.rir}
                      onChange={(e) => updateExercise(ex.uid, { rir: e.target.value })}
                    />
                  </div>
                </div>

                <div className="editor-ex-bottom-row">
                  <input
                    type="text"
                    placeholder="Consignes / notes (optionnel)..."
                    aria-label="Consignes"
                    value={ex.instructions}
                    onChange={(e) => updateExercise(ex.uid, { instructions: e.target.value })}
                  />
                  <label className="cardio-toggle-pill">
                    <input
                      type="checkbox"
                      checked={ex.isCardio}
                      onChange={(e) =>
                        updateExercise(ex.uid, {
                          isCardio: e.target.checked,
                          targetReps: e.target.checked ? '20-25 min' : '8-12',
                          restLabel: e.target.checked ? '-' : "1'30",
                          rir: e.target.checked ? '-' : '1-2',
                        })
                      }
                    />
                    <span>Cardio</span>
                  </label>
                </div>
              </div>
            ))}
          </div>

          {errorMsg && (
            <div className="editor-error-banner" role="alert">
              {errorMsg}
            </div>
          )}

          {mode === 'edit' &&
            initialTemplate &&
            onDeleteTemplate &&
            existingTemplateCount > 1 && (
              <div className="editor-delete-zone">
                {confirmDelete ? (
                  <div className="delete-confirm-strip" style={{ marginBottom: 0 }}>
                    <span>Supprimer définitivement « {initialTemplate.id} » ?</span>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        type="button"
                        className="confirm-del-btn"
                        onClick={() => onDeleteTemplate(initialTemplate.id)}
                      >
                        Oui, supprimer
                      </button>
                      <button
                        type="button"
                        className="cancel-del-btn"
                        onClick={() => setConfirmDelete(false)}
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="secondary-btn"
                    style={{
                      width: '100%',
                      justifyContent: 'center',
                      color: '#fda4af',
                      borderColor: 'rgba(244, 63, 94, 0.35)',
                    }}
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 size={14} /> Supprimer cette séance du programme
                  </button>
                )}
              </div>
            )}

          <div className="editor-footer-actions">
            <button
              type="button"
              className="secondary-nav-btn"
              onClick={() => dialogRef.current?.close()}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="primary-nav-btn"
              disabled={isSaving}
            >
              {isSaving ? 'Enregistrement...' : 'Enregistrer la séance'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
};
