import { useEffect, useState } from 'react';
import { formatPartOfSpeech } from './library';
import { formatInterval, scheduleReview, type ReviewRating } from './srs';
import type { ReaderItem } from './types';

type Translate = (zh: string, en: string) => string;
type Props = {
  due: ReaderItem[];
  dueCount: number;
  newCount: number;
  language: 'zh-CN' | 'en';
  t: Translate;
  onRate: (item: ReaderItem, rating: ReviewRating) => Promise<void>;
  onOpen: (item: ReaderItem) => void;
  onGoLibrary: () => void;
};

const RATINGS: ReviewRating[] = ['again', 'hard', 'good', 'easy'];

function cloze(sentence: string, term: string) {
  if (!sentence || !term) return { before: sentence, match: '', after: '' };
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(escaped, 'i').exec(sentence);
  if (!match || match.index === undefined) return { before: sentence, match: '', after: '' };
  return { before: sentence.slice(0, match.index), match: match[0], after: sentence.slice(match.index + match[0].length) };
}

export function ReviewPage({ due, dueCount, newCount, language, t, onRate, onOpen, onGoLibrary }: Props) {
  const current = due[0];
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setRevealed(false); }, [current?.contextKey, current?.id]);

  if (!current) return <section className="review-page"><div className="review-empty"><span aria-hidden="true">✓</span><h2>{t('今天没有到期词。', 'Nothing due today.')}</h2><p>{t('新收藏的词会自动进入复习队列；明天再来，或者去生词库看看。', 'New words enter the review queue automatically. Come back tomorrow, or browse your vocabulary.')}</p><button className="primary-button" onClick={onGoLibrary}>{t('去生词库', 'Open vocabulary')}</button></div></section>;

  const term = current.lemma || current.selectedText;
  const parts = cloze(current.sourceSentence || current.context, term);
  const preview = (rating: ReviewRating) => formatInterval(scheduleReview(current, rating).intervalDays, language);

  return <section className="review-page">
    <div className="review-heading"><div><p className="eyebrow">{t('SPACED REPETITION', 'SPACED REPETITION')}</p><h2>{t('今日复习', 'Today’s review')}</h2><p>{t(`到期 ${dueCount} · 新词 ${newCount}`, `${dueCount} due · ${newCount} new`)}</p></div><span className="review-remaining">{t(`剩余 ${due.length}`, `${due.length} left`)}</span></div>
    <article className="review-card">
      <p className="review-kicker">{current.reviewCount ? t('到期复习', 'Due review') : t('新词', 'New word')}</p>
      <h3 className="review-word">{term}</h3>
      {current.phonetic && <p className="review-phonetic"><span aria-hidden="true">/</span>{current.phonetic.replace(/^\/|\/$/g, '')}<span aria-hidden="true">/</span></p>}
      {current.partOfSpeech && <p className="review-pos">{formatPartOfSpeech(current.partOfSpeech)}</p>}
      <blockquote className="review-sentence">{parts.before}<mark className={revealed ? 'is-revealed' : ''}>{revealed && parts.match ? parts.match : '_____'}</mark>{parts.after}</blockquote>
      {!revealed ? <button className="primary-button review-reveal" onClick={() => setRevealed(true)} disabled={busy}>{t('显示答案', 'Show answer')}</button> : <>
        <div className="review-answer"><p><strong>{formatPartOfSpeech(current.partOfSpeech)}</strong> {current.definition}</p>{current.translation && current.translation !== current.definition && <p>{current.translation}</p>}{current.explanation && <p className="review-explanation">{current.explanation}</p>}</div>
        <div className="review-ratings">{RATINGS.map((rating) => <button key={rating} className={`review-rating ${rating}`} disabled={busy} onClick={() => { setBusy(true); void onRate(current, rating).finally(() => setBusy(false)); }}><strong>{t({ again: '忘记', hard: '困难', good: '记得', easy: '简单' }[rating], { again: 'Again', hard: 'Hard', good: 'Good', easy: 'Easy' }[rating])}</strong><small>{preview(rating)}</small></button>)}</div>
      </>}
      <div className="review-footer"><button onClick={() => onOpen(current)}>{t('回到原文 ↗', 'Open source ↗')}</button></div>
    </article>
  </section>;
}
