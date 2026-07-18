"use client";

/**
 * Continuous speech-to-text (Azure Speech SDK) — the "endless mic".
 *
 * One tap on the mic chip starts continuous recognition that runs until the
 * mic is toggled off or the session ends. The SDK's built-in endpointing IS
 * the silence buffer: each `recognized` event delivers one finalized
 * utterance chunk after the speaker goes quiet, and listening continues in
 * the background — chunk-by-chunk, endlessly.
 *
 * PRIVACY (§7 rule 8): audio streams to the recognizer and is never stored —
 * no MediaRecorder, no buffers, no uploads. Only transcript strings reach
 * the app (and only typed events ever reach Supabase).
 *
 * Fallback: webkitSpeechRecognition (continuous) when the Azure SDK can't
 * start (§9.5 — and pointing/typing always work without any mic).
 */

import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import { getSpeechToken } from "@/lib/speech";

export interface VoiceListener {
  /** "azure" | "webkit" — which engine ended up running. */
  engine: "azure" | "webkit";
  stop: () => void;
}

export interface VoiceListenerOptions {
  /** One finalized utterance per silence-terminated chunk. */
  onUtterance: (text: string) => void;
  /** Listening-state changes (start/stop/error). */
  onState?: (listening: boolean) => void;
  lang?: string;
}

interface WebkitRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult:
    | ((event: {
        resultIndex: number;
        results: { [i: number]: { [j: number]: { transcript: string }; isFinal: boolean }; length: number };
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

async function startAzure(opts: VoiceListenerOptions): Promise<VoiceListener> {
  const { token, region } = await getSpeechToken();
  const config = sdk.SpeechConfig.fromAuthorizationToken(token, region);
  config.speechRecognitionLanguage = opts.lang ?? "en-SG";

  const audio = sdk.AudioConfig.fromDefaultMicrophoneInput();
  const recognizer = new sdk.SpeechRecognizer(config, audio);
  let stopped = false;

  recognizer.recognized = (_, e) => {
    if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
      const text = e.result.text.trim();
      if (text) opts.onUtterance(text);
    }
  };
  recognizer.canceled = async (_, e) => {
    if (stopped) return;
    // Token expiry / transient network: refresh the token and keep going.
    if (e.reason === sdk.CancellationReason.Error) {
      try {
        const fresh = await getSpeechToken();
        recognizer.authorizationToken = fresh.token;
        recognizer.startContinuousRecognitionAsync(
          () => opts.onState?.(true),
          () => opts.onState?.(false),
        );
        return;
      } catch {
        /* fall through to stopped state */
      }
    }
    opts.onState?.(false);
  };
  recognizer.sessionStopped = () => {
    if (!stopped) opts.onState?.(false);
  };

  await new Promise<void>((resolve, reject) => {
    recognizer.startContinuousRecognitionAsync(resolve, (err) => reject(new Error(String(err))));
  });
  opts.onState?.(true);

  return {
    engine: "azure",
    stop: () => {
      stopped = true;
      recognizer.stopContinuousRecognitionAsync(
        () => {
          recognizer.close();
          opts.onState?.(false);
        },
        () => {
          try {
            recognizer.close();
          } catch {
            /* already closed */
          }
          opts.onState?.(false);
        },
      );
    },
  };
}

function startWebkit(opts: VoiceListenerOptions): VoiceListener {
  const Ctor = (window as unknown as { webkitSpeechRecognition?: new () => WebkitRecognitionLike })
    .webkitSpeechRecognition;
  if (!Ctor) throw new Error("no speech recognition available");

  const rec = new Ctor();
  let stopped = false;
  rec.continuous = true;
  rec.interimResults = false; // finals only — one utterance per silence
  rec.lang = opts.lang ?? "en-SG";
  rec.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (!event.results[i].isFinal) continue;
      const text = event.results[i][0]?.transcript.trim() ?? "";
      if (text) opts.onUtterance(text);
    }
  };
  rec.onerror = () => opts.onState?.(false);
  rec.onend = () => {
    if (!stopped) {
      try {
        rec.start(); // keep listening across the engine's auto-stops
      } catch {
        opts.onState?.(false);
      }
    }
  };
  rec.start();
  opts.onState?.(true);

  return {
    engine: "webkit",
    stop: () => {
      stopped = true;
      rec.stop();
      opts.onState?.(false);
    },
  };
}

/** Start the endless mic: Azure first, webkit fallback. Throws if neither works. */
export async function startVoiceListener(opts: VoiceListenerOptions): Promise<VoiceListener> {
  try {
    return await startAzure(opts);
  } catch (err) {
    console.warn("Azure STT unavailable, falling back to webkitSpeechRecognition:", err);
    return startWebkit(opts);
  }
}
