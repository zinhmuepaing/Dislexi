/**
 * Server-side Supabase client (service-role key). Per ARCHITECTURE.md §5.6:
 * server-side access ONLY — this module must never be imported from client
 * code, and SUPABASE_SERVICE_ROLE_KEY never reaches the browser.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!_client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured");
    }
    _client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _client;
}

export type SessionMode = "exam_prep" | "tutoring" | "autopsy";

export type EventType =
  | "read"
  | "reread"
  | "stuck_word"
  | "autopsy_soundout"
  | "trace_complete"
  | "tutor_question"
  | "quiz_result";

export interface SessionEvent {
  type: EventType;
  word?: string;
  grapheme?: string;
  question_ref?: string;
  payload?: Record<string, unknown>;
  /** Client-side timestamp (ISO). Optional — DB defaults ts to now(). */
  ts?: string;
}
