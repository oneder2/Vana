/**
 * Vana - 二维码扫描组件
 * 用于手机端扫描二维码并导入迁移数据 / 主密钥
 */

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { useTheme } from './ThemeProvider';
import { getThemeBgColor, getThemeBorderColor, getThemeAccentColor, getThemeSurfaceColor } from '@/lib/themeStyles';
import { parseQRCodePayload, type AppQRCodeData } from './QRCodeDisplay';
import { X, CheckCircle, XCircle } from 'lucide-react';

interface QRCodeScannerProps {
  onScanSuccess: (payload: AppQRCodeData) => void;
  onScanError?: (error: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function QRCodeScanner({ onScanSuccess, onScanError, isOpen, onClose }: QRCodeScannerProps) {
  const { theme } = useTheme();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const initScanner = async () => {
      try {
        if (!containerRef.current) {
          return;
        }

        const html5QrCode = new Html5Qrcode('qr-reader');
        scannerRef.current = html5QrCode;

        const cameras = await Html5Qrcode.getCameras();
        if (!cameras || cameras.length === 0) {
          throw new Error('未找到可用的摄像头');
        }

        const cameraId = cameras.find((camera) => camera.label.toLowerCase().includes('back'))?.id || cameras[0].id;

        await html5QrCode.start(
          cameraId,
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1,
            disableFlip: false,
          },
          async (decodedText) => {
            setLastResult(decodedText);
            const payload = parseQRCodePayload(decodedText);

            if (payload) {
              await stopScanner();
              onScanSuccess(payload);
            } else {
              setError('无法解析二维码中的内容，请确认它来自 Vana 的导出功能');
            }
          },
          () => {
            // 持续扫描时忽略中间错误
          }
        );

        setIsScanning(true);
        setError(null);
      } catch (err: any) {
        const errorMsg = err?.message || '无法访问摄像头，请检查权限设置';
        setError(errorMsg);
        setIsScanning(false);
        onScanError?.(errorMsg);
      }
    };

    initScanner();
    return () => {
      void stopScanner();
    };
  }, [isOpen, onScanSuccess, onScanError]);

  const stopScanner = async () => {
    if (scannerRef.current && isScanning) {
      try {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
      } catch (err) {
        console.error('[二维码扫描] 停止扫描器失败:', err);
      } finally {
        setIsScanning(false);
      }
    }
  };

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
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center" style={{ backgroundColor: 'rgba(0, 0, 0, 0.82)' }}>
      <div className="w-full flex items-center justify-between px-4 py-3" style={{ backgroundColor: getThemeSurfaceColor(theme) }}>
        <h2 className="text-lg font-medium" style={{ color: getThemeAccentColor(theme) }}>扫描迁移二维码</h2>
        <button
          onClick={handleClose}
          className="p-2 rounded hover:opacity-80 transition-opacity"
          style={{ backgroundColor: getThemeBgColor(theme), color: getThemeAccentColor(theme) }}
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center w-full px-4 py-8">
        {error ? (
          <div className="w-full max-w-md p-6 rounded border" style={{ backgroundColor: getThemeSurfaceColor(theme), borderColor: getThemeBorderColor(theme) }}>
            <div className="flex items-start gap-3">
              <XCircle size={24} className="text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium mb-2" style={{ color: getThemeAccentColor(theme) }}>扫描失败</p>
                <p className="text-sm opacity-80">{error}</p>
                <button
                  onClick={handleClose}
                  className="mt-4 px-4 py-2 rounded border text-sm hover:opacity-80 transition-opacity"
                  style={{ backgroundColor: getThemeBgColor(theme), borderColor: getThemeBorderColor(theme), color: getThemeAccentColor(theme) }}
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="w-full max-w-md rounded overflow-hidden border-4" style={{ borderColor: getThemeAccentColor(theme) }}>
              <div id="qr-reader" ref={containerRef} className="w-full" style={{ minHeight: '300px' }} />
            </div>
            <p className="text-sm opacity-80 mt-6 text-center px-4" style={{ color: getThemeAccentColor(theme) }}>
              将二维码对准扫描框
              <br />
              <span className="text-xs">支持导入迁移数据或主密钥，建议在明亮环境下扫描</span>
            </p>
            {lastResult && (
              <div className="mt-4 px-4 py-2 rounded border flex items-center gap-2" style={{ backgroundColor: getThemeSurfaceColor(theme), borderColor: getThemeBorderColor(theme) }}>
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
