type SoundId = "countdown" | "gameStart" | "gameOver" | "success" | "fail";
type KnownAudioContextState = AudioContextState | "interrupted" | "unavailable";

type AudioDebugState = {
  unlocked: boolean;
  contextState: KnownAudioContextState;
  preloadStarted: boolean;
  loaded: Partial<Record<SoundId, boolean>>;
  lastTrigger: string | null;
  htmlPrimed: boolean;
  webAudioPrimed: boolean;
  lastPlayResult: string | null;
  lastError: string | null;
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

const SOUND_IDS = Object.keys(SOUND_FILES) as SoundId[];
const htmlAudioElements = new Map<SoundId, HTMLAudioElement>();
const htmlLoadPromises = new Map<SoundId, Promise<void>>();
const htmlLoaded = new Set<SoundId>();
const audioBuffers = new Map<SoundId, AudioBuffer>();

const debugState: AudioDebugState = {
  unlocked: false,
  contextState: "unavailable",
  preloadStarted: false,
  loaded: {},
  lastTrigger: null,
  htmlPrimed: false,
  webAudioPrimed: false,
  lastPlayResult: null,
  lastError: null,
};

let audioCtx: AudioContext | null = null;
let preloadPromise: Promise<void> | null = null;
let decodePromise: Promise<void> | null = null;
let unlockPromise: Promise<boolean> | null = null;
let htmlPrimePromise: Promise<boolean> | null = null;

function syncDebugState() {
  if (typeof window !== "undefined") {
    window.__dontTouchAudioDebug = {
      ...debugState,
      loaded: { ...debugState.loaded },
    };
  }
}

function setLoaded(soundId: SoundId, loaded: boolean) {
  if (debugState.loaded[soundId] === loaded) {
    return;
  }

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

function rememberError(scope: string, error: unknown) {
  updateDebugState({ lastError: `${scope}:${formatError(error)}` });
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

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function getSoundUrl(soundId: SoundId): string {
  const baseUrl = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
  return `${baseUrl}${SOUND_FILES[soundId]}`;
}

function getOrCreateHtmlAudio(soundId: SoundId): HTMLAudioElement {
  const existing = htmlAudioElements.get(soundId);
  if (existing) {
    return existing;
  }

  const url = getSoundUrl(soundId);
  const media = new Audio(url);
  media.preload = "auto";
  media.setAttribute("playsinline", "true");
  media.setAttribute("webkit-playsinline", "true");
  media.volume = 1;
  media.load();
  htmlAudioElements.set(soundId, media);
  return media;
}

function ensureHtmlLoaded(soundId: SoundId): Promise<void> {
  const existingPromise = htmlLoadPromises.get(soundId);
  if (existingPromise) {
    return existingPromise;
  }

  const media = getOrCreateHtmlAudio(soundId);
  const url = getSoundUrl(soundId);

  if (htmlLoaded.has(soundId) || media.readyState >= 2) {
    htmlLoaded.add(soundId);
    setLoaded(soundId, true);
    return Promise.resolve();
  }

  const promise = new Promise<void>((resolve) => {
    const cleanup = () => {
      media.removeEventListener("loadeddata", handleLoaded);
      media.removeEventListener("error", handleError);
    };

    const handleLoaded = () => {
      cleanup();
      htmlLoaded.add(soundId);
      setLoaded(soundId, true);
      logInfo("audio file loaded", { soundId, url, channel: "html-audio" });
      resolve();
    };

    const handleError = () => {
      cleanup();
      if (!audioBuffers.has(soundId)) {
        setLoaded(soundId, false);
      }
      rememberError(`html-audio:${soundId}`, media.error?.message ?? media.error?.code ?? "unknown");
      logError("audio file failed", {
        soundId,
        url,
        channel: "html-audio",
        code: media.error?.code ?? "unknown",
      });
      resolve();
    };

    media.addEventListener("loadeddata", handleLoaded, { once: true });
    media.addEventListener("error", handleError, { once: true });
    media.load();
  });

  htmlLoadPromises.set(soundId, promise);
  return promise;
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
      audioCtx.addEventListener("statechange", () => {
        if (!audioCtx) {
          return;
        }

        updateDebugState({ contextState: audioCtx.state as KnownAudioContextState });
        logInfo("audio context state changed", { state: audioCtx.state });
      });
      logInfo("audio context created", { state: audioCtx.state });
    } catch (error) {
      updateDebugState({ contextState: "unavailable" });
      rememberError("context-create", error);
      logError("audio context creation failed", { error: formatError(error) });
      return null;
    }
  }

  updateDebugState({ contextState: audioCtx.state as KnownAudioContextState });
  return audioCtx;
}

async function decodeSound(soundId: SoundId, ctx: AudioContext) {
  if (audioBuffers.has(soundId)) {
    return;
  }

  const url = getSoundUrl(soundId);

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
    if (!htmlLoaded.has(soundId)) {
      setLoaded(soundId, false);
    }
    rememberError(`web-audio:${soundId}`, error);
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

  updateDebugState({ preloadStarted: true });
  logInfo("audio preload started");

  preloadPromise = Promise.all(SOUND_IDS.map((soundId) => ensureHtmlLoaded(soundId)))
    .then(() => undefined)
    .catch((error) => {
      preloadPromise = null;
      rememberError("preload", error);
      logError("audio preload failed", { error: formatError(error) });
    });

  return preloadPromise;
}

function preloadDecodedAudio(): Promise<void> {
  if (decodePromise) {
    return decodePromise;
  }

  const ctx = getCtx();
  if (!ctx) {
    return Promise.resolve();
  }

  decodePromise = Promise.all(SOUND_IDS.map((soundId) => decodeSound(soundId, ctx)))
    .then(() => undefined)
    .catch((error) => {
      decodePromise = null;
      rememberError("decode", error);
      logError("audio decode preload failed", { error: formatError(error) });
    });

  return decodePromise;
}

async function primeWebAudio(ctx: AudioContext): Promise<boolean> {
  try {
    if (ctx.state !== "running") {
      await ctx.resume();
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.00001, ctx.currentTime);

    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain).connect(ctx.destination);
    source.start(ctx.currentTime);

    updateDebugState({
      webAudioPrimed: ctx.state === "running",
      contextState: ctx.state as KnownAudioContextState,
    });

    return ctx.state === "running";
  } catch (error) {
    rememberError("web-prime", error);
    logError("audio web prime failed", {
      state: ctx.state,
      error: formatError(error),
    });
    updateDebugState({
      webAudioPrimed: false,
      contextState: ctx.state as KnownAudioContextState,
    });
    return false;
  }
}

