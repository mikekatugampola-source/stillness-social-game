/**
 * Triggers vibration + sound when someone loses.
 * Works on both native (Capacitor) and web.
 */

const VIBRATION_PATTERN = [200, 100, 200, 100, 300]; // strong triple buzz

let audioCtx: AudioContext | null = null;

function playLossSound() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioCtx;

    // Two-tone alert: short descending beep
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, now);
    gain1.gain.setValueAtTime(0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    osc1.connect(gain1).connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.15);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(440, now + 0.18);
    gain2.gain.setValueAtTime(0.3, now + 0.18);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
    osc2.connect(gain2).connect(ctx.destination);
    osc2.start(now + 0.18);
    osc2.stop(now + 0.45);
  } catch {
    // Audio not available, skip silently
  }
}

function triggerVibration() {
  try {
    if (navigator.vibrate) {
      navigator.vibrate(VIBRATION_PATTERN);
    }
  } catch {
    // Vibration not available
  }
}

export function triggerGameOverFeedback() {
  triggerVibration();
  playLossSound();
}
