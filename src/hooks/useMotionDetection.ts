import { useEffect, useRef, useCallback, useState } from "react";

interface MotionState {
  isMonitoring: boolean;
  hasPermission: boolean | null;
}

export function useMotionDetection(
  active: boolean,
  onMotionDetected: () => void,
  calibrationMs = 1500,
  threshold = 3.5
) {
  const [state, setState] = useState<MotionState>({
    isMonitoring: false,
    hasPermission: null,
  });

  const baselineRef = useRef<{ alpha: number; beta: number; gamma: number } | null>(null);
  const calibratingRef = useRef(true);
  const samplesRef = useRef<{ alpha: number; beta: number; gamma: number }[]>([]);
  const firedRef = useRef(false);

  const requestPermission = useCallback(async () => {
    if (
      typeof DeviceOrientationEvent !== "undefined" &&
      "requestPermission" in DeviceOrientationEvent
    ) {
      try {
        const result = await (DeviceOrientationEvent as any).requestPermission();
        setState((s) => ({ ...s, hasPermission: result === "granted" }));
        return result === "granted";
      } catch {
        setState((s) => ({ ...s, hasPermission: false }));
        return false;
      }
    }
    setState((s) => ({ ...s, hasPermission: true }));
    return true;
  }, []);

  useEffect(() => {
    if (!active) {
      setState((s) => ({ ...s, isMonitoring: false }));
      baselineRef.current = null;
      calibratingRef.current = true;
      samplesRef.current = [];
      firedRef.current = false;
      return;
    }

    firedRef.current = false;
    calibratingRef.current = true;
    samplesRef.current = [];
    baselineRef.current = null;

    const calibrationTimer = setTimeout(() => {
      const samples = samplesRef.current;
      if (samples.length > 0) {
        const avg = samples.reduce(
          (acc, s) => ({
            alpha: acc.alpha + s.alpha,
            beta: acc.beta + s.beta,
            gamma: acc.gamma + s.gamma,
          }),
          { alpha: 0, beta: 0, gamma: 0 }
        );
        baselineRef.current = {
          alpha: avg.alpha / samples.length,
          beta: avg.beta / samples.length,
          gamma: avg.gamma / samples.length,
        };
      }
      calibratingRef.current = false;
      setState((s) => ({ ...s, isMonitoring: true }));
    }, calibrationMs);

    const handler = (e: DeviceOrientationEvent) => {
      const alpha = e.alpha ?? 0;
      const beta = e.beta ?? 0;
      const gamma = e.gamma ?? 0;

      if (calibratingRef.current) {
        samplesRef.current.push({ alpha, beta, gamma });
        return;
      }

      if (!baselineRef.current || firedRef.current) return;

      const dBeta = Math.abs(beta - baselineRef.current.beta);
      const dGamma = Math.abs(gamma - baselineRef.current.gamma);

      if (dBeta > threshold || dGamma > threshold) {
        firedRef.current = true;
        onMotionDetected();
      }
    };

    window.addEventListener("deviceorientation", handler);

    return () => {
      clearTimeout(calibrationTimer);
      window.removeEventListener("deviceorientation", handler);
      setState((s) => ({ ...s, isMonitoring: false }));
    };
  }, [active, onMotionDetected, calibrationMs, threshold]);

  return { ...state, requestPermission };
}
