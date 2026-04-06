/**
 * Centralized audio manager.
 * - Preloads bundled audio assets at app startup
 * - Unlocks and reuses a single audio session after the first user gesture
 * - Plays sounds from shared game-state transitions with detailed logging
 */

type SoundId = "countdown" | "gameStart" | "gameOver" | "success" | "fail";
type KnownAudioContextState = AudioContextState | "interrupted" | "unavailable";

type AudioDebugState = {
  unlocked: boolean;
  contextState: KnownAudioContextState;
  preloadStarted: boolean;
  loaded: Partial<Record<SoundId, boolean>>;
  lastTrigger: string | null;
};

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
    __dontTouchAudioDebug?: AudioDebugState;
  }
}

const SOUND_FILES: Record<SoundId, string> = {
  countdown: "audio/countdown.wav",
  gameStart: "audio/game-start.wav",
  gameOver: "audio/game-over.wav",
  success: "audio/success.wav",
  fail: "audio/fail.wav",
};

const htmlAudioElements = new Map<SoundId, HTMLAudioElement>();
const audioBuffers = new Map<SoundId, AudioBuffer>();
const activeHtmlAudio = new Set<HTMLAudioElement>();

const debugState: AudioDebugState = {
  unlocked: false,
  contextState: "unavailable",
  preloadStarted: false,
  loaded: {},
  lastTrigger: null,
};

let audioCtx: AudioContext | null = null;
let preloadPromise: Promise<void> | null = null;
let unlockPromise: Promise<boolean> | null = null;

function syncDebugState() {
  if (typeof window !== "undefined") {
    window.__dontTouchAudioDebug = {
      ...debugState,
      loaded: { ...debugState.loaded },
    };
  }
}

function setLoaded(soundId: SoundId, loaded: boolean) {
  debugState.loaded = {
    ...debugState.loaded,
    [soundId]: loaded,
  };
  syncDebugState();
}

function updateDebugState(partial: Partial<AudioDebugState>) {
  Object.assign(debugState, partial);
  syncDebugState();
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function logInfo(message: string, details?: Record<string, unknown>) {
  if (details) {
    console.info(`[audio] ${message}`, details);
    return;
  }

  console.info(`[audio] ${message}`);
}

function logError(message: string, details?: Record<string, unknown>) {
  if (details) {
    console.error(`[audio] ${message}`, details);
    return;
  }

  console.error(`[audio] ${message}`);
}

function getSoundUrl(soundId: SoundId): string {
  const baseUrl = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
  return `${baseUrl}${SOUND_FILES[soundId]}`;
}

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }

  if (!audioCtx) {
    const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext;

    if (!AudioContextCtor) {
      updateDebugState({ contextState: "unavailable" });
      logError("audio context unavailable");
      return null;
    }

    try {
      audioCtx = new AudioContextCtor();
      logInfo("audio context created", { state: audioCtx.state });
    } catch (error) {
      updateDebugState({ contextState: "unavailable" });
      logError("audio context creation failed", { error: formatError(error) });
      return null;
    }
  }

  updateDebugState({ contextState: audioCtx.state as KnownAudioContextState });
  return audioCtx;
}

async function preloadSound(soundId: SoundId, ctx: AudioContext | null) {
  const url = getSoundUrl(soundId);

  if (!htmlAudioElements.has(soundId)) {
    const media = new Audio(url);
    media.preload = "auto";
    media.setAttribute("playsinline", "true");
    media.addEventListener(
      "loadeddata",
      () => {
        logInfo("audio file loaded", { soundId, url, channel: "html-audio" });
      },
      { once: true }
    );
    media.addEventListener(
      "error",
      () => {
        logError("audio file failed", {
          soundId,
          url,
          channel: "html-audio",
          code: media.error?.code ?? "unknown",
        });
      },
      { once: true }
    );
    media.load();
    htmlAudioElements.set(soundId, media);
  }

  if (!ctx) {
    setLoaded(soundId, true);
    return;
  }

  try {
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const audioData = await response.arrayBuffer();
    const decoded = await ctx.decodeAudioData(audioData.slice(0));
    audioBuffers.set(soundId, decoded);
    setLoaded(soundId, true);
    logInfo("audio file loaded", { soundId, url, channel: "web-audio" });
  } catch (error) {
    setLoaded(soundId, false);
    logError("audio file failed", {
      soundId,
      url,
      channel: "web-audio",
      error: formatError(error),
    });
  }
}

export function preloadAudio(): Promise<void> {
  if (preloadPromise) {
    return preloadPromise;
  }

  preloadPromise = Promise.all(
    (Object.keys(SOUND_FILES) as SoundId[]).map((soundId) => preloadSound(soundId, getCtx()))
  )
    .then(() => {
      updateDebugState({ preloadStarted: true });
    })
    .catch((error) => {
      preloadPromise = null;
      updateDebugState({ preloadStarted: true });
      logError("audio preload failed", { error: formatError(error) });
    });

  updateDebugState({ preloadStarted: true });
  logInfo("audio preload started");
  return preloadPromise;
}

