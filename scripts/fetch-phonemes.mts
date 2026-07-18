/**
 * Phoneme bank curation (IMPLEMENTATION_PLAN Phase 4.3).
 * Run: npx tsx scripts/fetch-phonemes.mts
 *
 * Downloads CC-licensed IPA recordings from Wikimedia Commons into
 * public/phonemes/{id}.mp3 (Commons serves an .mp3 transcode of each .ogg —
 * needed because iOS Safari cannot play ogg) and rewrites ATTRIBUTIONS.md
 * from the API's license metadata. Files it cannot resolve are reported as
 * SELF-RECORD GAP-FILL — never TTS (§7 rule 4).
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";

/** phonemeId (see lib/graphemes.ts) → Commons file title. Diphthongs are
 * mostly absent from Commons' IPA sets and land in gap-fill. */
const SOURCES: Record<string, string> = {
  b: "Voiced bilabial plosive.ogg",
  d: "Voiced alveolar plosive.ogg",
  f: "Voiceless labiodental fricative.ogg",
  g: "Voiced velar plosive.ogg",
  h: "Voiceless glottal fricative.ogg",
  j: "Voiced postalveolar affricate.ogg",
  k: "Voiceless velar plosive.ogg",
  l: "Alveolar lateral approximant.ogg",
  m: "Bilabial nasal.ogg",
  n: "Alveolar nasal.ogg",
  ng: "Velar nasal.ogg",
  p: "Voiceless bilabial plosive.ogg",
  r: "Alveolar approximant.ogg",
  s: "Voiceless alveolar sibilant.ogg",
  t: "Voiceless alveolar plosive.ogg",
  v: "Voiced labiodental fricative.ogg",
  w: "Voiced labio-velar approximant.ogg",
  y: "Palatal approximant.ogg",
  z: "Voiced alveolar sibilant.ogg",
  th: "Voiceless dental fricative.ogg",
  th_voiced: "Voiced dental fricative.ogg",
  sh: "Voiceless palato-alveolar sibilant.ogg",
  ch: "Voiceless palato-alveolar affricate.ogg",
  zh: "Voiced palato-alveolar sibilant.ogg",
  a: "Near-open front unrounded vowel.ogg",
  e: "Open-mid front unrounded vowel.ogg",
  i: "Near-close near-front unrounded vowel.ogg",
  o: "Open back rounded vowel.ogg",
  u: "Open-mid back unrounded vowel.ogg",
  ee: "Close front unrounded vowel.ogg",
  oo_long: "Close back rounded vowel.ogg",
  oo_short: "Near-close near-back rounded vowel.ogg",
  ar: "Open back unrounded vowel.ogg",
  or: "Open-mid back rounded vowel.ogg",
  ur: "Open-mid central unrounded vowel.ogg",
  schwa: "Mid-central vowel.ogg",
  // Diphthongs (2026-07-17): Commons' IPA demo sets skip diphthongs, but two
  // isolated Lingua Libre recordings exist, and the rest are covered by real
  // human recordings of words whose ENTIRE pronunciation is the pure diphthong
  // (non-rhotic UK/RP: "I" = /aɪ/, "oh" = /əʊ/, "oi" = /ɔɪ/, "ear" = /ɪə/,
  // letter "a" = /eɪ/). Still §7-rule-4 compliant — human recordings, never
  // TTS. LISTEN-VERIFY each before shipping (see ATTRIBUTIONS note): the "a"
  // recording especially could be the weak form /ə/ rather than /eɪ/.
  ae: "En-uk-a.ogg", // /eɪ/ as in rain — letter/article "a" strong form; VERIFY not /ə/
  igh: "En-uk-I.ogg", // /aɪ/ as in night — the word "I"
  oa: "En-uk-oh.ogg", // /əʊ/ as in boat — the word "oh"
  ow: "LL-Q1860 (eng)-Pvanp7-aʊ (diphthong).wav", // /aʊ/ as in cow — isolated
  oi: "En-uk-oi.ogg", // /ɔɪ/ as in coin — the interjection "oi"
  air: "LL-Q1860 (eng)-Pvanp7-ɛə (diphthong).wav", // /eə/ as in chair — isolated
  ear: "En-uk-ear.ogg", // /ɪə/ as in dear — the word "ear" (non-rhotic UK)
};

