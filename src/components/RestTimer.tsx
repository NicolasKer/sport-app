import React, { useEffect, useState } from 'react';
import { Bell, FastForward, Minus, Plus, Timer } from 'lucide-react';

interface RestTimerProps {
  endTimeMs: number | null;
  totalDurationSec: number;
  nextHint?: string;
  onAdjustSeconds: (deltaSec: number) => void;
  onDismiss: () => void;
}

function playBeepSequence() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const notes = [587.33, 783.99, 1046.5]; // D5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.14);
      gain.gain.setValueAtTime(0.22, ctx.currentTime + idx * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.14 + 0.13);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + idx * 0.14);
      osc.stop(ctx.currentTime + idx * 0.14 + 0.13);
    });
  } catch {
    // Ignore audio context restriction
  }
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate([200, 100, 250]);
    }
  } catch {
    // Ignore
  }
}

export const RestTimer: React.FC<RestTimerProps> = ({
  endTimeMs,
  totalDurationSec,
  nextHint,
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
          playBeepSequence();
        }
      } else {
        setRemainingSec(diff);
      }
    };

    update();
    const id = window.setInterval(update, 250);
    return () => window.clearInterval(id);
  }, [endTimeMs, hasAlerted]);

  if (!endTimeMs) return null;

  const mins = Math.floor(remainingSec / 60);
  const secs = remainingSec % 60;
  const formatted = `${mins}:${secs.toString().padStart(2, '0')}`;
  const pct = totalDurationSec > 0
    ? Math.min(100, Math.max(0, ((totalDurationSec - remainingSec) / totalDurationSec) * 100))
    : 100;
  const isFinished = remainingSec <= 0;

  return (
    <div className={`rest-timer-bar ${isFinished ? 'rest-timer-done' : ''}`} role="status" aria-live="polite">
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
          <button
            type="button"
            className="timer-skip-btn"
            onClick={onDismiss}
          >
            <FastForward size={16} />
            {isFinished ? 'OK' : 'Passer'}
          </button>
        </div>
      </div>
    </div>
  );
};
