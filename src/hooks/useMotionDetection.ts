import { useEffect, useRef, useCallback, useState } from "react";

export interface MotionDebug {
  accelDelta: number;
  tiltDelta: number;
  accelThreshold: number;
  tiltThreshold: number;
  triggered: boolean;
  rawAccel: { x: number; y: number; z: number };
  rawTilt: { beta: number; gamma: number };
  listenersActive: boolean;
  permissionState: "pending" | "granted" | "denied";
  isNative: boolean;
  eventCount: number;
  smoothedAccel: number;
  smoothedTilt: number;
  sustainedMs: number;
  armed: boolean;
}

interface MotionState {
  isMonitoring: boolean;
  hasPermission: boolean | null;
  needsPermissionButton: boolean;
  debug: MotionDebug;
}

// Tuned for noisy environments (bars/restaurants with bass).
// Only a clear pickup / meaningful tilt should trigger a loss.
const ACCEL_THRESHOLD = 5.5;        // m/s² above resting baseline (was 3.0)
const TILT_THRESHOLD = 25;          // degrees from resting tilt (was 12)
const CALIBRATION_MS = 1500;
// After calibration, ignore motion for this long so tiny setup adjustments
// or initial table vibration don't immediately end the round.
const ARMING_DELAY_MS = 1000;
// Movement must stay above threshold for this long (sustained) to trigger.
const SUSTAINED_MS = 350;
// Heavier smoothing to reject single-spike vibrations (bass, taps).
const SMOOTHING_ALPHA = 0.18;
// Hard pickup short-circuit: a single very large spike still counts
// (e.g. someone snatches the phone) — keeps responsiveness.
const HARD_ACCEL_SPIKE = 14;        // m/s² instantaneous
const HARD_TILT_SPIKE = 55;         // degrees instantaneous

const isNativePlatform = () => {
  return !!(window as any).Capacitor?.isNativePlatform?.() ||
         !!(window as any).Capacitor?.isPluginAvailable;
};

const needsPermissionRequest = () => {
  return (typeof DeviceOrientationEvent !== "undefined" && "requestPermission" in DeviceOrientationEvent) ||
         (typeof DeviceMotionEvent !== "undefined" && "requestPermission" in DeviceMotionEvent);
};

