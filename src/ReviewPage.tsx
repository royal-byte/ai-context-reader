import { useEffect, useState } from 'react';
import { formatPartOfSpeech, itemTerm, savedLanguage } from './library';
import { formatInterval, reviewSnapshot, scheduleReview, type ReviewRating, type ReviewSchedule, type ReviewSnapshot } from './srs';
import type { ReaderItem } from './types';

type Translate = (zh: string, en: string) => string;
type Props = {
  due: ReaderItem[];
  dueCount: number;
  dueTotal?: number;
  newCount: number;
  newTotal?: number;
  language: 'zh-CN' | 'en';
  t: Translate;
  onRate: (item: ReaderItem, rating: ReviewRating) => Promise<ReviewSchedule | void>;
  onUndo?: (item: ReaderItem, snapshot: ReviewSnapshot) => Promise<void>;
  onOpen: (item: ReaderItem) => void;
  onGoLibrary: () => void;
  onRestart?: () => void;
};
type Counts = Record<ReviewRating, number>;
type UndoEntry = { queue: ReaderItem[]; completed: number; counts: Counts; item: ReaderItem; snapshot: ReviewSnapshot };

const RATINGS: ReviewRating[] = ['again', 'hard', 'good', 'easy'];
const LABELS: Record<ReviewRating, [string, string]> = {
  again: ['没想起来', 'Again'],
  hard: ['很费劲', 'Hard'],
  good: ['想起来了', 'Good'],
  easy: ['太容易', 'Easy']
};
const HINTS: Record<ReviewRating, [string, string]> = {
  again: ['本次再练', 'again this session'],
  hard: ['之后增长慢', 'grows slowly'],
  good: ['之后正常', 'normal growth'],
  easy: ['之后更快', 'grows faster']
};
const EMPTY_COUNTS: Counts = { again: 0, hard: 0, good: 0, easy: 0 };

function cloze(sentence: string, terms: string[]) {
  if (!sentence) return { before: '', match: '', after: '' };
  for (const term of terms) {
    if (!term) continue;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`(^|[^\\p{L}\\p{N}])(${escaped})(?=$|[^\\p{L}\\p{N}])`, 'iu').exec(sentence);
    if (!match || !match[2]) continue;
    const start = (match.index ?? 0) + (match[1]?.length ?? 0);
    const matched = match[2];
    return { before: sentence.slice(0, start), match: matched, after: sentence.slice(start + matched.length) };
  }
  return { before: sentence, match: '', after: '' };
}

