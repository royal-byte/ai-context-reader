export type ReadingMode = 'word' | 'phrase' | 'sentence' | 'paragraph';
export type SelectionMode = ReadingMode | 'auto';
export type ExplanationLanguage = 'zh-CN' | 'en';
export type SavedLanguage = ExplanationLanguage | 'unknown';
export type MeaningRelation = 'specialization' | 'metaphor' | 'collocation' | 'register' | 'distinct';
export type ExpressionInfo = {
  text: string;
  type: 'phrasal_verb' | 'idiom' | 'collocation' | 'compound' | 'prepositional_phrase';
  selectedText: string;
  selectedRole?: string;
  confidence: 'high' | 'medium' | 'low';
};
export type CollectionKind = 'vocabulary' | 'excerpt';
export type LearningStatus = 'new' | 'reviewing' | 'mastered';
export type ContextKind = 'web' | 'pdf' | 'epub';
export type PdfAnchor = {
  version: 1;
  start: number;
  end: number;
  quote: string;
  prefix: string;
  suffix: string;
  selectionStart: number;
  selectionEnd: number;
};

/** Bounded, structured reading context sent with a selection. */
export type ContextPacket = {
  selection: string;
  sentence: string;
  previousSentence?: string;
  nextSentence?: string;
  paragraph?: string;
  heading?: string;
  sourceKind: ContextKind;
};

export type Explanation = {
  explanationLanguage?: SavedLanguage;
  relation?: MeaningRelation;
  bridge?: string;
  transfer?: string[];
  expression?: ExpressionInfo;
  mode?: ReadingMode;
  definition: string;
  translation: string;
  explanation: string;
  examples: string[];
  register?: string;
  lemma?: string;
  phonetic?: string;
  partOfSpeech?: string;
  usage?: string;
  structure?: string[];
  keyPoints?: string[];
  sentenceTranslation?: string;
};

export type ReaderItem = Explanation & {
  id?: number;
  uniqueKey: string;
  selectedText: string;
  context: string;
  sourceUrl: string;
  sourceTitle: string;
  createdAt: number;
  mode?: ReadingMode;
  sourceSentence?: string;
  kind?: CollectionKind;
  status?: LearningStatus;
  documentId?: string;
  pageNumber?: number;
  /** Indexed identity fields. Legacy rows get these during the Dexie v4 upgrade. */
  termKey?: string;
  contextKey?: string;
  variantKey?: string;
  sourcePosition?: string;
  pdfAnchor?: PdfAnchor;
  /** Only disambiguates pre-v6 rows that shared the same saved identity. */
  legacyVariantId?: string;
  /** Spaced-repetition schedule, shared by all contexts of a term. */
  dueAt?: number;
  intervalDays?: number;
  ease?: number;
  reviewCount?: number;
  lapseCount?: number;
  lastReviewedAt?: number;
  /** Optional plain-text note attached to this saved context. */
  note?: string;
};

export type ReadingDocument = {
  id: string; name: string; pageCount: number; currentPage: number;
  zoom: string; createdAt: number; lastOpenedAt: number;
  /** Optional for backward compatibility: older rows are PDFs. */
  kind?: 'pdf' | 'epub';
};
export type DocumentFile = { id: string; data: ArrayBuffer };
export type QueryHistory = { id?: number; text: string; sourceUrl: string; sourceTitle: string; pageNumber?: number; createdAt: number };
export type ExplanationCache = { key: string; explanation: Explanation; createdAt: number };

export type ApiSettings = { endpoint: string; apiKey: string; model: string; allowPrivateNetwork?: boolean };

export type AnalyzeRequest = {
  type: 'analyze'; text: string; context: string; sourceUrl: string; sourceTitle: string;
  mode?: SelectionMode; requestId?: string; explanationLanguage?: ExplanationLanguage;
  expressionPolicy?: 'auto' | 'word' | 'expression';
};