export function useMotionDetection(
  active: boolean,
  onMotionDetected: () => void,
) {
  const [state, setState] = useState<MotionState>({
    isMonitoring: false,
    hasPermission: null,
    needsPermissionButton: needsPermissionRequest(),
    debug: {
      accelDelta: 0, tiltDelta: 0,
      accelThreshold: ACCEL_THRESHOLD, tiltThreshold: TILT_THRESHOLD,
      triggered: false,
      rawAccel: { x: 0, y: 0, z: 0 },
      rawTilt: { beta: 0, gamma: 0 },
      listenersActive: false,
      permissionState: "pending",
      isNative: isNativePlatform(),
      eventCount: 0,
      smoothedAccel: 0,
      smoothedTilt: 0,
      sustainedMs: 0,
      armed: false,
    },
  });

  const baseAccelRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const baseTiltRef = useRef<{ beta: number; gamma: number } | null>(null);
  const calibratingRef = useRef(true);
  const accelSamples = useRef<{ x: number; y: number; z: number }[]>([]);
  const tiltSamples = useRef<{ beta: number; gamma: number }[]>([]);
  const firedRef = useRef(false);
  const eventCountRef = useRef(0);
  const permissionGrantedRef = useRef(false);
  // Smoothed delta values for noise filtering
  const smoothedAccelDelta = useRef(0);
  const smoothedTiltDelta = useRef(0);
  // Sustained-movement tracking
  const overThresholdSinceRef = useRef<number | null>(null);
  // Time after which input is "armed" (loss can trigger). Until then we
  // still update baseline / smoothing but never fire.
  const armedAtRef = useRef<number | null>(null);

  const checkSustainedTrigger = useCallback(() => {
    if (firedRef.current) return;
    if (armedAtRef.current === null || Date.now() < armedAtRef.current) return;
    const since = overThresholdSinceRef.current;
    if (since === null) return;
    const heldMs = Date.now() - since;
    if (heldMs >= SUSTAINED_MS) {
      firedRef.current = true;
      setState((s) => ({ ...s, debug: { ...s.debug, triggered: true, sustainedMs: heldMs } }));
      onMotionDetected();
    }
  }, [onMotionDetected]);

  const requestPermission = useCallback(async () => {
    let granted = true;

    if (typeof DeviceOrientationEvent !== "undefined" && "requestPermission" in DeviceOrientationEvent) {
      try {
        const result = await (DeviceOrientationEvent as any).requestPermission();
        if (result !== "granted") { granted = false; }
      } catch {
        granted = false;
      }
    }

    if (granted && typeof DeviceMotionEvent !== "undefined" && "requestPermission" in DeviceMotionEvent) {
      try {
        const result = await (DeviceMotionEvent as any).requestPermission();
        if (result !== "granted") { granted = false; }
      } catch {
        granted = false;
      }
    }

    permissionGrantedRef.current = granted;
    setState((s) => ({
      ...s,
      hasPermission: granted,
      needsPermissionButton: false,
      debug: { ...s.debug, permissionState: granted ? "granted" : "denied" },
    }));
    return granted;
  }, []);

  // Auto-grant or re-detect permission
  useEffect(() => {
    if (!needsPermissionRequest()) {
      permissionGrantedRef.current = true;
      setState((s) => ({
        ...s,
        hasPermission: true,
        needsPermissionButton: false,
        debug: { ...s.debug, permissionState: "granted" },
      }));
    } else {
      (async () => {
        let granted = true;
        try {
          if (typeof DeviceOrientationEvent !== "undefined" && "requestPermission" in DeviceOrientationEvent) {
            const r = await (DeviceOrientationEvent as any).requestPermission();
            if (r !== "granted") granted = false;
          }
          if (granted && typeof DeviceMotionEvent !== "undefined" && "requestPermission" in DeviceMotionEvent) {
            const r = await (DeviceMotionEvent as any).requestPermission();
            if (r !== "granted") granted = false;
          }
        } catch {
          granted = false;
        }
        if (granted) {
          permissionGrantedRef.current = true;
          setState((s) => ({
            ...s,
            hasPermission: true,
            needsPermissionButton: false,
            debug: { ...s.debug, permissionState: "granted" },
          }));
        }
      })();
    }
  }, []);

  // Start listeners only when active AND permission granted
  useEffect(() => {
    if (!active || state.hasPermission !== true) {
      setState((s) => ({ ...s, isMonitoring: false, debug: { ...s.debug, listenersActive: false, triggered: false, accelDelta: 0, tiltDelta: 0, eventCount: 0, smoothedAccel: 0, smoothedTilt: 0, sustainedMs: 0, armed: false } }));
      baseAccelRef.current = null;
      baseTiltRef.current = null;
      calibratingRef.current = true;
      accelSamples.current = [];
      tiltSamples.current = [];
      firedRef.current = false;
      eventCountRef.current = 0;
      smoothedAccelDelta.current = 0;
      smoothedTiltDelta.current = 0;
      overThresholdSinceRef.current = null;
      armedAtRef.current = null;
      return;
    }

    firedRef.current = false;
    calibratingRef.current = true;
    accelSamples.current = [];
    tiltSamples.current = [];
    baseAccelRef.current = null;
    baseTiltRef.current = null;
    eventCountRef.current = 0;
    smoothedAccelDelta.current = 0;
    smoothedTiltDelta.current = 0;
    overThresholdSinceRef.current = null;
    armedAtRef.current = null;

    setState((s) => ({ ...s, debug: { ...s.debug, listenersActive: true, armed: false } }));

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
      // Arm after an additional grace period to ignore initial table vibration
      armedAtRef.current = Date.now() + ARMING_DELAY_MS;
      setState((s) => ({ ...s, isMonitoring: true }));
      setTimeout(() => {
        setState((s) => ({ ...s, debug: { ...s.debug, armed: true } }));
      }, ARMING_DELAY_MS);
    }, CALIBRATION_MS);

    const evaluateSustained = (accelDelta: number, tiltDelta: number) => {
      const overAccel = accelDelta > ACCEL_THRESHOLD;
      const overTilt = tiltDelta > TILT_THRESHOLD;
      // Require BOTH a meaningful tilt change OR a clear acceleration plus
      // some tilt — pure flat-on-table vibration moves accel but rarely tilt.
      const meaningful = overTilt || (overAccel && tiltDelta > TILT_THRESHOLD * 0.4);
      if (meaningful) {
        if (overThresholdSinceRef.current === null) {
          overThresholdSinceRef.current = Date.now();
        }
        checkSustainedTrigger();
      } else {
        overThresholdSinceRef.current = null;
      }
    };

    const motionHandler = (e: DeviceMotionEvent) => {
      eventCountRef.current++;
      const ag = e.accelerationIncludingGravity;
      if (!ag) return;
      const x = ag.x ?? 0;
      const y = ag.y ?? 0;
      const z = ag.z ?? 0;

      if (eventCountRef.current % 3 === 0) {
        setState((s) => ({ ...s, debug: { ...s.debug, rawAccel: { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, z: Math.round(z * 100) / 100 }, eventCount: eventCountRef.current } }));
      }

      if (calibratingRef.current) {
        accelSamples.current.push({ x, y, z });
        return;
      }
      if (!baseAccelRef.current || firedRef.current) return;

      const dx = x - baseAccelRef.current.x;
      const dy = y - baseAccelRef.current.y;
      const dz = z - baseAccelRef.current.z;
      const rawDelta = Math.sqrt(dx * dx + dy * dy + dz * dz);

      // Exponential moving average smoothing
      smoothedAccelDelta.current = SMOOTHING_ALPHA * rawDelta + (1 - SMOOTHING_ALPHA) * smoothedAccelDelta.current;
      const accelDelta = smoothedAccelDelta.current;

      if (eventCountRef.current % 3 === 0) {
        setState((s) => ({ ...s, debug: { ...s.debug, accelDelta: Math.round(accelDelta * 100) / 100, smoothedAccel: Math.round(accelDelta * 100) / 100, sustainedMs: overThresholdSinceRef.current ? Date.now() - overThresholdSinceRef.current : 0 } }));
      }

      // Hard spike short-circuit (clear snatch/grab) — still respects arming.
      if (
        rawDelta > HARD_ACCEL_SPIKE &&
        armedAtRef.current !== null &&
        Date.now() >= armedAtRef.current
      ) {
        firedRef.current = true;
        setState((s) => ({ ...s, debug: { ...s.debug, triggered: true, accelDelta: Math.round(rawDelta * 100) / 100 } }));
        onMotionDetected();
        return;
      }

      evaluateSustained(accelDelta, smoothedTiltDelta.current);
    };

    const orientationHandler = (e: DeviceOrientationEvent) => {
      const beta = e.beta ?? 0;
      const gamma = e.gamma ?? 0;

      if (eventCountRef.current % 3 === 0) {
        setState((s) => ({ ...s, debug: { ...s.debug, rawTilt: { beta: Math.round(beta * 100) / 100, gamma: Math.round(gamma * 100) / 100 } } }));
      }

      if (calibratingRef.current) {
        tiltSamples.current.push({ beta, gamma });
        return;
      }
      if (!baseTiltRef.current || firedRef.current) return;

      const dBeta = Math.abs(beta - baseTiltRef.current.beta);
      const dGamma = Math.abs(gamma - baseTiltRef.current.gamma);
      const rawTilt = Math.max(dBeta, dGamma);

      // Exponential moving average smoothing
      smoothedTiltDelta.current = SMOOTHING_ALPHA * rawTilt + (1 - SMOOTHING_ALPHA) * smoothedTiltDelta.current;
      const tiltDelta = smoothedTiltDelta.current;

      if (eventCountRef.current % 3 === 0) {
        setState((s) => ({ ...s, debug: { ...s.debug, tiltDelta: Math.round(tiltDelta * 100) / 100, smoothedTilt: Math.round(tiltDelta * 100) / 100 } }));
      }

      // Hard tilt spike (clear pickup/flip) — respects arming.
      if (
        rawTilt > HARD_TILT_SPIKE &&
        armedAtRef.current !== null &&
        Date.now() >= armedAtRef.current
      ) {
        firedRef.current = true;
        setState((s) => ({ ...s, debug: { ...s.debug, triggered: true, tiltDelta: Math.round(rawTilt * 100) / 100 } }));
        onMotionDetected();
        return;
      }

      evaluateSustained(smoothedAccelDelta.current, tiltDelta);
    };

    window.addEventListener("devicemotion", motionHandler);
    window.addEventListener("deviceorientation", orientationHandler);

    return () => {
      clearTimeout(calibrationTimer);
      window.removeEventListener("devicemotion", motionHandler);
      window.removeEventListener("deviceorientation", orientationHandler);
      setState((s) => ({ ...s, isMonitoring: false, debug: { ...s.debug, listenersActive: false } }));
    };
  }, [active, state.hasPermission, onMotionDetected, checkSustainedTrigger]);

  return { ...state, requestPermission };
}
