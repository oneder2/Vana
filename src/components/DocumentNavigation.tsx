import { useLayoutEffect, useRef } from 'react';
import { ArrowLeft, ChevronRight, GitCompareArrows, History } from 'lucide-react';
import type { DocumentPathItem } from '@/lib/documentNavigation';

export function DocumentNavigation({ path, onOpenFolder, onHistory, onConflicts }: {
  path: DocumentPathItem[];
  onOpenFolder: (id: string | null) => void;
  onHistory: () => void;
  onConflicts: () => void;
}) {
  const navigation = useRef<HTMLElement>(null);
  const current = path.at(-1);
  useLayoutEffect(() => {
    if (navigation.current) navigation.current.scrollLeft = navigation.current.scrollWidth;
  }, [current?.id]);
  return <div className="document-navigation flex items-center gap-2 border-b px-3 py-2 text-xs" style={{ borderColor: 'var(--ui-border)' }}>
    <button type="button" aria-label="返回所在分组" className="ui-icon-button" onClick={() => onOpenFolder(current?.parent_id ?? null)}><ArrowLeft size={16} /></button>
    <nav ref={navigation} aria-label="文档位置" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap">
      <button className="shrink-0 px-1 py-2" onClick={() => onOpenFolder(null)}>文档库</button>
      {path.map((item, index) => <span key={item.id} className="flex shrink-0 items-center gap-1">
        <ChevronRight size={12} className="opacity-40" />
        {index === path.length - 1
          ? <span aria-current="page" className="max-w-48 truncate px-1" title={item.title}>{item.title}</span>
          : <button className="max-w-32 truncate px-1 py-2" onClick={() => onOpenFolder(item.id)}>{item.title}</button>}
      </span>)}
    </nav>
    <button className="ui-button ui-button-quiet" onClick={onHistory}><History size={15} />修改记录</button>
    <button className="ui-icon-button" aria-label="查看同步副本" onClick={onConflicts}><GitCompareArrows size={16} /></button>
  </div>;
}
