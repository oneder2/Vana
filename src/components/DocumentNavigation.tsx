import { useLayoutEffect, useRef } from 'react';
import { ArrowLeft, BookOpen, ChevronRight, GitCompareArrows, History, Pencil } from 'lucide-react';
import type { DocumentPathItem } from '@/lib/documentNavigation';
import { useTheme } from './ThemeProvider';
import { getThemeAccentColor, getThemeBorderColor } from '@/lib/themeStyles';

export function DocumentNavigation({ path, readOnly, busy, onOpenFolder, onToggleReading, onHistory, onConflicts }: {
  path: DocumentPathItem[];
  readOnly: boolean;
  busy: boolean;
  onOpenFolder: (id: string | null) => void;
  onToggleReading: () => void;
  onHistory: () => void;
  onConflicts: () => void;
}) {
  const { theme } = useTheme();
  const navigation = useRef<HTMLElement>(null);
  const current = path.at(-1);
  const border = getThemeBorderColor(theme);
  useLayoutEffect(() => {
    if (navigation.current) navigation.current.scrollLeft = navigation.current.scrollWidth;
  }, [current?.id]);
  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-xs" style={{ borderColor: border }}>
      <button type="button" aria-label="返回所在分组" title="返回所在分组"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded border"
        style={{ borderColor: border }} onClick={() => onOpenFolder(current?.parent_id ?? null)}>
        <ArrowLeft size={15} />
      </button>
      <nav ref={navigation} aria-label="文档位置" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button type="button" className="shrink-0 px-1 py-2 hover:underline" onClick={() => onOpenFolder(null)}>文档库</button>
        {path.map((item, index) => (
          <span key={item.id} className="flex shrink-0 items-center gap-1">
            <ChevronRight size={12} className="opacity-40" />
            {index === path.length - 1
              ? <span aria-current="page" className="max-w-40 truncate px-1" title={item.title}>{item.title}</span>
              : <button type="button" className="max-w-32 truncate px-1 py-2 hover:underline" title={item.title}
                  onClick={() => onOpenFolder(item.id)}>{item.title}</button>}
          </span>
        ))}
      </nav>
      <div className="flex shrink-0 items-center gap-1" style={{ color: getThemeAccentColor(theme) }}>
        <button type="button" disabled={busy} aria-pressed={readOnly} onClick={onToggleReading}
          aria-label={readOnly ? '进入编辑模式' : '保存并进入阅读模式'}
          title={readOnly ? '进入编辑模式' : '保存并进入阅读模式'}
          className="flex min-h-9 items-center gap-1.5 rounded border px-2 disabled:opacity-50" style={{ borderColor: border }}>
          {readOnly ? <Pencil size={14} /> : <BookOpen size={14} />}
          {busy ? '保存中' : readOnly ? '编辑' : '阅读'}
        </button>
        <button type="button" onClick={onHistory} className="flex min-h-9 items-center gap-1.5 rounded border px-2"
          style={{ borderColor: border }} aria-label="查看修改记录"><History size={14} /><span className="hidden sm:inline">修改记录</span></button>
        <button type="button" onClick={onConflicts} className="flex min-h-9 items-center gap-1.5 rounded border px-2"
          style={{ borderColor: border }} aria-label="查看同步副本"><GitCompareArrows size={14} /><span className="hidden sm:inline">同步副本</span></button>
      </div>
    </div>
  );
}
