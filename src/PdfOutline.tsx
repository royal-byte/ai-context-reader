export type PdfOutlineItem = {
  title: string;
  dest: string | unknown[] | null;
  items?: PdfOutlineItem[];
};

type Props = {
  items: PdfOutlineItem[];
  onJump: (dest: PdfOutlineItem['dest']) => void;
  t: (zh: string, en: string) => string;
};

function Branch({ items, onJump, t }: Props) {
  return <ul>{items.map((item, index) => <li key={`${item.title}-${index}`}><button type="button" onClick={() => onJump(item.dest)}>{item.title || t('未命名章节', 'Untitled section')}</button>{item.items?.length ? <Branch items={item.items} onJump={onJump} t={t} /> : null}</li>)}</ul>;
}

export function PdfOutline({ items, onJump, t }: Props) {
  if (!items.length) return null;
  return <details className="pdf-outline"><summary>{t('目录', 'Outline')}</summary><div className="pdf-outline-body"><Branch items={items} onJump={onJump} t={t} /></div></details>;
}
