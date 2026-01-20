/**
 * No Visitors - ConflictModal
 *
 * 用途：
 * - 当 Git 同步（rebase）检测到冲突时，提供交互式 UI 让用户选择解决策略：
 *   - Ours：保留本地版本
 *   - Theirs：接受云端版本
 *   - CopyBoth：保留两者（将本地版本另存为 *_conflict_<timestamp>，原文件使用云端版本继续同步）
 *
 * 说明：
 * - 当前后端返回的是“冲突文件列表”，不包含具体 diff / 字数等统计；
 *   这些信息后续可通过扩展后端 API（例如返回 blob OID 或 diff）来增强展示。
 */

import React from 'react';
import {
  AlertTriangle,
  Copy,
  FileDiff,
  FileText,
  Monitor,
  Smartphone,
} from 'lucide-react';

import type { SyncConflict } from '@/lib/api';

export type ConflictChoice = 'Ours' | 'Theirs' | 'CopyBoth';

export function ConflictModal(props: {
  open: boolean;
  conflict: SyncConflict | null;
  onResolveAll: (choice: ConflictChoice) => Promise<void> | void;
  onClose: () => void;
}) {
  const { open, conflict, onResolveAll, onClose } = props;

  if (!open || !conflict) return null;

  const first = conflict.files[0];
  const count = conflict.files.length;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={onClose}
      />

      <div className="relative w-full max-w-lg bg-[#0c0a13] border border-red-900/50 rounded-xl shadow-[0_0_50px_rgba(220,38,38,0.2)] overflow-hidden font-sans animate-in zoom-in-95 duration-300">
        <div className="bg-red-950/30 border-b border-red-900/30 p-4 flex items-center gap-3">
          <div className="p-2 bg-red-500/10 rounded-full">
            <AlertTriangle className="text-red-500 w-6 h-6" />
          </div>
          <div>
            <h2 className="text-red-100 font-bold tracking-wider uppercase">
              冲突警告 (Conflict)
            </h2>
            <p className="text-red-400/60 text-xs">
              检测到同一文件存在无法自动合并的变更（共 {count} 个文件）
            </p>
          </div>
        </div>

        <div className="px-6 py-4 border-b border-white/5 bg-white/5 flex items-center gap-3">
          <FileText className="text-stone-400 w-5 h-5" />
          <span className="text-stone-200 font-mono text-sm">
            {first?.path ?? '(unknown)'}
            {count > 1 ? (
              <span className="text-stone-500"> 等 {count} 个文件</span>
            ) : null}
          </span>
        </div>

        <div className="flex divide-x divide-white/10 h-56 relative">
          <div className="flex-1 p-6 flex flex-col justify-center items-center text-center bg-gradient-to-b from-transparent to-emerald-900/10">
            <div className="absolute top-2 left-2 text-[10px] text-emerald-500/50 font-bold border border-emerald-500/20 px-1 rounded">
              OURS
            </div>
            <Smartphone className="w-12 h-12 text-emerald-500 mb-3" />
            <div className="text-emerald-100 font-bold mb-1">本地版本</div>
            <div className="text-xs text-emerald-400/60">
              你的未同步提交 / 当前设备修改
            </div>
          </div>

          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 bg-[#0c0a13] border border-white/10 rounded-full p-2 text-stone-500 font-black text-xs">
            VS
          </div>

          <div className="flex-1 p-6 flex flex-col justify-center items-center text-center bg-gradient-to-b from-transparent to-blue-900/10">
            <div className="absolute top-2 right-2 text-[10px] text-blue-500/50 font-bold border border-blue-500/20 px-1 rounded">
              THEIRS
            </div>
            <Monitor className="w-12 h-12 text-blue-500 mb-3" />
            <div className="text-blue-100 font-bold mb-1">云端版本</div>
            <div className="text-xs text-blue-400/60">
              远端最新提交 / 其它设备修改
            </div>
          </div>
        </div>

        <div className="p-6 space-y-3 bg-[#13111c]">
          <button
            onClick={() => onResolveAll('CopyBoth')}
            className="w-full group relative flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 border border-emerald-500/30 hover:border-emerald-500 rounded-lg transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/20 rounded text-emerald-400">
                <Copy size={20} />
              </div>
              <div className="text-left">
                <div className="text-emerald-100 font-bold text-sm">
                  保留两者（创建副本）
                </div>
                <div className="text-stone-500 text-xs">
                  推荐：将本地版本另存为 *_conflict_时间戳，然后继续同步
                </div>
              </div>
            </div>
            <div className="px-2 py-1 bg-emerald-500 text-black text-[10px] font-bold rounded uppercase">
              Recommended
            </div>
          </button>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => onResolveAll('Ours')}
              className="flex flex-col items-center justify-center gap-2 p-3 rounded-lg border border-white/5 hover:bg-red-900/20 hover:border-red-500/50 transition-colors group"
            >
              <span className="text-stone-400 group-hover:text-red-400 font-bold text-xs">
                覆盖云端（保留本地）
              </span>
              <span className="text-[10px] text-stone-600 group-hover:text-red-500/80">
                风险：云端版本会被覆盖
              </span>
            </button>

            <button
              onClick={() => onResolveAll('Theirs')}
              className="flex flex-col items-center justify-center gap-2 p-3 rounded-lg border border-white/5 hover:bg-blue-900/20 hover:border-blue-500/50 transition-colors group"
            >
              <span className="text-stone-400 group-hover:text-blue-400 font-bold text-xs">
                接受云端（放弃本地）
              </span>
              <span className="text-[10px] text-stone-600 group-hover:text-blue-500/80">
                风险：本地版本会被撤销
              </span>
            </button>
          </div>
        </div>

        <div className="px-6 py-2 bg-black/40 border-t border-white/5 flex justify-between items-center">
          <span className="text-[10px] text-stone-600">
            CONFLICT_FILES: {count}
          </span>
          <button
            className="text-[10px] text-stone-500 hover:text-stone-300 flex items-center gap-1"
            onClick={() => {
              // TODO: 后续接入纯文本 diff 展示（需要后端返回 blob OID 或 diff 文本）
            }}
            type="button"
          >
            <FileDiff size={10} />
            查看纯文本 Diff (Advanced)
          </button>
        </div>
      </div>
    </div>
  );
}


