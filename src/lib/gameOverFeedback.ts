/**
 * Triggers vibration + sound when someone loses.
 * Works on both native (Capacitor) and web.
 */
import { playGameOverSound } from "./audioManager";

const VIBRATION_PATTERN = [200, 100, 200, 100, 300]; // strong triple buzz

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
  void playGameOverSound("game-over-feedback");
}
