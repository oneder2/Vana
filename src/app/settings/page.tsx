/**
 * No Visitors - 设置页面
 * 提供应用设置界面，包括PAT配置和二维码验证等功能
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useTheme } from '@/components/ThemeProvider';
import { getThemeBgColor, getThemeSurfaceColor, getThemeBorderColor, getThemeAccentColor } from '@/lib/themeStyles';
import { Settings, Save, Trash2, RefreshCw, CheckCircle, XCircle, Loader, Camera } from 'lucide-react';
import Link from 'next/link';
import {
  storePatToken,
  getPatToken,
  removePatToken,
  hasPatToken,
  addRemote,
  getRemoteUrl,
  beginSync,
  continueSync,
  abortSync,
  resolveConflict,
  getWorkspacePath,
} from '@/lib/api';
import { ConflictModal, type ConflictChoice } from '@/components/ConflictModal';
import { QRCodeDisplay } from '@/components/QRCodeDisplay';
import { QRCodeScanner } from '@/components/QRCodeScanner';
import { TitleBar } from '@/components/TitleBar';
import { isMobile } from '@/lib/platform';

/**
 * 设置页面组件
 * 提供PAT配置、远程仓库配置和同步功能
 */
export default function SettingsPage() {
  const { theme } = useTheme();
  
  // PAT相关状态
  const [patToken, setPatToken] = useState('');
  const [patConfigured, setPatConfigured] = useState(false);
  const [patSaving, setPatSaving] = useState(false);
  const [patMessage, setPatMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [displayPatToken, setDisplayPatToken] = useState<string>(''); // 用于二维码显示的 PAT token
  const [showQRCode, setShowQRCode] = useState(false); // 是否显示二维码
  const [showScanner, setShowScanner] = useState(false); // 是否显示扫描器
  const [isMobileDevice, setIsMobileDevice] = useState(false); // 是否为移动设备
  
  // 远程仓库相关状态
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [workspacePath, setWorkspacePath] = useState<string>('');
  const [remoteConfiguring, setRemoteConfiguring] = useState(false);
  
  // 同步相关状态
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [syncConflict, setSyncConflict] = useState<import('@/lib/api').SyncConflict | null>(null);
  
  // 默认远程仓库URL
  const DEFAULT_REMOTE_URL = 'https://github.com/oneder2/Erlang-Writing.git';
  
  // 初始化：检查PAT和远程仓库状态
  useEffect(() => {
    const init = async () => {
      try {
        // 检查是否为移动设备
        const mobile = await isMobile();
        setIsMobileDevice(mobile);
        
        // 检查PAT是否已配置
        const hasPat = await hasPatToken();
        setPatConfigured(hasPat);
        
        // 如果已配置 PAT，获取它用于生成二维码
        if (hasPat) {
          const token = await getPatToken();
          if (token) {
            setDisplayPatToken(token);
          }
        }
        
        // 获取工作区路径
        const workspace = await getWorkspacePath();
        setWorkspacePath(workspace);
        
        // 获取远程仓库URL
        const remote = await getRemoteUrl(workspace, 'origin');
        setRemoteUrl(remote);
      } catch (error) {
        console.error('初始化设置页面失败:', error);
      }
    };
    
    init();
  }, []);
  
  // 保存PAT
  const handleSavePat = async () => {
    if (!patToken.trim()) {
      setPatMessage({ type: 'error', text: '请输入PAT Token' });
      return;
    }
    
    setPatSaving(true);
    setPatMessage(null);
    
    try {
      await storePatToken(patToken);
      setPatConfigured(true);
      setDisplayPatToken(patToken); // 保存用于二维码显示
      setPatToken(''); // 清空输入框
      setPatMessage({ type: 'success', text: 'PAT Token 已保存' });
      setShowQRCode(true); // 自动显示二维码
    } catch (error) {
      setPatMessage({ type: 'error', text: `保存失败: ${error}` });
    } finally {
      setPatSaving(false);
    }
  };
  
  // 清除PAT
  const handleRemovePat = async () => {
    setPatSaving(true);
    setPatMessage(null);
    
    try {
      await removePatToken();
      setPatConfigured(false);
      setPatToken('');
      setDisplayPatToken(''); // 清空显示用的 PAT
      setShowQRCode(false); // 隐藏二维码
      setPatMessage({ type: 'success', text: 'PAT Token 已清除' });
    } catch (error) {
      setPatMessage({ type: 'error', text: `清除失败: ${error}` });
    } finally {
      setPatSaving(false);
    }
  };
  
  // 生成二维码：从已保存的 PAT 生成二维码
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
  
  // 处理二维码扫描成功
  const handleScanSuccess = async (patToken: string) => {
    try {
      // 自动保存扫描到的 PAT token
      await storePatToken(patToken);
      setPatConfigured(true);
      setDisplayPatToken(patToken);
      setShowScanner(false);
      setPatMessage({ type: 'success', text: 'PAT Token 已通过扫描导入' });
    } catch (error) {
      setPatMessage({ type: 'error', text: `保存 PAT Token 失败: ${error}` });
    }
  };
  
  // 处理扫描错误
  const handleScanError = (error: string) => {
    setPatMessage({ type: 'error', text: `扫描失败: ${error}` });
  };
  
  // 配置远程仓库
  const handleConfigureRemote = async () => {
    if (!workspacePath) {
      setSyncStatus({ success: false, message: '无法获取工作区路径' });
      return;
    }
    
    setRemoteConfiguring(true);
    
    try {
      await addRemote(workspacePath, 'origin', DEFAULT_REMOTE_URL);
      setRemoteUrl(DEFAULT_REMOTE_URL);
      setSyncStatus({ success: true, message: '远程仓库配置成功' });
    } catch (error) {
      setSyncStatus({ success: false, message: `配置失败: ${error}` });
    } finally {
      setRemoteConfiguring(false);
    }
  };
  
  // 执行同步
  const handleSync = async () => {
    if (!workspacePath) {
      setSyncStatus({ success: false, message: '无法获取工作区路径' });
      return;
    }
    
    setSyncing(true);
    setSyncStatus(null);
    
    try {
      // 获取PAT Token
      const pat = await getPatToken();
      
      // 执行同步
      const result = await beginSync(workspacePath, 'origin', 'main', pat || undefined);
      
      if (result.success) {
        if (result.has_conflict) {
          setSyncConflict(result.conflict ?? null);
          setConflictOpen(true);
          setSyncStatus({ success: true, message: '检测到冲突：请选择如何处理后继续同步' });
        } else {
          setSyncStatus({ success: true, message: '同步成功' });
          setLastSyncTime(new Date().toLocaleString());
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
      const items = syncConflict.files.map((f) => ({ path: f.path, choice }));
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
      style={{
        backgroundColor: getThemeBgColor(theme),
      }}
    >
      {/* 自定义标题栏 */}
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
      {/* 顶部导航栏 */}
      <header
        className={`h-14 flex items-center justify-between px-4 z-50 border-b transition-transform duration-300`}
        style={{
          backgroundColor: getThemeSurfaceColor(theme),
          borderColor: getThemeBorderColor(theme),
        }}
      >
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            style={{ color: getThemeAccentColor(theme) }}
          >
            <Settings size={20} />
            <span className="text-sm">返回</span>
          </Link>
          <div
            className={`flex items-center gap-1 text-[10px] ${theme.uiFont} uppercase tracking-tighter opacity-60`}
          >
            <span>STYX-Ω</span>
            <span className="opacity-40">/</span>
            <span className={theme.accent}>设置</span>
          </div>
        </div>
      </header>

      {/* 主内容区域 */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-8 py-20">
          <h1
            className={`text-2xl mb-8 ${theme.uiFont}`}
            style={{ color: getThemeAccentColor(theme) }}
          >
            设置
          </h1>

          {/* PAT 配置区域 */}
          <section className="mb-12">
            <h2
              className={`text-lg mb-4 ${theme.uiFont}`}
              style={{ color: getThemeAccentColor(theme) }}
            >
              GitHub PAT 配置
            </h2>
            <div
              className="p-6 rounded border"
              style={{
                backgroundColor: getThemeSurfaceColor(theme),
                borderColor: getThemeBorderColor(theme),
              }}
            >
              <p className="text-sm opacity-60 mb-4">
                在此配置 GitHub Personal Access Token (PAT)，用于同步到 GitHub Private Repo。
              </p>
              <div className="space-y-4">
                <div>
                  <label
                    className="block text-sm mb-2"
                    style={{ color: getThemeAccentColor(theme) }}
                  >
                    PAT Token
                  </label>
                  {patConfigured ? (
                    <div className="space-y-2">
                      <div
                        className="w-full px-4 py-2 rounded border flex items-center gap-2"
                        style={{
                          backgroundColor: getThemeBgColor(theme),
                          borderColor: getThemeBorderColor(theme),
                          color: theme.id === 'vellum' ? 'rgb(41, 37, 36)' : 'rgb(231, 229, 228)',
                        }}
                      >
                        <CheckCircle size={16} className="text-green-500" />
                        <span className="text-sm">PAT Token 已配置（已隐藏）</span>
                      </div>
                      <button
                        onClick={handleRemovePat}
                        disabled={patSaving}
                        className="px-4 py-2 rounded border flex items-center gap-2 hover:opacity-80 transition-opacity disabled:opacity-50"
                        style={{
                          backgroundColor: getThemeBgColor(theme),
                          borderColor: getThemeBorderColor(theme),
                          color: getThemeAccentColor(theme),
                        }}
                      >
                        <Trash2 size={16} />
                        <span>清除 PAT</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <input
                        type="password"
                        placeholder="请输入 PAT Token"
                        value={patToken}
                        onChange={(e) => setPatToken(e.target.value)}
                        className="w-full px-4 py-2 rounded border"
                        style={{
                          backgroundColor: getThemeBgColor(theme),
                          borderColor: getThemeBorderColor(theme),
                          color: theme.id === 'vellum' ? 'rgb(41, 37, 36)' : 'rgb(231, 229, 228)',
                        }}
                        disabled={patSaving}
                      />
                      <button
                        onClick={handleSavePat}
                        disabled={patSaving || !patToken.trim()}
                        className="px-4 py-2 rounded border flex items-center gap-2 hover:opacity-80 transition-opacity disabled:opacity-50"
                        style={{
                          backgroundColor: getThemeBgColor(theme),
                          borderColor: getThemeBorderColor(theme),
                          color: getThemeAccentColor(theme),
                        }}
                      >
                        {patSaving ? <Loader size={16} className="animate-spin" /> : <Save size={16} />}
                        <span>保存 PAT</span>
                      </button>
                    </div>
                  )}
                  {patMessage && (
                    <p
                      className={`text-xs mt-2 ${
                        patMessage.type === 'success' ? 'text-green-500' : 'text-red-500'
                      }`}
                    >
                      {patMessage.text}
                    </p>
                  )}
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label
                      className="block text-sm"
                      style={{ color: getThemeAccentColor(theme) }}
                    >
                      二维码传输
                    </label>
                    <div className="flex items-center gap-2">
                      {isMobileDevice && (
                        <button
                          onClick={() => setShowScanner(true)}
                          className="text-xs px-2 py-1 rounded border hover:opacity-80 transition-opacity"
                          style={{
                            backgroundColor: getThemeBgColor(theme),
                            borderColor: getThemeBorderColor(theme),
                            color: getThemeAccentColor(theme),
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
                            backgroundColor: getThemeBgColor(theme),
                            borderColor: getThemeBorderColor(theme),
                            color: getThemeAccentColor(theme),
                          }}
                        >
                          {showQRCode ? '刷新二维码' : '生成二维码'}
                        </button>
                      )}
                    </div>
                  </div>
                  {isMobileDevice ? (
                    // 移动端：显示扫描提示或扫描结果
                    <div
                      className="w-full border-2 border-dashed flex items-center justify-center rounded"
                      style={{
                        borderColor: getThemeBorderColor(theme),
                        backgroundColor: getThemeBgColor(theme),
                        minHeight: '256px',
                      }}
                    >
                      <div className="text-center px-4 py-8">
                        <p className="text-sm opacity-80 mb-4">
                          {patConfigured
                            ? 'PAT Token 已配置'
                            : '点击"扫描二维码"按钮导入 PAT Token'}
                        </p>
                        {!patConfigured && (
                          <button
                            onClick={() => setShowScanner(true)}
                            className="px-4 py-2 rounded border flex items-center gap-2 mx-auto hover:opacity-80 transition-opacity"
                            style={{
                              backgroundColor: getThemeSurfaceColor(theme),
                              borderColor: getThemeBorderColor(theme),
                              color: getThemeAccentColor(theme),
                            }}
                          >
                            <Camera size={16} />
                            <span>扫描二维码</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    // 桌面端：显示二维码
                    <>
                      {showQRCode && patConfigured ? (
                        <QRCodeDisplay patToken={displayPatToken} size={256} />
                      ) : (
                        <div
                          className="w-64 h-64 border-2 border-dashed flex items-center justify-center rounded"
                          style={{
                            borderColor: getThemeBorderColor(theme),
                            backgroundColor: getThemeBgColor(theme),
                          }}
                        >
                          <p className="text-sm opacity-40 text-center px-4">
                            {patConfigured
                              ? '点击"生成二维码"按钮显示二维码'
                              : '请先配置 PAT Token 后生成二维码'}
                            <br />
                            <span className="text-xs">用于手机端扫描导入 PAT</span>
                          </p>
                        </div>
                      )}
                      {patConfigured && showQRCode && (
                        <p className="text-xs opacity-60 mt-2">
                          二维码包含当前 PAT Token，请妥善保管，避免泄露
                        </p>
                      )}
                    </>
                  )}
                </div>
                
                {/* 二维码扫描器（移动端） */}
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

          {/* 远程仓库配置区域 */}
          <section className="mb-12">
            <h2
              className={`text-lg mb-4 ${theme.uiFont}`}
              style={{ color: getThemeAccentColor(theme) }}
            >
              远程仓库配置
            </h2>
            <div
              className="p-6 rounded border"
              style={{
                backgroundColor: getThemeSurfaceColor(theme),
                borderColor: getThemeBorderColor(theme),
              }}
            >
              <div className="space-y-4">
                <div>
                  <label
                    className="block text-sm mb-2"
                    style={{ color: getThemeAccentColor(theme) }}
                  >
                    远程仓库URL
                  </label>
                  {remoteUrl ? (
                    <div
                      className="w-full px-4 py-2 rounded border break-words"
                      style={{
                        backgroundColor: getThemeBgColor(theme),
                        borderColor: getThemeBorderColor(theme),
                        color: theme.id === 'vellum' ? 'rgb(41, 37, 36)' : 'rgb(231, 229, 228)',
                        wordBreak: 'break-all',
                        overflowWrap: 'break-word',
                        maxWidth: '100%',
                      }}
                    >
                      {(() => {
                        try {
                          // 尝试解析URL并移除可能的PAT token
                          const urlStr = remoteUrl.replace(/^https?:\/\//, 'https://');
                          const url = new URL(urlStr);
                          // 移除用户名和密码部分（可能包含PAT）
                          const cleanUrl = `${url.protocol}//${url.host}${url.pathname}${url.search}`;
                          return cleanUrl;
                        } catch {
                          // 如果URL解析失败，直接显示但移除可能的PAT token模式
                          return remoteUrl.replace(/github_pat_[^@]+@/g, '');
                        }
                      })()}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm opacity-60 mb-2">未配置远程仓库</p>
                      <button
                        onClick={handleConfigureRemote}
                        disabled={remoteConfiguring}
                        className="px-4 py-2 rounded border flex items-center gap-2 hover:opacity-80 transition-opacity disabled:opacity-50"
                        style={{
                          backgroundColor: getThemeBgColor(theme),
                          borderColor: getThemeBorderColor(theme),
                          color: getThemeAccentColor(theme),
                        }}
                      >
                        {remoteConfiguring ? (
                          <Loader size={16} className="animate-spin" />
                        ) : (
                          <Settings size={16} />
                        )}
                        <span>配置远程仓库</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* 同步操作区域 */}
          <section className="mb-12">
            <h2
              className={`text-lg mb-4 ${theme.uiFont}`}
              style={{ color: getThemeAccentColor(theme) }}
            >
              同步操作
            </h2>
            <div
              className="p-6 rounded border"
              style={{
                backgroundColor: getThemeSurfaceColor(theme),
                borderColor: getThemeBorderColor(theme),
              }}
            >
              <div className="space-y-4">
                <div>
                  <label
                    className="block text-sm mb-2"
                    style={{ color: getThemeAccentColor(theme) }}
                  >
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
                      style={{
                        backgroundColor: getThemeBgColor(theme),
                      }}
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
                    backgroundColor: getThemeBgColor(theme),
                    borderColor: getThemeBorderColor(theme),
                    color: getThemeAccentColor(theme),
                  }}
                >
                  {syncing ? (
                    <Loader size={16} className="animate-spin" />
                  ) : (
                    <RefreshCw size={16} />
                  )}
                  <span>{syncing ? '同步中...' : '立即同步'}</span>
                </button>
                {(!patConfigured || !remoteUrl) && (
                  <p className="text-xs opacity-60">
                    {!patConfigured && '请先配置 PAT Token。'}
                    {!remoteUrl && '请先配置远程仓库。'}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* 其他设置区域（预留） */}
          <section>
            <h2
              className={`text-lg mb-4 ${theme.uiFont}`}
              style={{ color: getThemeAccentColor(theme) }}
            >
              其他设置
            </h2>
            <div
              className="p-6 rounded border"
              style={{
                backgroundColor: getThemeSurfaceColor(theme),
                borderColor: getThemeBorderColor(theme),
              }}
            >
              <p className="text-sm opacity-60">
                更多设置选项将在此处添加...
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