function markUnlocked(source: string, unlocked: boolean) {
  const ctx = getCtx();
  updateDebugState({
    unlocked,
    contextState: (ctx?.state as KnownAudioContextState | undefined) ?? "unavailable",
  });
  logInfo(`audio unlocked = ${String(unlocked)}`, {
    source,
    state: ctx?.state ?? "unavailable",
  });
  return unlocked;
}

/** Call once from a user-gesture handler (e.g. "Ready", "Start", "Enable") */
export async function unlockAudio(source = "unknown"): Promise<boolean> {
  const ctx = getCtx();
  if (!ctx) {
    return false;
  }

  void preloadAudio();

  if (debugState.unlocked && ctx.state === "running") {
    logInfo("audio unlock reused", { source, state: ctx.state });
    return true;
  }

  if (unlockPromise) {
    return unlockPromise;
  }

  unlockPromise = (async () => {
    try {
      if (ctx.state !== "running") {
        await ctx.resume();
      }

      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      oscillator.frequency.setValueAtTime(1, ctx.currentTime);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.01);

      return markUnlocked(source, ctx.state === "running");
    } catch (error) {
      logError("audio unlock failed", {
        source,
        state: ctx.state,
        error: formatError(error),
      });
      return markUnlocked(source, false);
    } finally {
      unlockPromise = null;
    }
  })();

  return unlockPromise;
}

async function playViaWebAudio(soundId: SoundId): Promise<boolean> {
  const ctx = getCtx();
  const buffer = audioBuffers.get(soundId);

  if (!ctx || !buffer || ctx.state !== "running") {
    return false;
  }

  try {
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(1, ctx.currentTime);
    source.buffer = buffer;
    source.connect(gain).connect(ctx.destination);
    source.start(0);
    logInfo("play() succeeded", { soundId, method: "web-audio" });
    return true;
  } catch (error) {
    logError("play() failed", {
      soundId,
      method: "web-audio",
      error: formatError(error),
    });
    return false;
  }
}

async function playViaHtmlAudio(soundId: SoundId): Promise<boolean> {
  const base = htmlAudioElements.get(soundId);

  if (!base) {
    return false;
  }

  const playback = new Audio(base.src);
  playback.preload = "auto";
  playback.setAttribute("playsinline", "true");
  activeHtmlAudio.add(playback);

  const cleanup = () => {
    activeHtmlAudio.delete(playback);
  };

  playback.addEventListener("ended", cleanup, { once: true });
  playback.addEventListener("error", cleanup, { once: true });

  try {
    await playback.play();
    logInfo("play() succeeded", { soundId, method: "html-audio" });
    return true;
  } catch (error) {
    cleanup();
    logError("play() failed", {
      soundId,
      method: "html-audio",
      error: formatError(error),
    });
    return false;
  }
}

async function playSound(soundId: SoundId, trigger: string): Promise<boolean> {
  const ctx = getCtx();
  updateDebugState({
    lastTrigger: `${soundId}:${trigger}`,
    contextState: (ctx?.state as KnownAudioContextState | undefined) ?? "unavailable",
  });

  logInfo("sound trigger fired", {
    soundId,
    trigger,
    unlocked: debugState.unlocked,
    contextState: ctx?.state ?? "unavailable",
  });

  if (!audioBuffers.size || !htmlAudioElements.size) {
    await preloadAudio();
  }

  if (!debugState.unlocked || ctx?.state !== "running") {
    const unlocked = await unlockAudio(`play:${soundId}:${trigger}`);
    if (!unlocked) {
      logError("audio playback blocked before play()", {
        soundId,
        trigger,
        contextState: ctx?.state ?? "unavailable",
      });
    }
  }

  const playedViaWebAudio = await playViaWebAudio(soundId);
  if (playedViaWebAudio) {
    return true;
  }

  return playViaHtmlAudio(soundId);
}

export function startAudioSession(): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  void preloadAudio();

  const handleInteraction = () => {
    void unlockAudio("global-user-gesture");
  };

  const handleVisibilityChange = () => {
    const ctx = getCtx();
    if (document.visibilityState === "visible" && ctx && debugState.unlocked && ctx.state !== "running") {
      void unlockAudio("visibilitychange");
    }
  };

  window.addEventListener("pointerdown", handleInteraction, { capture: true, passive: true });
  window.addEventListener("touchstart", handleInteraction, { capture: true, passive: true });
  window.addEventListener("keydown", handleInteraction, { capture: true });
  document.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    window.removeEventListener("pointerdown", handleInteraction, true);
    window.removeEventListener("touchstart", handleInteraction, true);
    window.removeEventListener("keydown", handleInteraction, true);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}

/** Short tick sound for countdown numbers */
export function playCountdownTick(trigger = "countdown-state-change"): Promise<boolean> {
  return playSound("countdown", trigger);
}

/** Rising tone for game start */
export function playGameStartSound(trigger = "game-start-state-change"): Promise<boolean> {
  return playSound("gameStart", trigger);
}

/** Two-tone descending alert for game over */
export function playGameOverSound(trigger = "game-over-state-change"): Promise<boolean> {
  return playSound("gameOver", trigger);
}