interface ImageInfo {
  url: string;
  descriptionurl: string;
  extmetadata?: Record<string, { value: string }>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Commons rate-limits anonymous bursts hard (429) — pace requests and back off. */
async function politeFetch(url: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": "dislexi-phoneme-curation/1.0" } });
    if ((res.status !== 429 && res.status !== 503) || attempt >= 3) return res;
    const retryAfter = Number(res.headers.get("retry-after")) || 0;
    const delay = Math.max(retryAfter * 1000, 5000 * 3 ** attempt);
    console.warn(`  ${res.status} — backing off ${Math.round(delay / 1000)}s`);
    await sleep(delay);
  }
}

async function commonsInfo(title: string): Promise<ImageInfo | null> {
  const api =
    "https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo" +
    "&iiprop=url|extmetadata&titles=" +
    encodeURIComponent(`File:${title}`);
  const res = await politeFetch(api);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    query?: { pages?: Record<string, { imageinfo?: ImageInfo[] }> };
  };
  const pages = Object.values(data.query?.pages ?? {});
  return pages[0]?.imageinfo?.[0] ?? null;
}

/** upload.wikimedia.org/wikipedia/commons/x/xy/N.ogg → …/transcoded/x/xy/N.ogg/N.ogg.mp3 */
function mp3TranscodeUrl(oggUrl: string): string {
  const name = oggUrl.split("/").pop()!;
  return oggUrl.replace("/wikipedia/commons/", "/wikipedia/commons/transcoded/") + `/${name}.mp3`;
}

const outDir = path.join(process.cwd(), "public", "phonemes");
const rows: string[] = [];
const missing: string[] = [];

for (const [id, title] of Object.entries(SOURCES)) {
  if (!title) {
    missing.push(id);
    continue;
  }
  try {
    await sleep(1500); // Wikimedia etiquette: ~1 req/s for anonymous clients
    const info = await commonsInfo(title);
    if (!info) throw new Error("not found on Commons");
    const mp3 = await politeFetch(mp3TranscodeUrl(info.url));
    if (!mp3.ok) throw new Error(`mp3 transcode ${mp3.status}`);
    await writeFile(path.join(outDir, `${id}.mp3`), Buffer.from(await mp3.arrayBuffer()));
    const meta = info.extmetadata ?? {};
    const license = meta.LicenseShortName?.value ?? "unknown — verify manually";
    const author = (meta.Artist?.value ?? "unknown").replace(/<[^>]*>/g, "").trim();
    rows.push(`| ${id}.mp3 | ${title} | ${author} | ${info.descriptionurl} | ${license} |`);
    console.log(`ok      ${id}.mp3  (${license})`);
  } catch (err) {
    missing.push(id);
    console.warn(`MISSING ${id}: ${String(err)}`);
  }
}

const attributions = `# Phoneme bank attributions

Sourced from Wikimedia Commons IPA recordings (mp3 transcodes served by
Commons). Each file's license below was read from the Commons API at download
time — verify before shipping. Gap-fill files are self-recorded (CC0).

Diphthongs (ae/igh/oa/oi/ear) are human recordings of words whose entire
pronunciation IS the pure diphthong (non-rhotic UK: "a" /eɪ/, "I" /aɪ/,
"oh" /əʊ/, "oi" /ɔɪ/, "ear" /ɪə/); air/ow are isolated Lingua Libre
recordings. LISTEN-VERIFY each diphthong before shipping — especially ae
("a" must be the strong form /eɪ/, not the weak /ə/).

| File | Commons source file | Author | Source page | License |
|---|---|---|---|---|
${rows.join("\n")}

## Self-record gap-fill needed (no Commons IPA recording)

${missing.map((id) => `- ${id}.mp3`).join("\n") || "_none_"}

Note: isolated-phoneme playback must NEVER fall back to TTS (§7 rule 4). The
autopsy sweep skips missing files after 400 ms until they are recorded.
`;
await writeFile(path.join(outDir, "ATTRIBUTIONS.md"), attributions);
console.log(`\n${rows.length} downloaded, ${missing.length} gap-fill: ${missing.join(", ")}`);
