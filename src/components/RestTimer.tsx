import React, { useEffect, useState } from 'react';
import { Bell, FastForward, Minus, Plus, Timer, Volume2, VolumeX } from 'lucide-react';
import { playRestFinishedChime, unlockAudioContext } from '../utils/audioAlert';

interface RestTimerProps {
  endTimeMs: number | null;
  totalDurationSec: number;
  nextHint?: string;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onAdjustSeconds: (deltaSec: number) => void;
  onDismiss: () => void;
}

export const RestTimer: React.FC<RestTimerProps> = ({
  endTimeMs,
  totalDurationSec,
  nextHint,
  soundEnabled,
  onToggleSound,
  onAdjustSeconds,
  onDismiss,
}) => {
  const [remainingSec, setRemainingSec] = useState<number>(0);
  const [hasAlerted, setHasAlerted] = useState<boolean>(false);

  useEffect(() => {
    if (!endTimeMs) {
      setRemainingSec(0);
      setHasAlerted(false);
      return;
    }

    const update = () => {
      const diff = Math.ceil((endTimeMs - Date.now()) / 1000);
      if (diff <= 0) {
        setRemainingSec(0);
        if (!hasAlerted) {
          setHasAlerted(true);
          if (soundEnabled) {
            playRestFinishedChime();
          }
        }
      } else {
        setRemainingSec(diff);
      }
    };

    update();
    const id = window.setInterval(update, 250);
    return () => window.clearInterval(id);
  }, [endTimeMs, hasAlerted, soundEnabled]);

  if (!endTimeMs) return null;

  const mins = Math.floor(remainingSec / 60);
  const secs = remainingSec % 60;
  const formatted = `${mins}:${secs.toString().padStart(2, '0')}`;
  const pct =
    totalDurationSec > 0
      ? Math.min(100, Math.max(0, ((totalDurationSec - remainingSec) / totalDurationSec) * 100))
      : 100;
  const isFinished = remainingSec <= 0;

  return (
    <div
      className={`rest-timer-bar ${isFinished ? 'rest-timer-done' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="rest-timer-progress" style={{ width: `${pct}%` }} />
      <div className="rest-timer-content">
        <div className="rest-timer-left">
          <div className="rest-timer-icon-badge">
            {isFinished ? <Bell size={20} /> : <Timer size={20} />}
          </div>
          <div>
            <div className="rest-timer-time">
              {isFinished ? "C'EST REPARTI !" : formatted}
            </div>
            {nextHint && <div className="rest-timer-hint">{nextHint}</div>}
          </div>
        </div>

        <div className="rest-timer-actions">
          <button
            type="button"
            className="timer-chip-btn"
            aria-pressed={soundEnabled}
            aria-label={soundEnabled ? 'Couper le bip sonore' : 'Activer le bip sonore'}
            onClick={() => {
              unlockAudioContext();
              onToggleSound();
            }}
            title={soundEnabled ? 'Bip audio & vibration activés' : 'Mode silencieux'}
          >
            {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>

          {!isFinished && (
            <>
              <button
                type="button"
                className="timer-chip-btn"
                onClick={() => onAdjustSeconds(-15)}
                aria-label="Retirer 15 secondes"
              >
                <Minus size={14} /> 15s
              </button>
              <button
                type="button"
                className="timer-chip-btn"
                onClick={() => onAdjustSeconds(15)}
                aria-label="Ajouter 15 secondes"
              >
                <Plus size={14} /> 15s
              </button>
            </>
          )}
          <button type="button" className="timer-skip-btn" onClick={onDismiss}>
            <FastForward size={16} />
            {isFinished ? 'OK' : 'Passer'}
          </button>
        </div>
      </div>
    </div>
  );
};
