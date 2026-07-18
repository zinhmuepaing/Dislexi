/** Minimal typings for the hyphenation libs (no @types packages exist). */

declare module "hypher" {
  export default class Hypher {
    constructor(language: unknown);
    /** Splits one word at its hyphenation points, e.g. "awards" → ["a","wards"]. */
    hyphenate(word: string): string[];
  }
}

declare module "hyphenation.en-us" {
  const patterns: unknown;
  export default patterns;
}
