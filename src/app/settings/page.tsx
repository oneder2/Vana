/**
 * No Visitors - 设置页面
 * 提供 GitHub PAT、远程仓库、同步和工作区维护配置
 */

'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRightLeft,
  Camera,
  CheckCircle,
  Database,
  ExternalLink,
  GitBranch,
  Link2,
  Loader,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import { TitleBar } from '@/components/TitleBar';
import { ConflictModal, type ConflictChoice } from '@/components/ConflictModal';
import { QRCodeDisplay } from '@/components/QRCodeDisplay';
import { QRCodeScanner } from '@/components/QRCodeScanner';
import { isMobile } from '@/lib/platform';
import {
  beginSync,
  continueSync,
  abortSync,
  resolveConflict,
  storePatToken,
  getPatToken,
  removePatToken,
  hasPatToken,
  addRemote,
  getRemoteUrl,
  getWorkspacePath,
  ensureWorkspaceInitialized,
  readWorkspaceConfig,
  writeWorkspaceConfig,
  validateRemoteConnection,
  verifyRepository,
  getCurrentBranch,
  gitGc,
} from '@/lib/api';
import {
  getThemeAccentColor,
  getThemeBgColor,
  getThemeBorderColor,
  getThemeSurfaceColor,
} from '@/lib/themeStyles';

function StepBadge({
  step,
  color,
  backgroundColor,
  borderColor,
}: {
  step: string;
  color: string;
  backgroundColor: string;
  borderColor: string;
}) {
  return (
    <div
      className="w-7 h-7 rounded-full border flex items-center justify-center text-xs shrink-0"
      style={{ color, backgroundColor, borderColor }}
    >
      {step}
    </div>
  );
}

function normalizeRemoteUrl(input: string): string {
  const value = input.trim();

  if (value.startsWith('git@github.com:')) {
    const repoPath = value.slice('git@github.com:'.length).replace(/\.git$/, '');
    return `https://github.com/${repoPath}.git`;
  }

  if (value.startsWith('ssh://git@github.com/')) {
    const repoPath = value.slice('ssh://git@github.com/'.length).replace(/\.git$/, '');
    return `https://github.com/${repoPath}.git`;
  }

  if (value.startsWith('https://github.com/')) {
    const normalized = value.replace(/\/+$/, '');
    return normalized.endsWith('.git') ? normalized : `${normalized}.git`;
  }

  return value;
}

