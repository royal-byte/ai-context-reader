const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;

/**
 * A cheap local language gate for an English-learning reader. It is not a
 * general language detector: it only rejects selections that are clearly not
 * Latin-script English (Chinese, Japanese, Korean, Cyrillic, numbers-only).
 */
export function isLikelyEnglish(text: string) {
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  if (!letters) return false;
  const latin = text.match(/\p{Script=Latin}/gu)?.length ?? 0;
  if (!latin) return false;
  const cjk = text.match(CJK)?.length ?? 0;
  if (cjk >= latin) return false;
  return latin / letters >= 0.6;
}
