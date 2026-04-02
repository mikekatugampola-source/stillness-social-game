import { useEffect, useRef, useCallback, useState } from "react";

interface MotionDebug {
  accelDelta: number;
  tiltDelta: number;
  accelThreshold: number;
  tiltThreshold: number;
  triggered: boolean;
}

interface MotionState {
  isMonitoring: boolean;
  hasPermission: boolean | null;
  debug: MotionDebug;
}

const ACCEL_THRESHOLD = 1.8; // m/s² delta from baseline
const TILT_THRESHOLD = 8;    // degrees delta from baseline
const CALIBRATION_MS = 1000;

export function useMotionDetection(
  active: boolean,
  onMotionDetected: () => void,
) {
  const [state, setState] = useState<MotionState>({
    isMonitoring: false,
    hasPermission: null,
    debug: { accelDelta: 0, tiltDelta: 0, accelThreshold: ACCEL_THRESHOLD, tiltThreshold: TILT_THRESHOLD, triggered: false },
  });

  const baseAccelRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const baseTiltRef = useRef<{ beta: number; gamma: number } | null>(null);
  const calibratingRef = useRef(true);
  const accelSamples = useRef<{ x: number; y: number; z: number }[]>([]);
  const tiltSamples = useRef<{ beta: number; gamma: number }[]>([]);
  const firedRef = useRef(false);

  const requestPermission = useCallback(async () => {
    // Request orientation permission (iOS 13+)
    if (typeof DeviceOrientationEvent !== "undefined" && "requestPermission" in DeviceOrientationEvent) {
      try {
        const result = await (DeviceOrientationEvent as any).requestPermission();
        if (result !== "granted") {
          setState((s) => ({ ...s, hasPermission: false }));
          return false;
        }
      } catch {
        setState((s) => ({ ...s, hasPermission: false }));
        return false;
      }
    }
    // Request motion permission (iOS 13+)
    if (typeof DeviceMotionEvent !== "undefined" && "requestPermission" in DeviceMotionEvent) {
      try {
        const result = await (DeviceMotionEvent as any).requestPermission();
        if (result !== "granted") {
          setState((s) => ({ ...s, hasPermission: false }));
          return false;
        }
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
      setState((s) => ({ ...s, isMonitoring: false, debug: { ...s.debug, triggered: false, accelDelta: 0, tiltDelta: 0 } }));
      baseAccelRef.current = null;
      baseTiltRef.current = null;
      calibratingRef.current = true;
      accelSamples.current = [];
      tiltSamples.current = [];
      firedRef.current = false;
      return;
    }

    firedRef.current = false;
    calibratingRef.current = true;
    accelSamples.current = [];
    tiltSamples.current = [];
    baseAccelRef.current = null;
    baseTiltRef.current = null;

    // After calibration period, compute baselines
    const calibrationTimer = setTimeout(() => {
      const as = accelSamples.current;
      if (as.length > 0) {
        const avg = as.reduce((a, s) => ({ x: a.x + s.x, y: a.y + s.y, z: a.z + s.z }), { x: 0, y: 0, z: 0 });
        baseAccelRef.current = { x: avg.x / as.length, y: avg.y / as.length, z: avg.z / as.length };
      }
      const ts = tiltSamples.current;
      if (ts.length > 0) {
        const avg = ts.reduce((a, s) => ({ beta: a.beta + s.beta, gamma: a.gamma + s.gamma }), { beta: 0, gamma: 0 });
        baseTiltRef.current = { beta: avg.beta / ts.length, gamma: avg.gamma / ts.length };
      }
      calibratingRef.current = false;
      setState((s) => ({ ...s, isMonitoring: true }));
    }, CALIBRATION_MS);

    // Accelerometer handler (DeviceMotion gives acceleration including gravity)
    const motionHandler = (e: DeviceMotionEvent) => {
      const ag = e.accelerationIncludingGravity;
      if (!ag) return;
      const x = ag.x ?? 0;
      const y = ag.y ?? 0;
      const z = ag.z ?? 0;

      if (calibratingRef.current) {
        accelSamples.current.push({ x, y, z });
        return;
      }
      if (!baseAccelRef.current || firedRef.current) return;

      const dx = x - baseAccelRef.current.x;
      const dy = y - baseAccelRef.current.y;
      const dz = z - baseAccelRef.current.z;
      const accelDelta = Math.sqrt(dx * dx + dy * dy + dz * dz);

      setState((s) => ({ ...s, debug: { ...s.debug, accelDelta: Math.round(accelDelta * 100) / 100 } }));

      if (accelDelta > ACCEL_THRESHOLD) {
        firedRef.current = true;
        setState((s) => ({ ...s, debug: { ...s.debug, triggered: true, accelDelta: Math.round(accelDelta * 100) / 100 } }));
        onMotionDetected();
      }
    };

    // Orientation/tilt handler
    const orientationHandler = (e: DeviceOrientationEvent) => {
      const beta = e.beta ?? 0;
      const gamma = e.gamma ?? 0;

      if (calibratingRef.current) {
        tiltSamples.current.push({ beta, gamma });
        return;
      }
      if (!baseTiltRef.current || firedRef.current) return;

      const dBeta = Math.abs(beta - baseTiltRef.current.beta);
      const dGamma = Math.abs(gamma - baseTiltRef.current.gamma);
      const tiltDelta = Math.max(dBeta, dGamma);

      setState((s) => ({ ...s, debug: { ...s.debug, tiltDelta: Math.round(tiltDelta * 100) / 100 } }));

      if (tiltDelta > TILT_THRESHOLD) {
        firedRef.current = true;
        setState((s) => ({ ...s, debug: { ...s.debug, triggered: true, tiltDelta: Math.round(tiltDelta * 100) / 100 } }));
        onMotionDetected();
      }
    };

    window.addEventListener("devicemotion", motionHandler);
    window.addEventListener("deviceorientation", orientationHandler);

    return () => {
      clearTimeout(calibrationTimer);
      window.removeEventListener("devicemotion", motionHandler);
      window.removeEventListener("deviceorientation", orientationHandler);
      setState((s) => ({ ...s, isMonitoring: false }));
    };
  }, [active, onMotionDetected]);

  return { ...state, requestPermission };
}