export default function SettingsPage() {
  const { theme } = useTheme();
  const accentColor = getThemeAccentColor(theme);
  const backgroundColor = getThemeBgColor(theme);
  const surfaceColor = getThemeSurfaceColor(theme);
  const borderColor = getThemeBorderColor(theme);
  const bodyTextColor = theme.id === 'vellum' ? 'rgb(41, 37, 36)' : 'rgb(231, 229, 228)';
  const subduedText = theme.id === 'vellum' ? 'rgb(87, 83, 78)' : 'rgb(168, 162, 158)';

  const [patToken, setPatToken] = useState('');
  const [patConfigured, setPatConfigured] = useState(false);
  const [patSaving, setPatSaving] = useState(false);
  const [patMessage, setPatMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [displayPatToken, setDisplayPatToken] = useState('');
  const [showQRCode, setShowQRCode] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);

  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [remoteInput, setRemoteInput] = useState('');
  const [workspacePath, setWorkspacePath] = useState('');
  const [remoteConfiguring, setRemoteConfiguring] = useState(false);
  const [remoteChecking, setRemoteChecking] = useState(false);
  const [autoCommitInterval, setAutoCommitInterval] = useState(15);
  const [savingConfig, setSavingConfig] = useState(false);
  const [repoInfo, setRepoInfo] = useState<{ branch: string | null; commitCount: number; latestCommit: string | null }>({
    branch: null,
    commitCount: 0,
    latestCommit: null,
  });
  const [remoteCheck, setRemoteCheck] = useState<import('@/lib/api').RemoteConnectionStatus | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [syncConflict, setSyncConflict] = useState<import('@/lib/api').SyncConflict | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        const mobile = await isMobile();
        setIsMobileDevice(mobile);
        await ensureWorkspaceInitialized();

        const hasPat = await hasPatToken();
        setPatConfigured(hasPat);
        if (hasPat) {
          const token = await getPatToken();
          if (token) {
            setDisplayPatToken(token);
          }
        }

        const workspace = await getWorkspacePath();
        setWorkspacePath(workspace);

        const remote = await getRemoteUrl(workspace, 'origin');
        setRemoteUrl(remote);
        setRemoteInput(remote || '');
        setRemoteCheck(null);

        const [config, verification, branch] = await Promise.all([
          readWorkspaceConfig(),
          verifyRepository(workspace),
          getCurrentBranch(workspace).catch(() => null),
        ]);

        setAutoCommitInterval(config.auto_commit_interval);
        setRepoInfo({
          branch,
          commitCount: verification.commit_count,
          latestCommit: verification.latest_commit_message,
        });
      } catch (error) {
        console.error('初始化设置页面失败:', error);
      }
    };

    init();
  }, []);

  const handleSavePat = async () => {
    if (!patToken.trim()) {
      setPatMessage({ type: 'error', text: '请输入 PAT Token' });
      return;
    }

    setPatSaving(true);
    setPatMessage(null);

    try {
      await storePatToken(patToken);
      setPatConfigured(true);
      setDisplayPatToken(patToken);
      setPatToken('');
      setRemoteCheck(null);
      setPatMessage({ type: 'success', text: 'PAT Token 已保存' });
      setShowQRCode(true);
    } catch (error) {
      setPatMessage({ type: 'error', text: `保存失败: ${error}` });
    } finally {
      setPatSaving(false);
    }
  };

  const handleRemovePat = async () => {
    setPatSaving(true);
    setPatMessage(null);

    try {
      await removePatToken();
      setPatConfigured(false);
      setPatToken('');
      setDisplayPatToken('');
      setRemoteCheck(null);
      setShowQRCode(false);
      setPatMessage({ type: 'success', text: 'PAT Token 已清除' });
    } catch (error) {
      setPatMessage({ type: 'error', text: `清除失败: ${error}` });
    } finally {
      setPatSaving(false);
    }
  };

  const handleGenerateQRCode = async () => {
    if (!patConfigured) {
      setPatMessage({ type: 'error', text: '请先配置 PAT Token' });
      return;
    }

    try {
      const token = await getPatToken();
      if (token) {
        setDisplayPatToken(token);
        setShowQRCode(true);
      } else {
        setPatMessage({ type: 'error', text: '无法获取 PAT Token' });
      }
    } catch (error) {
      setPatMessage({ type: 'error', text: `获取 PAT Token 失败: ${error}` });
    }
  };

  const handleScanSuccess = async (token: string) => {
    try {
      await storePatToken(token);
      setPatConfigured(true);
      setDisplayPatToken(token);
      setRemoteCheck(null);
      setShowScanner(false);
      setPatMessage({ type: 'success', text: 'PAT Token 已通过扫描导入' });
    } catch (error) {
      setPatMessage({ type: 'error', text: `保存 PAT Token 失败: ${error}` });
    }
  };

  const handleScanError = (error: string) => {
    setPatMessage({ type: 'error', text: `扫描失败: ${error}` });
  };

  const handleConfigureRemote = async () => {
    if (!workspacePath) {
      setSyncStatus({ success: false, message: '无法获取工作区路径' });
      return;
    }
    if (!remoteInput.trim()) {
      setSyncStatus({ success: false, message: '请输入远程仓库 URL' });
      return;
    }

    setRemoteConfiguring(true);
    try {
      await ensureWorkspaceInitialized();
      const normalizedRemoteUrl = normalizeRemoteUrl(remoteInput);
      await addRemote(workspacePath, 'origin', normalizedRemoteUrl);
      setRemoteInput(normalizedRemoteUrl);
      setRemoteUrl(normalizedRemoteUrl);
      setRemoteCheck(null);
      setSyncStatus({
        success: true,
        message: normalizedRemoteUrl.startsWith('https://github.com/')
          ? '远程仓库配置成功，将优先使用 HTTPS + PAT 同步'
          : '远程仓库配置成功',
      });
    } catch (error) {
      setSyncStatus({ success: false, message: `配置失败: ${error}` });
    } finally {
      setRemoteConfiguring(false);
    }
  };

  const handleValidateRemote = async () => {
    if (!workspacePath) {
      setSyncStatus({ success: false, message: '无法获取工作区路径' });
      return;
    }

    if (!remoteUrl && !remoteInput.trim()) {
      setSyncStatus({ success: false, message: '请先配置远程仓库 URL' });
      return;
    }

    setRemoteChecking(true);
    setSyncStatus(null);

    try {
      await ensureWorkspaceInitialized();
      const pat = await getPatToken();
      const status = await validateRemoteConnection(
        workspacePath,
        'origin',
        pat || undefined
      );

      setRemoteCheck(status);
      setSyncStatus({
        success: status.ok,
        message: status.ok ? '远程连接检查通过' : status.message,
      });
    } catch (error) {
      setRemoteCheck(null);
      setSyncStatus({ success: false, message: `连接检查失败: ${error}` });
    } finally {
      setRemoteChecking(false);
    }
  };

  const handleSaveWorkspaceConfig = async () => {
    setSavingConfig(true);
    try {
      await writeWorkspaceConfig({
        commit_scope: 'workspace',
        auto_commit_interval: autoCommitInterval,
      });
      setSyncStatus({ success: true, message: '工作区配置已保存' });
    } catch (error) {
      setSyncStatus({ success: false, message: `保存配置失败: ${error}` });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleRunGitGc = async () => {
    if (!workspacePath) return;
    try {
      await gitGc(workspacePath);
      setSyncStatus({ success: true, message: 'Git 维护完成' });
    } catch (error) {
      setSyncStatus({ success: false, message: `Git 维护失败: ${error}` });
    }
  };

  const refreshRepoInfo = async () => {
    if (!workspacePath) return;
    const verification = await verifyRepository(workspacePath);
    const branch = await getCurrentBranch(workspacePath).catch(() => null);
    setRepoInfo({
      branch,
      commitCount: verification.commit_count,
      latestCommit: verification.latest_commit_message,
    });
  };

  const handleSync = async () => {
    if (!workspacePath) {
      setSyncStatus({ success: false, message: '无法获取工作区路径' });
      return;
    }

    setSyncing(true);
    setSyncStatus(null);

    try {
      const pat = await getPatToken();
      const validation = await validateRemoteConnection(workspacePath, 'origin', pat || undefined);
      setRemoteCheck(validation);

      if (!validation.ok) {
        setSyncStatus({
          success: false,
          message: validation.hint ? `${validation.message} ${validation.hint}` : validation.message,
        });
        return;
      }

      const result = await beginSync(workspacePath, 'origin', 'main', pat || undefined);

      if (result.success) {
        if (result.has_conflict) {
          setSyncConflict(result.conflict ?? null);
          setConflictOpen(true);
          setSyncStatus({ success: true, message: '检测到冲突：请选择处理方式后继续同步' });
        } else {
          setSyncStatus({ success: true, message: '同步成功' });
          setLastSyncTime(new Date().toLocaleString());
          await refreshRepoInfo();
        }
      } else {
        setSyncStatus({ success: false, message: '同步失败' });
      }
    } catch (error) {
      setSyncStatus({ success: false, message: `同步失败: ${error}` });
    } finally {
      setSyncing(false);
    }
  };

  const handleResolveConflictAll = async (choice: ConflictChoice) => {
    if (!workspacePath || !syncConflict) return;
    try {
      const items = syncConflict.files.map((file) => ({ path: file.path, choice }));
      await resolveConflict(workspacePath, items);
      const result = await continueSync(workspacePath, 'main');
      if (result.has_conflict) {
        setSyncConflict(result.conflict ?? null);
        setConflictOpen(true);
        setSyncStatus({ success: true, message: '仍存在冲突：请继续选择处理方式' });
      } else {
        setConflictOpen(false);
        setSyncConflict(null);
        setSyncStatus({ success: true, message: '冲突已处理并同步完成' });
        setLastSyncTime(new Date().toLocaleString());
        await refreshRepoInfo();
      }
    } catch (error) {
      setSyncStatus({ success: false, message: `冲突处理失败: ${error}` });
    }
  };

  return (
    <div
      className={`flex flex-col h-screen transition-colors duration-700 ${theme.font} ${
        theme.id === 'vellum' ? 'text-stone-800' : 'text-stone-300'
      }`}
      style={{ backgroundColor }}
    >
      <TitleBar />

      <ConflictModal
        open={conflictOpen}
        conflict={syncConflict}
        onResolveAll={handleResolveConflictAll}
        onClose={async () => {
          try {
            await abortSync(workspacePath);
          } catch {
            // ignore
          }
          setConflictOpen(false);
          setSyncConflict(null);
        }}
      />

      <header
        className="h-14 flex items-center justify-between px-4 z-50 border-b transition-transform duration-300"
        style={{
          backgroundColor: surfaceColor,
          borderColor,
        }}
      >
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            style={{ color: accentColor }}
          >
            <Settings size={20} />
            <span className="text-sm">返回</span>
          </Link>
          <div className={`flex items-center gap-1 text-[10px] ${theme.uiFont} uppercase tracking-tighter opacity-60`}>
            <span>STYX-Ω</span>
            <span className="opacity-40">/</span>
            <span className={theme.accent}>设置</span>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 py-8 pb-24 md:px-8 md:py-16">
          <div className="mb-10 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] opacity-50 mb-3">Git Sync Setup</p>
              <h1 className={`text-2xl md:text-3xl ${theme.uiFont}`} style={{ color: accentColor }}>
                设置
              </h1>
              <p className="text-sm mt-3 max-w-2xl" style={{ color: subduedText }}>
                把配置流程拆成三步：先拿到 GitHub PAT，再连接远程仓库，最后执行同步与维护。
                当前页面优先做减法，避免把所有动作堆成一整列。
              </p>
            </div>
            <div
              className="grid grid-cols-2 gap-3 rounded border p-4 md:min-w-[360px]"
              style={{
                backgroundColor: surfaceColor,
                borderColor,
              }}
            >
              <div className="text-sm">
                <div className="opacity-50 text-xs mb-1">PAT</div>
                <div className="flex items-center gap-2">
                  {patConfigured ? <CheckCircle size={14} className="text-green-500" /> : <XCircle size={14} className="text-red-500" />}
                  <span>{patConfigured ? '已配置' : '未配置'}</span>
                </div>
              </div>
              <div className="text-sm">
                <div className="opacity-50 text-xs mb-1">Origin</div>
                <div className="flex items-center gap-2">
                  {remoteUrl ? <CheckCircle size={14} className="text-green-500" /> : <XCircle size={14} className="text-red-500" />}
                  <span>{remoteUrl ? '已连接' : '未连接'}</span>
                </div>
              </div>
            </div>
          </div>

          <section className="mb-8">
            <div
              className="rounded border p-4 md:p-5"
              style={{
                backgroundColor: surfaceColor,
                borderColor,
              }}
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="max-w-2xl">
                  <div className="flex items-center gap-2 mb-2" style={{ color: accentColor }}>
                    <ShieldCheck size={16} />
                    <span className={`text-sm ${theme.uiFont}`}>PAT 从哪里获得？</span>
                  </div>
                  <p className="text-sm mb-2" style={{ color: subduedText }}>
                    在 GitHub 的个人设置中创建 Fine-grained Personal Access Token，
                    并把仓库访问范围限制在当前同步仓库。
                  </p>
                  <div className="text-xs leading-6" style={{ color: subduedText }}>
                    <div>1. 打开 GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens。</div>
                    <div>2. Repository access 选择目标私有仓库。</div>
                    <div>3. Repository permissions 至少给 `Contents: Read and write` 与 `Metadata: Read-only`。</div>
                  </div>
                </div>
                <a
                  href="https://github.com/settings/personal-access-tokens/new"
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 inline-flex items-center gap-2 rounded border px-3 py-2 text-sm hover:opacity-80 transition-opacity"
                  style={{
                    backgroundColor,
                    borderColor,
                    color: accentColor,
                  }}
                >
                  <ExternalLink size={14} />
                  <span>打开 GitHub PAT 页面</span>
                </a>
              </div>
            </div>
          </section>

          <div className="grid gap-8 xl:grid-cols-[1.08fr_0.92fr]">
            <div className="space-y-8">
              <section>
                <div className="flex items-start gap-3 mb-4">
                  <StepBadge step="1" color={accentColor} backgroundColor={surfaceColor} borderColor={borderColor} />
                  <div>
                    <h2 className={`text-lg ${theme.uiFont}`} style={{ color: accentColor }}>
                      PAT 配置
                    </h2>
                    <p className="text-sm mt-1" style={{ color: subduedText }}>
                      Token 保存在系统 Keychain/Keystore 中，不写回工作区文件。
                    </p>
                  </div>
                </div>
                <div className="p-6 rounded border" style={{ backgroundColor: surfaceColor, borderColor }}>
                  <div className="space-y-5">
                    <div>
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <label className="block text-sm" style={{ color: accentColor }}>
                          GitHub Personal Access Token
                        </label>
                        <span className="text-xs opacity-50">推荐 Fine-grained PAT</span>
                      </div>

                      {patConfigured ? (
                    <div className="space-y-3">
                          <div
                            className="w-full px-4 py-3 rounded border flex items-center gap-2"
                            style={{
                              backgroundColor,
                              borderColor,
                              color: bodyTextColor,
                            }}
                          >
                            <CheckCircle size={16} className="text-green-500" />
                            <span className="text-sm">PAT Token 已配置并隐藏存储</span>
                          </div>
                          <button
                            onClick={handleRemovePat}
                            disabled={patSaving}
                            className="px-4 py-2 rounded border flex items-center gap-2 hover:opacity-80 transition-opacity disabled:opacity-50"
                            style={{
                              backgroundColor,
                              borderColor,
                              color: accentColor,
                            }}
                          >
                            <Trash2 size={16} />
                            <span>清除 PAT</span>
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <input
                            type="password"
                            placeholder="粘贴 GitHub PAT"
                            value={patToken}
                            onChange={(e) => setPatToken(e.target.value)}
                            className="w-full px-4 py-3 rounded border"
                            style={{
                              backgroundColor,
                              borderColor,
                              color: bodyTextColor,
                            }}
                            disabled={patSaving}
                          />
                          <button
                            onClick={handleSavePat}
                            disabled={patSaving || !patToken.trim()}
                            className="px-4 py-2 rounded border flex items-center gap-2 hover:opacity-80 transition-opacity disabled:opacity-50"
                            style={{
                              backgroundColor,
                              borderColor,
                              color: accentColor,
                            }}
                          >
                            {patSaving ? <Loader size={16} className="animate-spin" /> : <Save size={16} />}
                            <span>保存 PAT</span>
                          </button>
                        </div>
                      )}

                      {patMessage && (
                        <p className={`text-xs mt-3 ${patMessage.type === 'success' ? 'text-green-500' : 'text-red-500'}`}>
                          {patMessage.text}
                        </p>
                      )}
                    </div>

                    <div className="pt-4 border-t" style={{ borderColor }}>
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-3">
                        <div>
                          <label className="block text-sm" style={{ color: accentColor }}>
                            二维码传输
                          </label>
                          <p className="text-xs mt-1" style={{ color: subduedText }}>
                            用于在桌面端和移动端之间转移 PAT，减少手动输入。
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {isMobileDevice && (
                            <button
                              onClick={() => setShowScanner(true)}
                              className="text-xs px-2 py-1 rounded border hover:opacity-80 transition-opacity"
                              style={{
                                backgroundColor,
                                borderColor,
                                color: accentColor,
                              }}
                            >
                              扫描二维码
                            </button>
                          )}
                          {patConfigured && !isMobileDevice && (
                            <button
                              onClick={handleGenerateQRCode}
                              className="text-xs px-2 py-1 rounded border hover:opacity-80 transition-opacity"
                              style={{
                                backgroundColor,
                                borderColor,
                                color: accentColor,
                              }}
                            >
                              {showQRCode ? '刷新二维码' : '生成二维码'}
                            </button>
                          )}
                        </div>
                      </div>

                      {isMobileDevice ? (
                        <div
                          className="w-full border-2 border-dashed flex items-center justify-center rounded"
                          style={{
                            borderColor,
                            backgroundColor,
                            minHeight: '220px',
                          }}
                        >
                          <div className="text-center px-4 py-8">
                            <p className="text-sm opacity-80 mb-4">
                              {patConfigured ? 'PAT Token 已配置' : '点击“扫描二维码”导入 PAT'}
                            </p>
                            {!patConfigured && (
                              <button
                                onClick={() => setShowScanner(true)}
                                className="px-4 py-2 rounded border flex items-center gap-2 mx-auto hover:opacity-80 transition-opacity"
                                style={{
                                  backgroundColor: surfaceColor,
                                  borderColor,
                                  color: accentColor,
                                }}
                              >
                                <Camera size={16} />
                                <span>扫描二维码</span>
                              </button>
                            )}
                          </div>
                        </div>
                      ) : showQRCode && patConfigured ? (
                        <>
                          <QRCodeDisplay patToken={displayPatToken} size={240} />
                          <p className="text-xs opacity-60 mt-2">二维码包含当前 PAT，请仅在可信设备之间传输。</p>
                        </>
                      ) : (
                        <div
                          className="w-full max-w-[240px] h-[240px] border-2 border-dashed flex items-center justify-center rounded"
                          style={{
                            borderColor,
                            backgroundColor,
                          }}
                        >
                          <p className="text-sm opacity-40 text-center px-4">
                            {patConfigured ? '点击“生成二维码”显示' : '先保存 PAT 后再生成二维码'}
                          </p>
                        </div>
                      )}
                    </div>

                    {isMobileDevice && (
                      <QRCodeScanner
                        isOpen={showScanner}
                        onClose={() => setShowScanner(false)}
                        onScanSuccess={handleScanSuccess}
                        onScanError={handleScanError}
                      />
                    )}
                  </div>
                </div>
              </section>

              <section>
                <div className="flex items-start gap-3 mb-4">
                  <StepBadge step="2" color={accentColor} backgroundColor={surfaceColor} borderColor={borderColor} />
                  <div>
                    <h2 className={`text-lg ${theme.uiFont}`} style={{ color: accentColor }}>
                      远程仓库配置
                    </h2>
                    <p className="text-sm mt-1" style={{ color: subduedText }}>
                      建议为当前工作区单独配置一个私有仓库，避免 PAT 与 origin 混用。
                    </p>
                  </div>
                </div>
                <div className="p-6 rounded border" style={{ backgroundColor: surfaceColor, borderColor }}>
                  <label className="block text-sm mb-2" style={{ color: accentColor }}>
                    远程仓库 URL
                  </label>
                  <div className="space-y-3">
                    <input
                      value={remoteInput}
                      onChange={(e) => {
                        setRemoteInput(e.target.value);
                        setRemoteCheck(null);
                      }}
                      placeholder="https://github.com/your-org/your-repo.git"
                      className="w-full px-4 py-3 rounded border"
                      style={{
                        backgroundColor,
                        borderColor,
                        color: bodyTextColor,
                      }}
                    />
                    <div className="space-y-1 text-xs" style={{ color: subduedText }}>
                      <p>支持粘贴 GitHub 页面链接、HTTPS 或 SSH 地址；保存时会优先规范成适合 PAT 的 HTTPS 地址。</p>
                      {remoteUrl?.startsWith('git@') || remoteUrl?.startsWith('ssh://') ? (
                        <p style={{ color: 'rgb(245, 158, 11)' }}>
                          当前 origin 使用 SSH。若你依赖 PAT 同步，建议改成 HTTPS 地址。
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-start gap-2 md:flex-row md:flex-wrap md:items-center md:justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={handleConfigureRemote}
                          disabled={remoteConfiguring}
                          className="px-4 py-2 rounded border flex items-center gap-2 hover:opacity-80 transition-opacity disabled:opacity-50"
                          style={{
                            backgroundColor,
                            borderColor,
                            color: accentColor,
                          }}
                        >
                          {remoteConfiguring ? <Loader size={16} className="animate-spin" /> : <Link2 size={16} />}
                          <span>{remoteUrl ? '更新 origin' : '连接 origin'}</span>
                        </button>
                        <button
                          onClick={handleValidateRemote}
                          disabled={remoteChecking || (!remoteUrl && !remoteInput.trim())}
                          className="px-4 py-2 rounded border flex items-center gap-2 hover:opacity-80 transition-opacity disabled:opacity-50"
                          style={{
                            backgroundColor,
                            borderColor,
                            color: accentColor,
                          }}
                        >
                          {remoteChecking ? <Loader size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                          <span>{remoteChecking ? '检查中...' : '检查连接'}</span>
                        </button>
                      </div>
                      {remoteUrl && <span className="text-xs opacity-60">当前 origin 已配置</span>}
                    </div>
                    {remoteCheck && (
                      <div
                        className={`rounded border px-4 py-3 text-sm ${
                          remoteCheck.ok ? 'border-green-500' : 'border-amber-500'
                        }`}
                        style={{ backgroundColor }}
                      >
                        <div className="flex items-center gap-2">
                          {remoteCheck.ok ? (
                            <CheckCircle size={16} className="text-green-500" />
                          ) : (
                            <XCircle size={16} className="text-amber-500" />
                          )}
                          <span>{remoteCheck.message}</span>
                        </div>
                        <div className="mt-2 text-xs opacity-70">
                          <p>认证方式: {remoteCheck.auth_mode}</p>
                          {remoteCheck.remote_url && <p>当前地址: {remoteCheck.remote_url}</p>}
                          {remoteCheck.hint && <p>建议: {remoteCheck.hint}</p>}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </div>

            <div className="space-y-8">
              <section>
                <div className="flex items-start gap-3 mb-4">
                  <StepBadge step="3" color={accentColor} backgroundColor={surfaceColor} borderColor={borderColor} />
                  <div>
                    <h2 className={`text-lg ${theme.uiFont}`} style={{ color: accentColor }}>
                      同步与维护
                    </h2>
                    <p className="text-sm mt-1" style={{ color: subduedText }}>
                      把同步、自动提交间隔和仓库健康信息集中在同一列，减少配置跳转。
                    </p>
                  </div>
                </div>

                <div className="space-y-8">
                  <div className="p-6 rounded border" style={{ backgroundColor: surfaceColor, borderColor }}>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm mb-2" style={{ color: accentColor }}>
                          同步状态
                        </label>
                        {lastSyncTime && (
                          <p className="text-sm opacity-60 mb-2">最后同步时间: {lastSyncTime}</p>
                        )}
                        {syncStatus && (
                          <div
                            className={`px-4 py-2 rounded border flex items-center gap-2 ${
                              syncStatus.success ? 'border-green-500' : 'border-red-500'
                            }`}
                            style={{ backgroundColor }}
                          >
                            {syncStatus.success ? (
                              <CheckCircle size={16} className="text-green-500" />
                            ) : (
                              <XCircle size={16} className="text-red-500" />
                            )}
                            <span className="text-sm">{syncStatus.message}</span>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={handleSync}
                        disabled={syncing || !patConfigured || !remoteUrl}
                        className="px-4 py-2 rounded border flex items-center gap-2 hover:opacity-80 transition-opacity disabled:opacity-50"
                        style={{
                          backgroundColor,
                          borderColor,
                          color: accentColor,
                        }}
                      >
                        {syncing ? <Loader size={16} className="animate-spin" /> : <ArrowRightLeft size={16} />}
                        <span>{syncing ? '同步中...' : '立即同步'}</span>
                      </button>

                      {(!patConfigured || !remoteUrl) && (
                        <p className="text-xs opacity-60">
                          {!patConfigured && '请先配置 PAT。'}
                          {!remoteUrl && '请先连接 origin。'}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="p-6 rounded border" style={{ backgroundColor: surfaceColor, borderColor }}>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm mb-2" style={{ color: accentColor }}>
                          自动提交间隔（分钟）
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={120}
                          value={autoCommitInterval}
                          onChange={(e) => setAutoCommitInterval(Number(e.target.value || 15))}
                          className="w-full px-4 py-2 rounded border"
                          style={{
                            backgroundColor,
                            borderColor,
                            color: bodyTextColor,
                          }}
                        />
                      </div>
                      <div className="text-xs opacity-60">
                        提交范围固定为 `workspace`，当前版本不开放切换。
                      </div>
                      <button
                        onClick={handleSaveWorkspaceConfig}
                        disabled={savingConfig}
                        className="px-4 py-2 rounded border flex items-center gap-2 hover:opacity-80 transition-opacity disabled:opacity-50"
                        style={{
                          backgroundColor,
                          borderColor,
                          color: accentColor,
                        }}
                      >
                        {savingConfig ? <Loader size={16} className="animate-spin" /> : <Save size={16} />}
                        <span>保存工作区配置</span>
                      </button>
                    </div>
                  </div>

                  <div className="p-6 rounded border" style={{ backgroundColor: surfaceColor, borderColor }}>
                    <div className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div
                          className="rounded border p-4"
                          style={{
                            backgroundColor,
                            borderColor,
                          }}
                        >
                          <div className="text-xs opacity-50 mb-2">当前分支</div>
                          <div className="text-sm opacity-80 flex items-center gap-2">
                            <GitBranch size={16} />
                            <span>{repoInfo.branch || 'main'}</span>
                          </div>
                        </div>
                        <div
                          className="rounded border p-4"
                          style={{
                            backgroundColor,
                            borderColor,
                          }}
                        >
                          <div className="text-xs opacity-50 mb-2">提交数量</div>
                          <div className="text-sm opacity-80 flex items-center gap-2">
                            <Database size={16} />
                            <span>{repoInfo.commitCount}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-xs opacity-60">
                        最新提交：{repoInfo.latestCommit || '暂无'}
                      </div>
                      <div className="text-xs opacity-50 break-all">
                        工作区路径：{workspacePath || '未初始化'}
                      </div>
                      <button
                        onClick={handleRunGitGc}
                        className="px-4 py-2 rounded border flex items-center gap-2 hover:opacity-80 transition-opacity"
                        style={{
                          backgroundColor,
                          borderColor,
                          color: accentColor,
                        }}
                      >
                        <RefreshCw size={16} />
                        <span>执行 Git 维护</span>
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