async function primeHtmlAudio(): Promise<boolean> {
  if (debugState.htmlPrimed) {
    return true;
  }

  if (htmlPrimePromise) {
    return htmlPrimePromise;
  }

  htmlPrimePromise = (async () => {
    const preload = preloadAudio();
    await Promise.race([preload, wait(800)]);

    const results = await Promise.allSettled(
      SOUND_IDS.map(async (soundId) => {
        const media = getOrCreateHtmlAudio(soundId);

        try {
          media.pause();
          try {
            media.currentTime = 0;
          } catch {
            // Ignore if currentTime cannot be reset yet
          }
          media.muted = true;
          media.volume = 0;
          const playPromise = media.play();
          if (playPromise) {
            await Promise.race([playPromise, wait(400)]);
          }
          media.pause();
          try {
            media.currentTime = 0;
          } catch {
            // Ignore if currentTime cannot be reset yet
          }
          return true;
        } catch (error) {
          rememberError(`html-prime:${soundId}`, error);
          logError("audio prime failed", {
            soundId,
            channel: "html-audio",
            error: formatError(error),
          });
          return false;
        } finally {
          media.muted = false;
          media.volume = 1;
        }
      })
    );

    const primed = results.some((result) => result.status === "fulfilled" && result.value);
    updateDebugState({ htmlPrimed: primed });
    return primed;
  })().finally(() => {
    htmlPrimePromise = null;
  });

  return htmlPrimePromise;
}

function markUnlocked(source: string, unlocked: boolean) {
  updateDebugState({
    unlocked,
    contextState: (audioCtx?.state as KnownAudioContextState | undefined) ?? "unavailable",
  });
  logInfo(`audio unlocked = ${String(unlocked)}`, {
    source,
    state: audioCtx?.state ?? "unavailable",
  });
  return unlocked;
}

