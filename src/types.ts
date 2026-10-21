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
};

export type ReadingDocument = {
  id: string; name: string; pageCount: number; currentPage: number;
  zoom: string; createdAt: number; lastOpenedAt: number;
};
export type DocumentFile = { id: string; data: ArrayBuffer };

export type ApiSettings = { endpoint: string; apiKey: string; model: string };

export type AnalyzeRequest = {
  type: 'analyze'; text: string; context: string; sourceUrl: string; sourceTitle: string;
  mode?: ReadingMode;
};
