/**
 * No Visitors - 状态缓存工具模块
 * 负责保存和恢复应用状态到 localStorage
 * 包括文件滚动位置、光标位置、文件树展开状态等
 */

// 文件状态接口
export interface FileState {
  scrollTop: number;
  cursorPosition: number;
}

// 缓存键前缀
const CACHE_PREFIX = 'vana:';
const FILE_STATE_PREFIX = `${CACHE_PREFIX}fileState:`;
const TREE_EXPANDED_KEY = `${CACHE_PREFIX}treeExpanded`;

/**
 * 保存文件状态（滚动位置和光标位置）
 * @param filePath 文件路径
 * @param scrollTop 滚动位置
 * @param cursorPosition 光标位置
 */
export function saveFileState(
  filePath: string,
  scrollTop: number,
  cursorPosition: number
): void {
  try {
    const state: FileState = {
      scrollTop,
      cursorPosition,
    };
    const key = `${FILE_STATE_PREFIX}${filePath}`;
    localStorage.setItem(key, JSON.stringify(state));
  } catch (error) {
    // localStorage 可能已满或不可用，静默失败
    console.warn('保存文件状态失败:', error);
  }
}

/**
 * 加载文件状态
 * @param filePath 文件路径
 * @returns 文件状态，如果不存在则返回 null
 */
export function loadFileState(filePath: string): FileState | null {
  try {
    const key = `${FILE_STATE_PREFIX}${filePath}`;
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    
    const state = JSON.parse(stored) as FileState;
    return state;
  } catch (error) {
    console.warn('加载文件状态失败:', error);
    return null;
  }
}

/**
 * 清除文件状态
 * @param filePath 文件路径
 */
export function clearFileState(filePath: string): void {
  try {
    const key = `${FILE_STATE_PREFIX}${filePath}`;
    localStorage.removeItem(key);
  } catch (error) {
    console.warn('清除文件状态失败:', error);
  }
}

/**
 * 保存文件树展开状态
 * @param expandedPaths 展开的路径集合（数组形式）
 */
export function saveTreeExpandedState(expandedPaths: string[]): void {
  try {
    localStorage.setItem(TREE_EXPANDED_KEY, JSON.stringify(expandedPaths));
  } catch (error) {
    console.warn('保存树展开状态失败:', error);
  }
}

/**
 * 加载文件树展开状态
 * @returns 展开的路径数组，如果不存在则返回空数组
 */
export function loadTreeExpandedState(): string[] {
  try {
    const stored = localStorage.getItem(TREE_EXPANDED_KEY);
    if (!stored) return [];
    
    const paths = JSON.parse(stored) as string[];
    return Array.isArray(paths) ? paths : [];
  } catch (error) {
    console.warn('加载树展开状态失败:', error);
    return [];
  }
}

/**
 * 清除所有缓存状态（用于调试或重置）
 */
export function clearAllCache(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) {
        keys.push(key);
      }
    }
    keys.forEach(key => localStorage.removeItem(key));
  } catch (error) {
    console.warn('清除缓存失败:', error);
  }
}

