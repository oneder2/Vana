/**
 * No Visitors - 二维码扫描组件
 * 用于手机端扫描二维码并导入 PAT token
 * 使用 html5-qrcode 库实现跨平台支持
 */

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { useTheme } from './ThemeProvider';
import { getThemeBgColor, getThemeBorderColor, getThemeAccentColor, getThemeSurfaceColor } from '@/lib/themeStyles';
import { parsePatFromQRCode } from './QRCodeDisplay';
import { Camera, X, CheckCircle, XCircle } from 'lucide-react';

interface QRCodeScannerProps {
  /** 扫描成功回调，返回解析后的 PAT token */
  onScanSuccess: (patToken: string) => void;
  /** 扫描失败/取消回调 */
  onScanError?: (error: string) => void;
  /** 是否显示扫描器 */
  isOpen: boolean;
  /** 关闭扫描器回调 */
  onClose: () => void;
}

/**
 * 二维码扫描组件
 * 在移动端使用摄像头扫描二维码并解析 PAT token
 */
export function QRCodeScanner({
  onScanSuccess,
  onScanError,
  isOpen,
  onClose,
}: QRCodeScannerProps) {
  const { theme } = useTheme();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  // 初始化扫描器
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const initScanner = async () => {
      try {
        if (!containerRef.current) {
          return;
        }

        const config = {
          fps: 10, // 扫描帧率
          qrbox: { width: 250, height: 250 }, // 扫描框大小
          aspectRatio: 1.0, // 宽高比
          disableFlip: false, // 允许翻转
        };

        const html5QrCode = new Html5Qrcode('qr-reader');
        scannerRef.current = html5QrCode;

        // 获取可用的摄像头
        const cameras = await Html5Qrcode.getCameras();
        
        if (cameras && cameras.length > 0) {
          // 优先使用后置摄像头
          const cameraId = cameras.find(c => c.label.toLowerCase().includes('back'))?.id || cameras[0].id;
          
          await html5QrCode.start(
            cameraId,
            {
              ...config,
            },
            (decodedText) => {
              // 扫描成功
              console.log('[二维码扫描] 扫描成功:', decodedText);
              setLastResult(decodedText);
              
              // 解析 PAT token
              const patToken = parsePatFromQRCode(decodedText);
              
              if (patToken) {
                // 停止扫描
                stopScanner();
                // 调用成功回调
                onScanSuccess(patToken);
              } else {
                setError('无法解析二维码中的 PAT Token，请确保二维码格式正确');
              }
            },
            (errorMessage) => {
              // 扫描过程中的错误（可以忽略，因为会持续扫描）
              // console.log('[二维码扫描] 扫描中...', errorMessage);
            }
          );
          
          setIsScanning(true);
          setError(null);
        } else {
          throw new Error('未找到可用的摄像头');
        }
      } catch (err: any) {
        console.error('[二维码扫描] 初始化失败:', err);
        const errorMsg = err.message || '无法访问摄像头，请检查权限设置';
        setError(errorMsg);
        setIsScanning(false);
        if (onScanError) {
          onScanError(errorMsg);
        }
      }
    };

    initScanner();

    // 清理函数
    return () => {
      stopScanner();
    };
  }, [isOpen, onScanSuccess, onScanError]);

  // 停止扫描器
  const stopScanner = async () => {
    if (scannerRef.current && isScanning) {
      try {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
        setIsScanning(false);
      } catch (err) {
        console.error('[二维码扫描] 停止扫描器失败:', err);
      }
    }
  };

  // 处理关闭
  const handleClose = async () => {
    await stopScanner();
    setError(null);
    setLastResult(null);
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
      }}
    >
      {/* 头部控制栏 */}
      <div
        className="w-full flex items-center justify-between px-4 py-3"
        style={{
          backgroundColor: getThemeSurfaceColor(theme),
        }}
      >
        <h2
          className="text-lg font-medium"
          style={{ color: getThemeAccentColor(theme) }}
        >
          扫描二维码
        </h2>
        <button
          onClick={handleClose}
          className="p-2 rounded hover:opacity-80 transition-opacity"
          style={{
            backgroundColor: getThemeBgColor(theme),
            color: getThemeAccentColor(theme),
          }}
        >
          <X size={20} />
        </button>
      </div>

      {/* 扫描区域 */}
      <div className="flex-1 flex flex-col items-center justify-center w-full px-4 py-8">
        {error ? (
          <div
            className="w-full max-w-md p-6 rounded border"
            style={{
              backgroundColor: getThemeSurfaceColor(theme),
              borderColor: getThemeBorderColor(theme),
            }}
          >
            <div className="flex items-start gap-3">
              <XCircle size={24} className="text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium mb-2" style={{ color: getThemeAccentColor(theme) }}>
                  扫描失败
                </p>
                <p className="text-sm opacity-80">{error}</p>
                <button
                  onClick={handleClose}
                  className="mt-4 px-4 py-2 rounded border text-sm hover:opacity-80 transition-opacity"
                  style={{
                    backgroundColor: getThemeBgColor(theme),
                    borderColor: getThemeBorderColor(theme),
                    color: getThemeAccentColor(theme),
                  }}
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div
              className="w-full max-w-md rounded overflow-hidden border-4"
              style={{
                borderColor: getThemeAccentColor(theme),
              }}
            >
              <div
                id="qr-reader"
                className="w-full"
                style={{
                  minHeight: '300px',
                }}
              />
            </div>
            <p
              className="text-sm opacity-80 mt-6 text-center px-4"
              style={{ color: getThemeAccentColor(theme) }}
            >
              将二维码对准扫描框
              <br />
              <span className="text-xs">请确保二维码清晰可见</span>
            </p>
            {lastResult && (
              <div
                className="mt-4 px-4 py-2 rounded border flex items-center gap-2"
                style={{
                  backgroundColor: getThemeSurfaceColor(theme),
                  borderColor: getThemeBorderColor(theme),
                }}
              >
                <CheckCircle size={16} className="text-green-500" />
                <span className="text-xs opacity-80">已扫描，正在处理...</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

