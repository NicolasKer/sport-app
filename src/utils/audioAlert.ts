// Shared Web Audio API helper that unlocks AudioContext on direct user gestures
// so end-of-rest chimes work reliably on iOS Safari and Android Chrome Bluetooth headphones.

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioCtx();
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

export function unlockAudioContext(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    // Play a near-silent 1ms buffer to unlock audio playback on mobile browsers
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  } catch {
    // Ignore audio context restrictions
  }
}

export function playRestFinishedChime(): void {
  const ctx = getAudioContext();
  if (ctx) {
    try {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const notes = [587.33, 783.99, 1046.5]; // D5 -> G5 -> C6 pleasant gym chime
      const now = ctx.currentTime;
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.14);
        gain.gain.setValueAtTime(0.001, now + idx * 0.14);
        gain.gain.linearRampToValueAtTime(0.32, now + idx * 0.14 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.14 + 0.16);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.14);
        osc.stop(now + idx * 0.14 + 0.17);
      });
    } catch {
      // Ignore audio errors
    }
  }

  try {
    if ('vibrate' in navigator) {
      navigator.vibrate([220, 100, 220, 100, 320]);
    }
  } catch {
    // Ignore vibration unavailability
  }
}
