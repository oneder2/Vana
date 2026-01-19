/**
 * No Visitors - 窗口状态管理工具
 * 保存和恢复窗口大小、位置等状态
 */

// 窗口状态接口
export interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized?: boolean;
}

// 缓存键
const WINDOW_STATE_KEY = 'vana:windowState';

/**
 * 保存窗口状态
 * @param state 窗口状态
 */
export function saveWindowState(state: WindowState): void {
  try {
    localStorage.setItem(WINDOW_STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('保存窗口状态失败:', error);
  }
}

/**
 * 加载窗口状态
 * @returns 窗口状态，如果不存在则返回 null
 */
export function loadWindowState(): WindowState | null {
  try {
    const stored = localStorage.getItem(WINDOW_STATE_KEY);
    if (!stored) return null;
    
    const state = JSON.parse(stored) as WindowState;
    return state;
  } catch (error) {
    console.warn('加载窗口状态失败:', error);
    return null;
  }
}

/**
 * 清除窗口状态
 */
export function clearWindowState(): void {
  try {
    localStorage.removeItem(WINDOW_STATE_KEY);
  } catch (error) {
    console.warn('清除窗口状态失败:', error);
  }
}

