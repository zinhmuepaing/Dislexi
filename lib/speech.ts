"use client";

/**
 * Client-side Azure Speech TTS helper (ARCHITECTURE.md §5.4).
 *
 * Authenticated with a short-lived token from GET /api/azure-token (cached
 * here ~8 min; the subscription key never ships to the client).
 *
 * Synthesis and playback are deliberately SPLIT: the SDK synthesizes to an
 * audio buffer (no speaker destination), and playback goes through the shared
 * WebAudio context (lib/audio.ts). This fixes the "no audio in AI tutoring"
 * bug — narration that starts after a long SSE wait used to be silently
 * blocked by browser autoplay policy because the SDK's own audio element
 * started outside a user-activation window. A running AudioContext has no
 * such restriction, and buffers can be scheduled gaplessly.
 *
 * `wordBoundary` (textOffset/wordLength) remains the ENTIRE karaoke sync
 * mechanism — events are captured at synthesis time and re-scheduled against
 * the WebAudio clock at playback; no timing estimator.
 *
 * Exam-Prep rule (§5.4): callers pass the OCR text VERBATIM.
 */

import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import { audioContext, decodeAudio } from "@/lib/audio";

const TOKEN_TTL_MS = 8 * 60 * 1000;
/** Natural Singapore-English neural voice (Azure southeastasia). */
const VOICE = "en-SG-LunaNeural";
const SYNTH_CACHE_MAX = 24;

let cachedToken: { token: string; region: string; fetchedAt: number } | null = null;

/** Shared Azure Speech token (TTS here + STT in lib/stt.ts use one cache). */
export async function getSpeechToken(): Promise<{ token: string; region: string }> {
  return getToken();
}

async function getToken(): Promise<{ token: string; region: string }> {
  if (cachedToken && Date.now() - cachedToken.fetchedAt < TOKEN_TTL_MS) return cachedToken;
  const res = await fetch("/api/azure-token");
  if (!res.ok) throw new Error(`azure-token ${res.status}`);
  const { token, region } = (await res.json()) as { token: string; region: string };
  cachedToken = { token, region, fetchedAt: Date.now() };
  return cachedToken;
}

/** Warm the token cache on page entry so the first utterance starts fast. */
export function primeSpeech(): void {
  void getToken().catch(() => {});
}

export interface WordBoundary {
  offsetMs: number;
  charStart: number;
  charLength: number;
}

export interface SynthesizedSpeech {
  buffer: AudioBuffer;
  boundaries: WordBoundary[];
}

export interface SpeakCallbacks {
  /** Fires per spoken word, scheduled at the word's audioOffset in playback. */
  onWordBoundary?: (charStart: number, charLength: number) => void;
}

const synthCache = new Map<string, Promise<SynthesizedSpeech>>();

/**
 * Synthesize `text` to a decoded buffer + word boundaries, without playing.
 * Cached (LRU-ish) — repeated words (autopsy speak → blend) skip the network.
 */
export function synthesizeSpeech(text: string): Promise<SynthesizedSpeech> {
  const cached = synthCache.get(text);
  if (cached) return cached;

  const job = (async () => {
    const { token, region } = await getToken();
    const config = sdk.SpeechConfig.fromAuthorizationToken(token, region);
    config.speechSynthesisVoiceName = VOICE;
    // MP3 keeps payloads small; decodeAudioData handles it everywhere.
    config.speechSynthesisOutputFormat =
      sdk.SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3;
    config.setProperty(sdk.PropertyId.SpeechServiceResponse_RequestWordBoundary, "true");

    // null audio config = synthesize to result.audioData, no auto-playback.
    const synth = new sdk.SpeechSynthesizer(config, null as unknown as sdk.AudioConfig);
    const boundaries: WordBoundary[] = [];
    synth.wordBoundary = (_, e) => {
      boundaries.push({
        offsetMs: e.audioOffset / 10_000, // 100-ns ticks → ms
        charStart: e.textOffset,
        charLength: e.wordLength,
      });
    };

    const audioData = await new Promise<ArrayBuffer>((resolve, reject) => {
      synth.speakTextAsync(
        text,
        (result) => {
          synth.close();
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            resolve(result.audioData);
          } else {
            reject(new Error(`TTS failed: ${result.errorDetails || result.reason}`));
          }
        },
        (err) => {
          synth.close();
          reject(new Error(String(err)));
        },
      );
    });

    return { buffer: await decodeAudio(audioData), boundaries };
  })();

  synthCache.set(text, job);
  job.catch(() => synthCache.delete(text)); // never cache failures
  if (synthCache.size > SYNTH_CACHE_MAX) {
    const oldest = synthCache.keys().next().value;
    if (oldest !== undefined) synthCache.delete(oldest);
  }
  return job;
}

/** Generation counter: any stop/new-speak invalidates in-flight sequences. */
let speakGen = 0;
let activeStop: (() => void) | null = null;

/** Stop any in-flight utterance/sequence immediately (promises resolve). */
export function stopSpeaking(): void {
  speakGen++;
  const stop = activeStop;
  activeStop = null;
  stop?.();
}

/** Play an already-synthesized buffer; resolves on end or stop. */
function playSynthesized(s: SynthesizedSpeech, callbacks?: SpeakCallbacks): Promise<void> {
  return new Promise((resolve) => {
    const context = audioContext();
    const src = context.createBufferSource();
    src.buffer = s.buffer;
    src.connect(context.destination);

    const startAt = context.currentTime + 0.03;
    const leadMs = (startAt - context.currentTime) * 1000;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const cb = callbacks?.onWordBoundary;
    if (cb) {
      for (const b of s.boundaries) {
        timers.push(setTimeout(() => cb(b.charStart, b.charLength), leadMs + b.offsetMs));
      }
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      timers.forEach(clearTimeout);
      if (activeStop === stop) activeStop = null;
      resolve();
    };
    const stop = () => {
      try {
        src.stop();
      } catch {
        /* not started */
      }
      finish();
    };
    activeStop = stop;
    src.onended = finish;
    src.start(startAt);
  });
}

/**
 * Speak `text` through the shared audio context; resolves when playback
 * finishes. A new call (or stopSpeaking) cancels the previous utterance.
 */
export async function speak(text: string, callbacks?: SpeakCallbacks): Promise<void> {
  stopSpeaking();
  const gen = speakGen;
  const s = await synthesizeSpeech(text);
  if (gen !== speakGen) return; // superseded while synthesizing
  await playSynthesized(s, callbacks);
}

/**
 * Narrate a list of texts as one smooth sequence: every step is synthesized
 * up front (in parallel), then played back-to-back with a short natural
 * breath between steps. `onStepStart(i)` fires as step i begins (or is
 * skipped on synth failure). Cancelled by stopSpeaking()/speak().
 */
export async function speakSteps(
  texts: string[],
  onStepStart?: (index: number) => void,
  gapMs = 350,
): Promise<void> {
  stopSpeaking();
  const gen = speakGen;
  const jobs = texts.map((t) => synthesizeSpeech(t).catch(() => null));
  for (let i = 0; i < jobs.length; i++) {
    const s = await jobs[i];
    if (gen !== speakGen) return;
    onStepStart?.(i);
    if (!s) continue;
    await playSynthesized(s);
    if (gen !== speakGen) return;
    if (i < jobs.length - 1 && gapMs > 0) {
      await new Promise((r) => setTimeout(r, gapMs));
    }
  }
}

/** Browser-native TTS for UI cues (mode announcements, §7 rule 6) — not content. */
export function announce(text: string): void {
  try {
    speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  } catch {
    /* non-critical UI cue */
  }
}
