/**
 * No Visitors - 平台检测工具
 * 提供平台检测和移动端判断功能
 */

import { getPlatform } from './api';

/**
 * 获取平台信息
 * @returns 平台字符串
 */
export async function getPlatformInfo(): Promise<'windows' | 'linux' | 'android'> {
  return await getPlatform();
}

/**
 * 判断是否为移动端
 * @returns 是否为移动端（Android）
 */
export async function isMobile(): Promise<boolean> {
  const platform = await getPlatform();
  return platform === 'android';
}

