export type ReadingMode = 'word' | 'phrase' | 'sentence' | 'paragraph';
export type CollectionKind = 'vocabulary' | 'excerpt';
export type LearningStatus = 'new' | 'reviewing' | 'mastered';

export type Explanation = {
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
  /** Spaced-repetition schedule, shared by all contexts of a term. */
  dueAt?: number;
  intervalDays?: number;
  ease?: number;
  reviewCount?: number;
  lapseCount?: number;
  lastReviewedAt?: number;
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
  mode?: ReadingMode; requestId?: string;
};
