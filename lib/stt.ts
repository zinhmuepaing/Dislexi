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
  /**
   * Listening stopped for a reason the student did not ask for. Without this
   * the mic simply un-toggled itself: `onState(false)` is indistinguishable
   * from the student switching it off, so a dead engine looked like a dead
   * button and nothing anywhere said why.
   */
  onFailure?: (message: string) => void;
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

/** How long to wait for the recognizer to connect before giving up on it. */
const START_TIMEOUT_MS = 8000;

/** Everything Azure knows about why it hung up, for the console. */
function describeCancellation(e: sdk.SpeechRecognitionCanceledEventArgs): string {
  const reason = sdk.CancellationReason[e.reason] ?? String(e.reason);
  const code = e.errorCode ? (sdk.CancellationErrorCode[e.errorCode] ?? String(e.errorCode)) : "—";
  return `reason=${reason} code=${code} details=${e.errorDetails || "(none)"}`;
}

/** The same thing in one sentence a student (or a teammate) can act on. */
function cancellationMessage(e: sdk.SpeechRecognitionCanceledEventArgs): string {
  const details = e.errorDetails ?? "";
  switch (e.errorCode) {
    case sdk.CancellationErrorCode.AuthenticationFailure:
      return "Voice input was rejected by the speech service (key or region).";
    case sdk.CancellationErrorCode.Forbidden:
    case sdk.CancellationErrorCode.TooManyRequests:
      // F0 allows ONE speech-to-text request at a time and a monthly quota.
      return "The speech service refused voice input — its free-tier limit may be used up.";
    case sdk.CancellationErrorCode.ConnectionFailure:
    case sdk.CancellationErrorCode.ServiceTimeout:
    case sdk.CancellationErrorCode.ServiceError:
      return "Lost connection to the speech service.";
    default:
      if (/quota|exceeded|throttl/i.test(details)) {
        return "The speech service refused voice input — its free-tier limit may be used up.";
      }
      if (/permission|denied|NotAllowed/i.test(details)) return "Microphone permission is blocked.";
      return "Voice input stopped unexpectedly.";
  }
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
  // ONE retry, not an open loop. The old handler restarted on every error and
  // announced `onState(true)` each time, so a persistently failing recognizer
  // (an exhausted free tier, a second recognizer holding the only F0 slot)
  // made the mic button flicker on/off indefinitely instead of reporting.
  let retried = false;
  recognizer.canceled = async (_, e) => {
    if (stopped) return;
    console.error("Azure STT canceled —", describeCancellation(e));

    // Token expiry / transient network: refresh the token and try once more.
    if (e.reason === sdk.CancellationReason.Error && !retried) {
      retried = true;
      try {
        const fresh = await getSpeechToken();
        recognizer.authorizationToken = fresh.token;
        recognizer.startContinuousRecognitionAsync(
          () => opts.onState?.(true),
          (err) => {
            console.error("Azure STT restart failed —", String(err));
            opts.onState?.(false);
            opts.onFailure?.(cancellationMessage(e));
          },
        );
        return;
      } catch (err) {
        console.error("Azure STT token refresh failed —", String(err));
      }
    }
    opts.onState?.(false);
    opts.onFailure?.(cancellationMessage(e));
  };
  recognizer.sessionStopped = () => {
    // `stopped` is only set by our own stop(), so reaching here otherwise means
    // the service hung up on its own. THIS is the silent path that made the mic
    // appear to un-toggle itself: it flipped the button back to off and said
    // nothing, because a session ending looked identical to the student
    // switching the mic off.
    if (stopped) return;
    console.error("Azure STT session stopped unexpectedly");
    opts.onState?.(false);
    opts.onFailure?.("Voice input stopped — the speech service ended the session.");
  };

  // Bounded start. The SDK retries a failing websocket internally and can sit
  // there for a long time without firing `canceled` or `sessionStopped`, so the
  // await never settled: the mic chip stayed off, taps did nothing, and there
  // was no error to show. Failing fast is what makes the button honest.
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      stopped = true; // silence the handlers; we are reporting this ourselves
      try {
        recognizer.close();
      } catch {
        /* already closed */
      }
      reject(new Error("speech service did not connect in time"));
    }, START_TIMEOUT_MS);
    recognizer.startContinuousRecognitionAsync(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (err) => {
        clearTimeout(timer);
        reject(new Error(String(err)));
      },
    );
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
  rec.onerror = () => {
    console.error("webkitSpeechRecognition error");
    opts.onState?.(false);
    opts.onFailure?.("Voice input stopped — check the microphone permission for this site.");
  };
  rec.onend = () => {
    if (!stopped) {
      try {
        rec.start(); // keep listening across the engine's auto-stops
      } catch (err) {
        console.error("webkitSpeechRecognition restart failed —", String(err));
        opts.onState?.(false);
        opts.onFailure?.("Voice input stopped unexpectedly.");
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

/**
 * Short, user-facing reason the mic could not start. The mic silently flipping
 * itself back to off is indistinguishable from a broken button, so whatever the
 * cause, the student (and whoever is debugging) gets told which one it was.
 */
export function micUnavailableMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/did not connect in time/i.test(msg)) return "Couldn't reach the speech service.";
  if (/not configured/i.test(msg)) return "Voice input isn't set up on the server yet.";
  if (/azure-token 4\d\d/.test(msg)) return "Voice input was refused by the speech service.";
  if (/azure-token \d\d\d/.test(msg)) return "The speech service is unavailable right now.";
  if (/not-?allowed|permission|denied/i.test(msg)) return "Microphone permission is blocked.";
  if (/not-?found|no microphone|no audio/i.test(msg)) return "No microphone was found.";
  return "Mic unavailable.";
}

/** Start the endless mic: Azure first, webkit fallback. Throws if neither works. */
export async function startVoiceListener(opts: VoiceListenerOptions): Promise<VoiceListener> {
  let azureErr: unknown;
  try {
    return await startAzure(opts);
  } catch (err) {
    azureErr = err;
    console.warn("Azure STT unavailable, falling back to webkitSpeechRecognition:", err);
  }
  try {
    return startWebkit(opts);
  } catch (webkitErr) {
    console.warn("webkitSpeechRecognition unavailable:", webkitErr);
    // Report the AZURE reason, not the fallback's: "no speech recognition
    // available" says nothing about why the real engine failed.
    throw new Error(micUnavailableMessage(azureErr));
  }
}
