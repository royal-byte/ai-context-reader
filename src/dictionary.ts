export type DictionaryEntry = {
  word: string;
  phonetic: string;
  translation: string;
  partOfSpeech?: string;
};

let entries: Promise<Map<string, DictionaryEntry>> | undefined;

export function normalizeDictionaryWord(value: string) {
  return value.toLowerCase().replace(/[^a-z'-]/g, '').replace(/^'+|'+$/g, '');
}

/** Conservative fallbacks for common inflections; never invent a definition. */
export function dictionaryCandidates(word: string) {
  const base = normalizeDictionaryWord(word);
  if (!base) return [];
  const candidates = [base];
  const add = (value: string) => { if (value && !candidates.includes(value)) candidates.push(value); };
  if (base.endsWith("'s")) add(base.slice(0, -2));
  if (base.endsWith('ies')) add(`${base.slice(0, -3)}y`);
  if (base.endsWith('ied')) add(`${base.slice(0, -3)}y`);
  if (base.endsWith('ves')) add(`${base.slice(0, -3)}f`);
  if (base.endsWith('es')) add(base.slice(0, -2));
  if (base.endsWith('s')) add(base.slice(0, -1));
  if (base.endsWith('ing')) {
    const stem = base.slice(0, -3);
    add(stem); add(`${stem}e`);
    if (/([b-df-hj-np-tv-z])\1$/.test(stem)) add(stem.slice(0, -1));
  }
  if (base.endsWith('ed')) {
    const stem = base.slice(0, -2);
    add(stem); add(base.slice(0, -1));
    if (/([b-df-hj-np-tv-z])\1$/.test(stem)) add(stem.slice(0, -1));
  }
  if (base.endsWith('ly')) add(base.slice(0, -2));
  if (base.endsWith('er')) add(base.slice(0, -2));
  if (base.endsWith('est')) add(base.slice(0, -3));
  return candidates;
}

export function loadDictionary() {
  if (entries) return entries;
  entries = fetch(chrome.runtime.getURL('/dictionary/ecdict.json'))
    .then((response) => {
      if (!response.ok) throw new Error('Dictionary unavailable.');
      return response.json() as Promise<string[][]>;
    })
    .then((rows) => new Map(rows.map(([word, phonetic, translation, partOfSpeech]) => [word!, {
      word: word!, phonetic: phonetic ?? '', translation: translation ?? '', partOfSpeech: partOfSpeech || undefined
    }])))
    .catch((error) => { entries = undefined; throw error; });
  return entries;
}

export async function lookupWord(value: string) {
  const dictionary = await loadDictionary();
  for (const candidate of dictionaryCandidates(value)) {
    const entry = dictionary.get(candidate);
    if (entry) return entry;
  }
  return undefined;
}
