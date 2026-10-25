export type DictionarySense = {
  pos: string;
  definition: string;
  definitionEn?: string;
  phonetic?: string;
};

export type DictionaryEntry = {
  word: string;
  phonetic: string;
  translation: string;
  definitionEn?: string;
  englishSenses?: DictionarySense[];
  partOfSpeech?: string;
  senses?: DictionarySense[];
};

/** A fallback is useful only when the model confirms the same lexical word and POS. */
export function selectionDictionary(entry: DictionaryEntry | undefined, text: string, result?: { lemma?: string; partOfSpeech?: string }) {
  if (!entry) return undefined;
  const exact = normalizeDictionaryWord(entry.word) === normalizeDictionaryWord(text);
  const pos = (value: string) => value.toLowerCase().replace(/\.$/, '').replace(/^(vt|vi)$/, 'v').replace(/^a$/, 'adj');
  const matches = (sense: DictionarySense) => Boolean(result?.partOfSpeech && pos(sense.pos) === pos(result.partOfSpeech));
  const allSenses = entry.senses ?? parseDictionarySenses(entry.translation, entry.partOfSpeech);
  const allEnglishSenses = entry.englishSenses ?? (entry.definitionEn ? parseDictionarySenses(entry.definitionEn, entry.partOfSpeech) : []);
  if (exact) return !result?.partOfSpeech || [...allSenses, ...allEnglishSenses].some(matches) || [...allSenses, ...allEnglishSenses].every((sense) => !sense.pos) ? entry : undefined;
  if (!result?.lemma || normalizeDictionaryWord(entry.word) !== normalizeDictionaryWord(result.lemma)) return undefined;
  const senses = allSenses.filter(matches);
  const englishSenses = allEnglishSenses.filter(matches);
  if (!senses.length && !englishSenses.length) return undefined;
  const withoutPronunciation = (sense: DictionarySense) => ({ ...sense, phonetic: undefined });
  return { ...entry, phonetic: '', partOfSpeech: result.partOfSpeech, senses: senses.map(withoutPronunciation), englishSenses: englishSenses.map(withoutPronunciation), translation: senses.map((sense) => sense.definition).join('；'), definitionEn: englishSenses.map((sense) => sense.definition).join('; ') };
}

let entries: Promise<Map<string, DictionaryEntry>> | undefined;

const POS_PREFIX = /^(n|v|vt|vi|adj|adv|pron|prep|conj|art|num|aux|int|interj|a|ad)\.\s*/i;
const POS_NORMALIZE: Record<string, string> = {
  n: 'n.', v: 'v.', vt: 'vt.', vi: 'vi.', adj: 'adj.', adv: 'adv.',
  pron: 'pron.', prep: 'prep.', conj: 'conj.', art: 'art.', num: 'num.',
  aux: 'aux.', int: 'interj.', interj: 'interj.', a: 'adj.', ad: 'adv.'
};

const HETERONYMS: Record<string, Record<string, string>> = {
  record: { n: '/ˈrekərd/', v: '/rɪˈkɔːrd/', vt: '/rɪˈkɔːrd/', vi: '/rɪˈkɔːrd/' },
  present: { n: '/ˈprezənt/', adj: '/ˈprezənt/', v: '/prɪˈzent/', vt: '/prɪˈzent/', vi: '/prɪˈzent/' },
  produce: { n: '/ˈproʊduːs/', v: '/prəˈduːs/', vt: '/prəˈduːs/', vi: '/prəˈduːs/' },
  object: { n: '/ˈɑːbdʒekt/', v: '/əbˈdʒekt/', vi: '/əbˈdʒekt/', vt: '/əbˈdʒekt/' },
  project: { n: '/ˈprɑːdʒekt/', v: '/prəˈdʒekt/', vt: '/prəˈdʒekt/' },
  permit: { n: '/ˈpɜːrmɪt/', v: '/pərˈmɪt/', vt: '/pərˈmɪt/' },
  refuse: { n: '/ˈrefjuːs/', v: '/rɪˈfjuːz/', vt: '/rɪˈfjuːz/' },
  increase: { n: '/ˈɪŋkriːs/', v: '/ɪnˈkriːs/', vt: '/ɪnˈkriːs/' },
  decrease: { n: '/ˈdiːkriːs/', v: '/dɪˈkriːs/', vt: '/dɪˈkriːs/' },
  export: { n: '/ˈekspɔːrt/', v: '/ɪkˈspɔːrt/', vt: '/ɪkˈspɔːrt/' },
  import: { n: '/ˈɪmpɔːrt/', v: '/ɪmˈpɔːrt/', vt: '/ɪmˈpɔːrt/' },
  contract: { n: '/ˈkɑːntrækt/', v: '/kənˈtrækt/', vt: '/kənˈtrækt/' },
  subject: { n: '/ˈsʌbdʒekt/', adj: '/ˈsʌbdʒekt/', v: '/səbˈdʒekt/', vt: '/səbˈdʒekt/' },
  minute: { n: '/ˈmɪnɪt/', v: '/ˈmɪnɪt/', vt: '/ˈmɪnɪt/', adj: '/maɪˈnuːt/' },
  perfect: { n: '/ˈpɜːrfɪkt/', adj: '/ˈpɜːrfɪkt/', v: '/pərˈfekt/', vt: '/pərˈfekt/' },
  use: { n: '/juːs/', v: '/juːz/', vt: '/juːz/' },
  abuse: { n: '/əˈbjuːs/', v: '/əˈbjuːz/', vt: '/əˈbjuːz/' },
  house: { n: '/haʊs/', v: '/haʊz/', vt: '/haʊz/' },
  live: { adj: '/laɪv/', adv: '/laɪv/', v: '/lɪv/', vi: '/lɪv/' },
  separate: { adj: '/ˈsepərət/', v: '/ˈsepəreɪt/', vt: '/ˈsepəreɪt/' },
  frequent: { adj: '/ˈfriːkwənt/', v: '/frɪˈkwent/', vt: '/frɪˈkwent/' }
};

