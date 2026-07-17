"use client";

/**
 * Shared WebAudio engine.
 *
 * Every piece of feature audio (Azure TTS buffers, static phoneme clips, the
 * completion chime) plays through ONE AudioContext that is unlocked on the
 * first user gesture. This matters for two reasons:
 *
 * 1. Autoplay policy: audio that starts long after the triggering gesture
 *    (e.g. tutoring narration after a 10 s SSE stream) is silently blocked
 *    when each utterance creates its own audio element. A running
 *    AudioContext can start sources at any time.
 * 2. Gapless sequences: clips are scheduled back-to-back on the context's
 *    own clock, so phoneme sweeps and step narration have no loading gaps.
 *
 * §7 rule 4 still holds: this file only PLAYS audio — phoneme content comes
 * exclusively from the static bank in /public/phonemes/.
 */

let ctx: AudioContext | null = null;
let unlockInstalled = false;

export function audioContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
  }
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => {});
  }
  return ctx;
}

/**
 * Idempotent: resume the context on the next user gesture. Call once per
 * page; safe to call again. Feature pages call this on mount so that by the
 * time any audio is needed, the context is already running.
 */
export function installAudioUnlock(): void {
  if (unlockInstalled || typeof window === "undefined") return;
  unlockInstalled = true;
  const unlock = () => {
    void audioContext().resume().catch(() => {});
  };
  // Keep listening (not {once:true}): iOS can re-suspend after tab switches.
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock, { passive: true });
}

const clipCache = new Map<string, Promise<AudioBuffer | null>>();

/** Fetch + decode an audio file, cached. Resolves null on any failure. */
export function loadClip(url: string): Promise<AudioBuffer | null> {
  let cached = clipCache.get(url);
  if (!cached) {
    cached = (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        return await audioContext().decodeAudioData(await res.arrayBuffer());
      } catch {
        return null;
      }
    })();
    clipCache.set(url, cached);
  }
  return cached;
}

export function decodeAudio(data: ArrayBuffer): Promise<AudioBuffer> {
  return audioContext().decodeAudioData(data);
}

export interface Playback {
  /** Resolves when playback ends OR is stopped; never rejects. */
  done: Promise<void>;
  stop: () => void;
}

/**
 * Play buffers as one gapless sequence on the context clock.
 * `gapMs` inserts a small natural breath between clips (0 = truly gapless).
 * Null entries (missing clips) become a short pause so sweeps stay in step.
 */
export function playSequence(
  buffers: (AudioBuffer | null)[],
  opts?: { gapMs?: number; missingMs?: number; onClipStart?: (index: number) => void },
): Playback {
  const context = audioContext();
  const gap = (opts?.gapMs ?? 0) / 1000;
  const missing = (opts?.missingMs ?? 250) / 1000;

  const sources: AudioBufferSourceNode[] = [];
  const timers: ReturnType<typeof setTimeout>[] = [];
  let stopped = false;
  let resolveDone!: () => void;
  const done = new Promise<void>((resolve) => (resolveDone = resolve));

  const startAt = context.currentTime + 0.05;
  let t = startAt;
  buffers.forEach((buf, i) => {
    if (opts?.onClipStart) {
      const cb = opts.onClipStart;
      timers.push(setTimeout(() => !stopped && cb(i), Math.max(0, (t - context.currentTime) * 1000)));
    }
    if (buf) {
      const src = context.createBufferSource();
      src.buffer = buf;
      src.connect(context.destination);
      src.start(t);
      sources.push(src);
      t += buf.duration + gap;
    } else {
      t += missing;
    }
  });

  const endTimer = setTimeout(() => {
    if (!stopped) {
      stopped = true;
      resolveDone();
    }
  }, Math.max(0, (t - context.currentTime) * 1000));
  timers.push(endTimer);

  return {
    done,
    stop: () => {
      if (stopped) return;
      stopped = true;
      timers.forEach(clearTimeout);
      sources.forEach((s) => {
        try {
          s.stop();
        } catch {
          /* not started yet */
        }
      });
      resolveDone();
    },
  };
}

/** Two-note completion chime, synthesized locally — no asset, works offline. */
export function playChime(): void {
  try {
    const context = audioContext();
    const now = context.currentTime;
    [523.25, 783.99].forEach((freq, i) => {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(context.destination);
      const t = now + i * 0.15;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.start(t);
      osc.stop(t + 0.6);
    });
  } catch {
    /* audio cue only */
  }
}
