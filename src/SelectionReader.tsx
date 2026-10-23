import { useEffect, useRef, useState } from 'react';
import { dismissCardOnOutsidePress } from './card-dismiss';
import { inferReadingMode, MAX_SELECTION_LENGTH, SOFT_SELECTION_LIMIT } from './reading';
import { DEFAULT_PREFERENCES, uiText, type ReaderPreferences } from './preferences';
import { ReaderCard, type ReadingSelection } from './ReaderCard';
import type { Explanation } from './types';
import type { FavoriteState } from './library';

// The second mouseup is followed by dblclick; handle it once, without a timer or an API request.
export function selectionIntent(event: { type: string; button: number; detail: number }) {
  if (event.button !== 0 || (event.type === 'mouseup' && event.detail === 2)) return null;
  return event.type === 'dblclick' ? 'explain' : 'offer';
}

export function opensImmediately(text: string, immediate: boolean, confirmed: boolean, preferences: ReaderPreferences) {
  return text.length <= MAX_SELECTION_LENGTH && (confirmed || (immediate && preferences.trigger === 'quick' && inferReadingMode(text) === 'word'));
}

type Props = {
  selection: ReadingSelection;
  anchor: { left: number; bottom: number; top?: number };
  immediate: boolean;
  confirmed?: boolean;
  preferences?: ReaderPreferences;
  close: () => void;
  onSaved?: (note?: string) => void;
  onResult?: (result: Explanation) => void;
  onState?: (state: FavoriteState, note?: string) => void;
  onExplain?: () => void;
};

export function SelectionReader({ selection, anchor, immediate, confirmed = false, preferences = DEFAULT_PREFERENCES, close, onSaved, onResult, onState, onExplain }: Props) {
  const tooLong = selection.text.length > MAX_SELECTION_LENGTH;
  const long = selection.text.length > SOFT_SELECTION_LIMIT;
  const t = uiText(preferences.uiLanguage);
  const [open, setOpen] = useState(opensImmediately(selection.text, immediate, confirmed, preferences));
  const button = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open || !button.current) return;
    const cleanup = dismissCardOnOutsidePress(button.current, close, false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { cleanup(); window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [open, close]);

  if (open && !tooLong) return <ReaderCard selection={selection} anchor={anchor} preferences={preferences} close={close} onSaved={onSaved} onResult={onResult} onState={onState} presentation="popup" />;
  return <div ref={button} className="acr-selection-tools" style={{ left: Math.max(12, Math.min(anchor.left, innerWidth - (long ? 344 : 84))), top: Math.max(12, Math.min(anchor.bottom + 8, innerHeight - (long ? 148 : 48))) }}>
    {long && <p className="acr-selection-notice" role={tooLong ? 'alert' : 'status'}>{tooLong ? t('单次最多解释 3000 字符，请缩小选区；复制不受影响。', 'Select at most 3000 characters. Copying is unaffected.') : t('内容较长，建议分段理解。', 'Long selection. Consider reading in smaller sections.')} <span>{selection.text.length} / 3000</span></p>}
    <button type="button" className="acr-explain" aria-label={tooLong ? t('关闭提示', 'Dismiss notice') : t('解释选中文字', 'Explain selected text')} title={t('复制可直接按 Ctrl+C', 'Press Ctrl+C to copy without querying')} onPointerDown={(event) => { if (event.button === 0) event.preventDefault(); }} onMouseDown={(event) => { if (event.button === 0) event.preventDefault(); }} onClick={() => tooLong ? close() : onExplain ? onExplain() : setOpen(true)}>{tooLong ? t('知道了', 'Dismiss') : t('解释', 'Explain')}</button>
  </div>;
}
