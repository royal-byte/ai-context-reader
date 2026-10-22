import type { CSSProperties, MouseEvent } from 'react';
import type { EpubChapter } from './epub';

type Props = {
  chapter: EpubChapter;
  fontSize: number;
  onSelect: (event: MouseEvent) => void;
};

export function EpubPage({ chapter, fontSize, onSelect }: Props) {
  return <div className="pdf-stage epub-stage">
    <article
      className="epub-paper"
      style={{ '--epub-font-size': `${fontSize}px` } as CSSProperties}
      onMouseUp={onSelect}
      onDoubleClick={onSelect}
      dangerouslySetInnerHTML={{ __html: chapter.html }}
    />
  </div>;
}