const normalizePos = (value: string) => POS_NORMALIZE[value.toLowerCase().replace(/\.$/, '')] ?? value;

const firstPos = (partOfSpeech?: string) => {
  const token = partOfSpeech?.split(/[\/,，;；|]+/).map((part) => part.trim()).find(Boolean);
  return token ? normalizePos(token) : '';
};

/** Parse ECDICT's one-line translation into a small, POS-grouped list. */
export function parseDictionarySenses(translation: string, partOfSpeech?: string): DictionarySense[] {
  const chunks = translation.replace(/\\n/g, '\n').split(/[;\n]/).map((part) => part.trim()).filter(Boolean);
  const fallbackPos = firstPos(partOfSpeech);
  let currentPos = fallbackPos;
  const senses: DictionarySense[] = [];
  for (const chunk of chunks) {
    const match = chunk.match(POS_PREFIX);
    let pos = currentPos;
    let definition = chunk;
    if (match) {
      pos = normalizePos(match[1]!);
      definition = stripDictionaryPos(definition);
      currentPos = pos;
    } else if (/^\[[^\]]+\]/.test(chunk)) {
      // Domain labels such as [计], [医], [网络] are usually noun glosses.
      pos = /(^|\s)n\./i.test(partOfSpeech ?? '') ? 'n.' : currentPos;
      definition = chunk.replace(/^\[[^\]]+\]\s*/, '').trim();
    }
    if (!definition) continue;
    const existing = senses.find((sense) => sense.pos === pos);
    if (existing) existing.definition = `${existing.definition}；${definition}`;
    else senses.push({ pos, definition });
    if (senses.length >= 6) break;
  }
  return senses.length ? senses : [{ pos: fallbackPos, definition: stripDictionaryPos(translation) }];
}

export function normalizeDictionaryWord(value: string) {
  return value.toLowerCase().replace(/[^a-z'-]/g, '').replace(/^'+|'+$/g, '');
}

/** Remove leading dictionary POS prefixes when the UI already renders one. */
export function stripDictionaryPos(value: string) {
  let result = value.trim();
  let previous = '';
  while (result && result !== previous) {
    previous = result;
    result = result.replace(POS_PREFIX, '').replace(/^[/,，;；|]\s*/, '').trim();
  }
  return result;
}

/** Strip POS labels from each gloss, including legacy multi-sense saved strings. */
export function stripDefinitionPos(value: string) {
  return value.split(/[;；]/).map((part) => stripDictionaryPos(part.trim())).filter(Boolean).join('；');
}

/** Compare exact dictionary glosses for safe de-duplication; not a semantic merge. */
export function normalizeDictionaryGloss(value: string) {
  return stripDictionaryPos(value)
    .replace(/\[[^\]]+\]/g, '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[\s，,；;。.!?、]/g, '')
    .toLowerCase();
}

export function dictionaryPhonetic(word: string, pos: string) {
  const map = HETERONYMS[word];
  return map?.[pos.toLowerCase().replace(/\.$/, '')];
}

function withPhonetics(word: string, senses: DictionarySense[]) {
  return senses.map((sense) => {
    const phonetic = dictionaryPhonetic(word, sense.pos);
    return phonetic ? { ...sense, phonetic } : sense;
  });
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
    .then((rows) => new Map(rows.map(([word, phonetic, translation, partOfSpeech, definitionEn]) => {
      const normalizedPart = partOfSpeech || undefined;
      const senses = withPhonetics(word!, parseDictionarySenses(translation ?? '', normalizedPart));
      return [word!, {
        word: word!, phonetic: phonetic ?? '', translation: translation ?? '', partOfSpeech: normalizedPart, senses,
        definitionEn: definitionEn || undefined,
        englishSenses: definitionEn ? withPhonetics(word!, parseDictionarySenses(definitionEn, normalizedPart).map((sense) => ({ ...sense, definitionEn: sense.definition }))) : []
      }];
    })))
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
