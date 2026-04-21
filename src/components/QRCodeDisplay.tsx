/**
 * No Visitors - 二维码显示组件
 * 用于生成和显示迁移数据 / 主密钥 的二维码
 */

'use client';

import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useTheme } from './ThemeProvider';
import { getThemeBgColor, getThemeBorderColor } from '@/lib/themeStyles';

export interface PatQRCodeData {
  type: 'no-visitors-pat';
  pat: string;
  timestamp: number;
  version: string;
}

export interface MasterKeyQRCodeData {
  type: 'no-visitors-master-key';
  key: string;
  timestamp: number;
  version: string;
}

export type AppQRCodeData = PatQRCodeData | MasterKeyQRCodeData;

interface QRCodeDisplayProps {
  payload: AppQRCodeData | null;
  size?: number;
  loading?: boolean;
  helperText?: string;
  emptyText?: string;
}

export function QRCodeDisplay({
  payload,
  size = 256,
  loading = false,
  helperText,
  emptyText = '暂无可生成的二维码数据',
}: QRCodeDisplayProps) {
  const { theme } = useTheme();
  const qrCodeString = payload ? JSON.stringify(payload) : '';

  return (
    <div
      className="flex flex-col items-center justify-center p-4 rounded border"
      style={{
        backgroundColor: getThemeBgColor(theme),
        borderColor: getThemeBorderColor(theme),
      }}
    >
      {loading ? (
        <div className="flex items-center justify-center" style={{ width: size, height: size }}>
          <p className="text-sm opacity-60">生成中...</p>
        </div>
      ) : payload ? (
        <>
          <div
            className="p-4 rounded-xl shadow-sm"
            style={{
              backgroundColor: '#FFFFFF',
              border: '3px solid #111111',
            }}
          >
            <QRCodeSVG
              value={qrCodeString}
              size={size - 32}
              level="H"
              includeMargin={true}
              fgColor="#111111"
              bgColor="#FFFFFF"
            />
          </div>
          <p className="text-xs opacity-70 mt-4 text-center max-w-xs">
            {helperText || '请仅在可信设备之间传输此二维码，并确保扫描环境光线充足。'}
          </p>
        </>
      ) : (
        <div className="flex items-center justify-center" style={{ width: size, height: size }}>
          <p className="text-sm opacity-60 text-center px-4">{emptyText}</p>
        </div>
      )}
    </div>
  );
}

export function parseQRCodePayload(qrString: string): AppQRCodeData | null {
  try {
    const data = JSON.parse(qrString) as Partial<AppQRCodeData>;

    if (data.type === 'no-visitors-pat' && typeof data.pat === 'string' && data.pat.trim()) {
      return {
        type: 'no-visitors-pat',
        pat: data.pat.trim(),
        timestamp: typeof data.timestamp === 'number' ? data.timestamp : Date.now(),
        version: typeof data.version === 'string' ? data.version : '1.0.0',
      };
    }

    if (data.type === 'no-visitors-master-key' && typeof data.key === 'string' && data.key.trim()) {
      return {
        type: 'no-visitors-master-key',
        key: data.key.trim(),
        timestamp: typeof data.timestamp === 'number' ? data.timestamp : Date.now(),
        version: typeof data.version === 'string' ? data.version : '1.0.0',
      };
    }

    return null;
  } catch {
    return qrString.trim()
      ? {
          type: 'no-visitors-pat',
          pat: qrString.trim(),
          timestamp: Date.now(),
          version: 'legacy',
        }
      : null;
  }
}

export function parsePatFromQRCode(qrString: string): string | null {
  const payload = parseQRCodePayload(qrString);
  return payload?.type === 'no-visitors-pat' ? payload.pat : null;
}

export function parseMasterKeyFromQRCode(qrString: string): string | null {
  const payload = parseQRCodePayload(qrString);
  return payload?.type === 'no-visitors-master-key' ? payload.key : null;
}
