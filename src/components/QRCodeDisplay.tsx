/**
 * No Visitors - 二维码显示组件
 * 用于生成和显示 PAT token 的二维码
 * 支持扫描后自动解析 JSON 格式的 PAT 数据
 */

'use client';

import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useTheme } from './ThemeProvider';
import { getThemeBgColor, getThemeBorderColor } from '@/lib/themeStyles';

/**
 * PAT 二维码数据格式
 * 用于在桌面端和手机端之间传递 PAT token
 */
export interface PatQRCodeData {
  /** 数据类型标识 */
  type: 'no-visitors-pat';
  /** PAT token */
  pat: string;
  /** 生成时间戳 */
  timestamp: number;
  /** 版本号，用于兼容性检查 */
  version: string;
}

interface QRCodeDisplayProps {
  /** PAT token 值 */
  patToken: string;
  /** 二维码尺寸（像素） */
  size?: number;
  /** 是否显示加载状态 */
  loading?: boolean;
}

/**
 * 二维码显示组件
 * 将 PAT token 编码为 JSON 格式并生成二维码
 */
export function QRCodeDisplay({ patToken, size = 256, loading = false }: QRCodeDisplayProps) {
  const { theme } = useTheme();

  // 构建二维码数据（JSON 格式）
  const qrData: PatQRCodeData = {
    type: 'no-visitors-pat',
    pat: patToken,
    timestamp: Date.now(),
    version: '1.0.0',
  };

  const qrCodeString = JSON.stringify(qrData);

  return (
    <div
      className="flex flex-col items-center justify-center p-4 rounded border"
      style={{
        backgroundColor: getThemeBgColor(theme),
        borderColor: getThemeBorderColor(theme),
      }}
    >
      {loading ? (
        <div
          className="flex items-center justify-center"
          style={{ width: size, height: size }}
        >
          <p className="text-sm opacity-60">生成中...</p>
        </div>
      ) : patToken ? (
        <>
          <div
            className="p-4 rounded"
            style={{
              backgroundColor: '#FFFFFF', // 二维码需要白色背景以确保扫描精度
              border: `2px solid ${getThemeBorderColor(theme)}`,
            }}
          >
            <QRCodeSVG
              value={qrCodeString}
              size={size - 32} // 减去 padding
              level="M" // 错误纠正级别：L, M, Q, H
              includeMargin={false}
              fgColor={theme.id === 'vellum' ? '#292524' : '#E7E5E4'} // 前景色（暗色模式适配）
            />
          </div>
          <p className="text-xs opacity-60 mt-4 text-center max-w-xs">
            使用手机扫描此二维码即可导入 PAT Token
          </p>
        </>
      ) : (
        <div
          className="flex items-center justify-center"
          style={{ width: size, height: size }}
        >
          <p className="text-sm opacity-60 text-center px-4">
            暂无 PAT Token 可生成二维码
            <br />
            <span className="text-xs">请先配置 PAT Token</span>
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * 解析二维码数据
 * 从扫描得到的字符串中提取 PAT token
 * 
 * @param qrString 扫描得到的二维码字符串
 * @returns 解析后的 PAT token，如果格式不正确返回 null
 */
export function parsePatFromQRCode(qrString: string): string | null {
  try {
    const data: PatQRCodeData = JSON.parse(qrString);
    
    // 验证数据格式
    if (data.type === 'no-visitors-pat' && data.pat) {
      return data.pat;
    }
    
    return null;
  } catch (error) {
    // 如果不是 JSON 格式，可能是旧版本的纯 PAT token（兼容性处理）
    // 直接返回字符串作为 PAT
    return qrString.trim() || null;
  }
}

