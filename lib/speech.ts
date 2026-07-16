"use client";

/**
 * Client-side Azure Speech TTS helper (ARCHITECTURE.md §5.4).
 *
 * The browser runs the Speech SDK directly, authenticated with a short-lived
 * token from GET /api/azure-token (cached here ~8 min; the subscription key
 * never ships to the client). `wordBoundary` (textOffset/wordLength) is the
 * ENTIRE karaoke sync mechanism — highlights are scheduled at each event's own
 * audioOffset relative to playback start; no timing estimator.
 *
 * Exam-Prep rule (§5.4): callers pass the OCR text VERBATIM.
 */

import * as sdk from "microsoft-cognitiveservices-speech-sdk";

const TOKEN_TTL_MS = 8 * 60 * 1000;

let cachedToken: { token: string; region: string; fetchedAt: number } | null = null;

async function getToken(): Promise<{ token: string; region: string }> {
  if (cachedToken && Date.now() - cachedToken.fetchedAt < TOKEN_TTL_MS) return cachedToken;
  const res = await fetch("/api/azure-token");
  if (!res.ok) throw new Error(`azure-token ${res.status}`);
  const { token, region } = (await res.json()) as { token: string; region: string };
  cachedToken = { token, region, fetchedAt: Date.now() };
  return cachedToken;
}

export interface SpeakCallbacks {
  /** Fires per spoken word, scheduled at the word's audioOffset in playback. */
  onWordBoundary?: (charStart: number, charLength: number) => void;
}

interface ActiveUtterance {
  synth: sdk.SpeechSynthesizer;
  player: sdk.SpeakerAudioDestination;
  timers: ReturnType<typeof setTimeout>[];
  /** Settles the utterance's promise so awaiting callers never hang. */
  settle: () => void;
}

let active: ActiveUtterance | null = null;

/** Stop any in-flight utterance immediately (its speak() promise resolves). */
export function stopSpeaking(): void {
  if (!active) return;
  const settle = active.settle;
  active.timers.forEach(clearTimeout);
  try {
    active.player.pause();
    active.player.close();
  } catch {
    /* already closed */
  }
  try {
    active.synth.close();
  } catch {
    /* already closed */
  }
  active = null;
  settle();
}

/**
 * Speak `text` through the device speaker; resolves when playback finishes.
 * A new call cancels the previous utterance.
 */
export function speak(text: string, callbacks?: SpeakCallbacks): Promise<void> {
  stopSpeaking();
  return new Promise((resolve, reject) => {
    getToken()
      .then(({ token, region }) => {
        const config = sdk.SpeechConfig.fromAuthorizationToken(token, region);
        config.setProperty(
          sdk.PropertyId.SpeechServiceResponse_RequestWordBoundary,
          "true",
        );
        const player = new sdk.SpeakerAudioDestination();
        const synth = new sdk.SpeechSynthesizer(config, sdk.AudioConfig.fromSpeakerOutput(player));
        const utterance: ActiveUtterance = { synth, player, timers: [], settle: resolve };
        active = utterance;

        let playbackStart: number | null = null;
        player.onAudioStart = () => {
          playbackStart = performance.now();
        };
        player.onAudioEnd = () => {
          if (active === utterance) stopSpeaking(); // settles via utterance.settle
        };

        synth.wordBoundary = (_, e) => {
          const cb = callbacks?.onWordBoundary;
          if (!cb) return;
          // audioOffset is in 100-ns ticks; schedule against playback start.
          const offsetMs = e.audioOffset / 10_000;
          const elapsed = playbackStart === null ? 0 : performance.now() - playbackStart;
          const timer = setTimeout(
            () => cb(e.textOffset, e.wordLength),
            Math.max(0, offsetMs - elapsed),
          );
          utterance.timers.push(timer);
        };

        synth.speakTextAsync(
          text,
          (result) => {
            if (result.reason === sdk.ResultReason.Canceled && active === utterance) {
              reject(new Error("TTS canceled")); // before stopSpeaking so reject wins
              stopSpeaking();
            }
            // Success: wait for player.onAudioEnd (audio keeps playing after synthesis).
          },
          (err) => {
            reject(new Error(String(err)));
            if (active === utterance) stopSpeaking();
          },
        );
      })
      .catch(reject);
  });
}

/** Browser-native TTS for UI cues (mode announcements, §7 rule 6) — not content. */
export function announce(text: string): void {
  try {
    speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  } catch {
    /* non-critical UI cue */
  }
}
