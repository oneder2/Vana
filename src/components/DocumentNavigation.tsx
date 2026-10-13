import { useEffect, useLayoutEffect, useRef } from 'react';
import { ArrowLeft, BookOpen, ChevronRight, GitCompareArrows, History, MoreHorizontal, Pencil } from 'lucide-react';
import type { DocumentPathItem } from '@/lib/documentNavigation';
import { useTheme } from './ThemeProvider';
import { getThemeAccentColor, getThemeBorderColor, getThemeSurfaceColor } from '@/lib/themeStyles';

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
  const moreMenu = useRef<HTMLDetailsElement>(null);
  const current = path.at(-1);
  const border = getThemeBorderColor(theme);
  useLayoutEffect(() => {
    if (navigation.current) navigation.current.scrollLeft = navigation.current.scrollWidth;
  }, [current?.id]);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !moreMenu.current?.contains(event.target)) {
        moreMenu.current?.removeAttribute('open');
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && moreMenu.current?.open) {
        moreMenu.current.removeAttribute('open');
        moreMenu.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);
  useEffect(() => { moreMenu.current?.removeAttribute('open'); }, [current?.id]);
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
        <details ref={moreMenu} className="relative">
          <summary aria-label="更多文档操作" title="更多文档操作" className="flex min-h-9 cursor-pointer list-none items-center rounded px-2 focus-visible:outline focus-visible:outline-2"><MoreHorizontal size={16} /></summary>
          <div className="absolute right-0 top-full z-30 mt-1 min-w-40 rounded border p-1 shadow-lg" style={{ borderColor: border, backgroundColor: getThemeSurfaceColor(theme) }}>
            <button type="button" onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); onConflicts(); }} className="flex min-h-10 w-full items-center gap-2 rounded px-3 text-left hover:opacity-75" aria-label="查看同步副本"><GitCompareArrows size={14} />查看同步副本</button>
          </div>
        </details>
      </div>
    </div>
  );
}