export async function unlockAudio(source = "unknown"): Promise<boolean> {
  if (debugState.unlocked && (audioCtx?.state === "running" || debugState.htmlPrimed)) {
    logInfo("audio unlock reused", { source, state: audioCtx?.state ?? "unavailable" });
    return true;
  }

  if (unlockPromise) {
    return unlockPromise;
  }

  const ctx = getCtx();

  unlockPromise = (async () => {
    const [webPrimed, htmlPrimed] = await Promise.all([
      ctx ? primeWebAudio(ctx) : Promise.resolve(false),
      primeHtmlAudio(),
    ]);

    if (webPrimed) {
      void preloadDecodedAudio();
    }

    return markUnlocked(source, webPrimed || htmlPrimed);
  })()
    .catch((error) => {
      rememberError("unlock", error);
      logError("audio unlock failed", {
        source,
        state: ctx?.state ?? "unavailable",
        error: formatError(error),
      });
      return markUnlocked(source, false);
    })
    .finally(() => {
      unlockPromise = null;
    });

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
    source.start(ctx.currentTime);
    updateDebugState({
      lastPlayResult: `${soundId}:web-audio:ok`,
      lastError: null,
    });
    logInfo("play() succeeded", { soundId, method: "web-audio" });
    return true;
  } catch (error) {
    const errorMessage = formatError(error);
    updateDebugState({
      lastPlayResult: `${soundId}:web-audio:failed`,
      lastError: errorMessage,
    });
    logError("play() failed", {
      soundId,
      method: "web-audio",
      error: errorMessage,
    });
    return false;
  }
}

async function playViaHtmlAudio(soundId: SoundId): Promise<boolean> {
  const media = getOrCreateHtmlAudio(soundId);

  try {
    media.pause();
    try {
      media.currentTime = 0;
    } catch {
      // Ignore if currentTime cannot be reset yet
    }
    media.muted = false;
    media.volume = 1;
    const playPromise = media.play();
    if (playPromise) {
      await playPromise;
    }
    updateDebugState({
      lastPlayResult: `${soundId}:html-audio:ok`,
      lastError: null,
    });
    logInfo("play() succeeded", { soundId, method: "html-audio" });
    return true;
  } catch (error) {
    const errorMessage = formatError(error);
    updateDebugState({
      lastPlayResult: `${soundId}:html-audio:failed`,
      lastError: errorMessage,
    });
    logError("play() failed", {
      soundId,
      method: "html-audio",
      error: errorMessage,
    });
    return false;
  }
}

async function playSound(soundId: SoundId, trigger: string): Promise<boolean> {
  const ctx = audioCtx ?? getCtx();
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

  void preloadAudio();
  if (!audioBuffers.has(soundId) && debugState.unlocked) {
    void preloadDecodedAudio();
  }

  if (!debugState.unlocked) {
    const unlocked = await unlockAudio(`play:${soundId}:${trigger}`);
    if (!unlocked) {
      logError("audio playback blocked before play()", {
        soundId,
        trigger,
        contextState: audioCtx?.state ?? "unavailable",
      });
    }
  }

  const playedViaWebAudio = await playViaWebAudio(soundId);
  if (playedViaWebAudio) {
    return true;
  }

  const playedViaHtmlAudio = await playViaHtmlAudio(soundId);
  if (!playedViaHtmlAudio) {
    updateDebugState({
      lastPlayResult: `${soundId}:blocked`,
      lastError: debugState.lastError ?? "No playback path succeeded",
    });
  }

  return playedViaHtmlAudio;
}

export function startAudioSession(): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  syncDebugState();
  void preloadAudio();

  const handleInteraction = () => {
    void unlockAudio("global-user-gesture");
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible" && debugState.unlocked && audioCtx && audioCtx.state !== "running") {
      void unlockAudio("visibilitychange");
    }
  };

  window.addEventListener("pointerdown", handleInteraction, { capture: true, passive: true });
  window.addEventListener("touchstart", handleInteraction, { capture: true, passive: true });
  window.addEventListener("click", handleInteraction, { capture: true, passive: true });
  window.addEventListener("keydown", handleInteraction, { capture: true });
  document.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    window.removeEventListener("pointerdown", handleInteraction, true);
    window.removeEventListener("touchstart", handleInteraction, true);
    window.removeEventListener("click", handleInteraction, true);
    window.removeEventListener("keydown", handleInteraction, true);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}

export function playCountdownTick(trigger = "countdown-state-change"): Promise<boolean> {
  return playSound("countdown", trigger);
}

export function playGameStartSound(trigger = "game-start-state-change"): Promise<boolean> {
  return playSound("gameStart", trigger);
}

export function playGameOverSound(trigger = "game-over-state-change"): Promise<boolean> {
  return playSound("gameOver", trigger);
}

export function getAudioDebugState(): AudioDebugState {
  return {
    ...debugState,
    loaded: { ...debugState.loaded },
  };
}

syncDebugState();
