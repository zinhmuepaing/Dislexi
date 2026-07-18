/**
 * TEMPORARY: substituting Huawei Cloud OCR with Azure AI Vision
 * (Image Analysis 4.0, "Read" feature, SYNCHRONOUS endpoint) until Huawei
 * Cloud access is confirmed.
 *
 * Swap target: lib/huawei-ocr.ts per ARCHITECTURE.md section 5.1.
 * Response contract must not change when swapped:
 *   { blocks: [{ text, confidence, box: [[x,y] x4] }] }
 *
 * Granularity note: Azure returns native word-level results
 * (readResult.blocks[].lines[].words[]), which is finer than Huawei's
 * line/phrase-level words_block_list. We deliberately emit ONE contract block
 * per Azure LINE so the client's nearest-block selection and proportional
 * word-splitting (ARCHITECTURE.md §5.1 gotcha 2, §7 rule 7) behave
 * identically with either vendor. Confidence = mean of the line's word
 * confidences (Azure lines carry no confidence of their own).
 *
 * Free tier (F0): 5,000 transactions/month, 20 requests/minute.
 */

export interface OcrWord {
  text: string;
  /** Four corner points, clockwise from top-left, in pixel coords of the submitted image. */
  box: [number, number][];
}

export interface OcrBlock {
  text: string;
  confidence: number;
  /** Four corner points, clockwise from top-left, in pixel coords of the submitted image. */
  box: [number, number][];
  /**
   * Word-level boxes for this line, when the vendor provides them (Azure
   * does; Huawei does not). Consumers use these for accurate word selection /
   * highlighting and fall back to proportional char-count splits when absent
   * (§5.1 gotcha 2, §7 rule 7). Additive to the contract — safe to ignore.
   */
  words?: OcrWord[];
}

interface AzureWord {
  text: string;
  boundingPolygon: { x: number; y: number }[];
  confidence: number;
}

interface AzureLine {
  text: string;
  boundingPolygon: { x: number; y: number }[];
  words: AzureWord[];
}

interface AzureReadResult {
  readResult?: {
    blocks?: { lines?: AzureLine[] }[];
  };
}

export async function recognizeText(imageBase64: string): Promise<{ blocks: OcrBlock[] }> {
  const endpoint = process.env.AZURE_VISION_ENDPOINT;
  const key = process.env.AZURE_VISION_KEY;
  if (!endpoint || !key) {
    throw new Error("AZURE_VISION_ENDPOINT / AZURE_VISION_KEY not configured");
  }

  // Client sends base64 without a data: prefix (same convention as the Huawei
  // contract); strip one defensively if present.
  const cleaned = imageBase64.replace(/^data:image\/\w+;base64,/, "");
  const body = Buffer.from(cleaned, "base64");

  const url = `${endpoint.replace(/\/$/, "")}/computervision/imageanalysis:analyze?api-version=2024-02-01&features=read`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "application/octet-stream",
    },
    body,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Azure Vision error ${res.status}: ${detail.slice(0, 500)}`);
  }

  const data = (await res.json()) as AzureReadResult;

  const blocks: OcrBlock[] = [];
  for (const azureBlock of data.readResult?.blocks ?? []) {
    for (const line of azureBlock.lines ?? []) {
      const words = line.words ?? [];
      const confidence =
        words.length > 0
          ? words.reduce((sum, w) => sum + (w.confidence ?? 0), 0) / words.length
          : 0;
      blocks.push({
        text: line.text,
        confidence: Number(confidence.toFixed(4)),
        box: (line.boundingPolygon ?? []).map((p) => [p.x, p.y] as [number, number]),
        words: words.map((w) => ({
          text: w.text,
          box: (w.boundingPolygon ?? []).map((p) => [p.x, p.y] as [number, number]),
        })),
      });
    }
  }

  return { blocks };
}