export function ReviewPage({ due, dueCount, dueTotal, newCount, newTotal, language, t, onRate, onUndo, onOpen, onGoLibrary, onRestart }: Props) {
  const [queue, setQueue] = useState<ReaderItem[]>(due);
  const [started, setStarted] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [undo, setUndo] = useState<UndoEntry>();
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const current = queue[0];

  useEffect(() => { if (!started) setQueue(due); }, [due, started]);
  useEffect(() => { setRevealed(false); }, [current?.contextKey, current?.id]);

  const rate = async (rating: ReviewRating) => {
    if (!current || busy) return;
    setStarted(true); setBusy(true); setError('');
    const before = { queue, completed, counts };
    const snapshot = reviewSnapshot(current);
    try {
      const schedule = await onRate(current, rating);
      const next = queue.slice(1);
      if (rating === 'again') next.push(schedule ? { ...current, ...schedule } : current);
      setQueue(next);
      setCompleted((value) => value + 1);
      setCounts((value) => ({ ...value, [rating]: value[rating] + 1 }));
      setUndo({ ...before, item: current, snapshot });
      setRevealed(false);
    } catch {
      setError(t('复习进度保存失败，请重试。', 'Could not save review progress. Please retry.'));
    } finally {
      setBusy(false);
    }
  };

  const undoLast = async () => {
    if (!undo || !onUndo || busy) return;
    setBusy(true); setError('');
    try {
      await onUndo(undo.item, undo.snapshot);
      setQueue(undo.queue); setCompleted(undo.completed); setCounts(undo.counts);
      setUndo(undefined); setRevealed(false);
    } catch {
      setError(t('撤销失败，请重试。', 'Could not undo. Please retry.'));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, select')) return;
      if (!current) return;
      if (!revealed && (event.key === ' ' || event.key === 'Enter')) {
        event.preventDefault(); setRevealed(true); return;
      }
      if (revealed && ['1', '2', '3', '4'].includes(event.key)) {
        const rating = RATINGS[Number(event.key) - 1];
        if (rating) { event.preventDefault(); void rate(rating); }
        return;
      }
      if (event.key.toLowerCase() === 'u' && undo && onUndo && !busy) {
        event.preventDefault(); void undoLast();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!current && completed > 0) {
    const total = counts.again + counts.hard + counts.good + counts.easy;
    return <section className="review-page"><div className="review-summary">
      <p className="eyebrow">{t('SESSION COMPLETE', 'SESSION COMPLETE')}</p>
      <h2>{t('今日复习完成', 'Review complete')}</h2>
      <p className="review-summary-total">{t(`共完成 ${total} 次评分`, `${total} ratings`)}</p>
      <div className="review-summary-grid">
        <div><strong>{counts.again}</strong><span>{t('没想起来', 'Again')}</span></div>
        <div><strong>{counts.hard}</strong><span>{t('很费劲', 'Hard')}</span></div>
        <div><strong>{counts.good}</strong><span>{t('想起来了', 'Good')}</span></div>
        <div><strong>{counts.easy}</strong><span>{t('太容易', 'Easy')}</span></div>
      </div>
      <p className="review-summary-note">{t('下一批到期词会按计划出现。', 'The next batch will appear when it is due.')}</p>
      <div className="review-summary-actions">
        {onRestart && <button className="primary-button" onClick={onRestart}>{t('再来一组', 'Another round')}</button>}
        {undo && onUndo && <button className="quiet" onClick={() => { void undoLast(); }} disabled={busy}>{t('撤销上一次', 'Undo last')}</button>}
        <button className="quiet" onClick={onGoLibrary}>{t('回到生词库', 'Open vocabulary')}</button>
      </div>
    </div></section>;
  }

  if (!current) {
    return <section className="review-page"><div className="review-empty"><span aria-hidden="true">✓</span><h2>{t('今天没有到期词。', 'Nothing due today.')}</h2><p>{t('新收藏的词会自动进入复习队列；明天再来，或者去生词库看看。', 'New words enter the review queue automatically. Come back tomorrow, or browse your vocabulary.')}</p><button className="primary-button" onClick={onGoLibrary}>{t('去生词库', 'Open vocabulary')}</button></div></section>;
  }

  const term = itemTerm(current);
  const sentence = current.sourceSentence || current.context;
  const parts = cloze(sentence, [current.lemma || '', current.selectedText]);
  const preview = (rating: ReviewRating) => formatInterval(scheduleReview(current, rating).intervalDays, language);
  const total = completed + queue.length;
  const percent = total ? Math.round((completed / total) * 100) : 0;
  const hiddenDue = Math.max(0, (dueTotal ?? dueCount) - dueCount);
  const hiddenNew = Math.max(0, (newTotal ?? newCount) - newCount);

  return <section className="review-page">
    <div className="review-heading"><div><p className="eyebrow">{t('SPACED REPETITION', 'SPACED REPETITION')}</p><h2>{t('今日复习', 'Today’s review')}</h2><p>{t(`到期 ${dueCount} · 新词 ${newCount}`, `${dueCount} due · ${newCount} new`)}{hiddenDue > 0 ? t(` · 另有 ${hiddenDue} 张到期`, ` · ${hiddenDue} more due`) : ''}{hiddenNew > 0 ? t(` · 另有 ${hiddenNew} 个新词`, ` · ${hiddenNew} more new`) : ''}</p></div><span className="review-remaining">{t(`剩余 ${queue.length}`, `${queue.length} left`)}</span></div>
    <div className="review-progress" aria-label={t('今日复习进度', 'Review progress')}><span style={{ width: `${percent}%` }} /><small>{t(`已完成 ${completed} / ${total}`, `${completed} / ${total} done`)}</small></div>
    <article className="review-card">
      <p className="review-kicker">{current.reviewCount ? t('到期复习', 'Due review') : t('新词', 'New word')}</p>
      <h3 className="review-word">{term}</h3>
      <p className="review-language">{savedLanguage(current) === 'unknown' ? t('旧版 · 语言未确认', 'Legacy · language unconfirmed') : savedLanguage(current) === 'en' ? 'English' : '中文'}</p>
      {current.phonetic && <p className="review-phonetic"><span aria-hidden="true">/</span>{current.phonetic.replace(/^\/|\/$/g, '')}<span aria-hidden="true">/</span></p>}
      {current.partOfSpeech && <p className="review-pos">{formatPartOfSpeech(current.partOfSpeech)}</p>}
      {sentence && <blockquote className="review-sentence">{parts.match ? <>{parts.before}<mark>{parts.match}</mark>{parts.after}</> : <>{sentence}<span className="review-context-hint"> · {t('注意这个词在句中的意思', 'notice the word in context')}</span></>}</blockquote>}
      <p className="review-question">{t('这个词在这里是什么意思？', 'What does this word mean here?')}</p>
      {!revealed ? <button className="primary-button review-reveal" onClick={() => setRevealed(true)} disabled={busy}>{t('显示答案', 'Show answer')}</button> : <>
        <div className="review-answer">
          {current.translation ? <div className="review-answer-row"><span>{t('语境义', 'In context')}</span><p>{current.translation}</p></div> : null}
          {current.definition && current.definition !== current.translation ? <div className="review-answer-row"><span>{t('标准义', 'Definition')}</span><p>{current.definition}</p></div> : null}
          {current.explanation && <p className="review-explanation">{current.explanation}</p>}
          {current.note && <p className="review-note"><strong>{t('我的笔记', 'My note')}</strong> {current.note}</p>}
        </div>
        <p className="review-rating-guide">{t('刚才记得怎么样？这决定下次什么时候再见到它。', 'How did that recall feel? This decides when you see it again.')}</p>
        {!current.reviewCount && <p className="review-rating-note">{t('首次复习：困难和记得都是 1 天；区别是之后“困难”的间隔增长更慢。', 'First review: Hard and Good both start at 1 day; Hard grows more slowly afterwards.')}</p>}
        <div className="review-ratings">{RATINGS.map((rating) => <button key={rating} className={`review-rating ${rating}`} disabled={busy} onClick={() => { void rate(rating); }}><strong>{t(...LABELS[rating])}</strong><small>{preview(rating)}</small><em>{t(...HINTS[rating])}</em></button>)}</div>
      </>}
      {error && <p className="review-error" role="alert">{error}</p>}
      <div className="review-footer">
        {undo && onUndo && <button onClick={() => { void undoLast(); }} disabled={busy}>{t('↶ 撤销上一次', '↶ Undo last')}</button>}
        <button onClick={() => onOpen(current)}>{t('回到原文 ↗', 'Open source ↗')}</button>
        <span className="review-shortcuts">{t('空格显示答案 · 1 没想起来 · 2 很费劲 · 3 想起来了 · 4 太容易 · U 撤销', 'Space answer · 1 Again · 2 Hard · 3 Good · 4 Easy · U undo')}</span>
      </div>
    </article>
  </section>;
}
