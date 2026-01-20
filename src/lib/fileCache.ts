/**
 * No Visitors - 文件内容缓存模块
 * 负责缓存文件内容，减少IO操作频率
 * 
 * 缓存策略：
 * - 使用内存缓存（Map）存储文件内容
 * - LRU（最近最少使用）策略管理缓存大小
 * - 文件写入/删除/重命名时自动使缓存失效
 * - 支持手动清除缓存
 */

// 缓存项接口
interface CacheItem {
  content: string;
  timestamp: number; // 缓存时间戳
  accessCount: number; // 访问次数（用于LRU）
  lastAccessTime: number; // 最后访问时间
}

// 文件缓存类
class FileCache {
  private cache: Map<string, CacheItem> = new Map();
  private maxSize: number = 100; // 最大缓存文件数
  private maxAge: number = 5 * 60 * 1000; // 缓存最大存活时间（5分钟）
  private configFileMaxAge: number = 30 * 60 * 1000; // 配置文件缓存最大存活时间（30分钟）

  /**
   * 检查文件是否为配置文件（主题配置文件等）
   * @param path 文件路径
   * @returns 是否为配置文件
   */
  private isConfigFile(path: string): boolean {
    return path.includes('.vnode.json') || path.includes('.config/');
  }

  /**
   * 获取缓存的文件内容
   * @param path 文件路径
   * @returns 缓存的内容，如果不存在或已过期则返回 null
   */
  get(path: string): string | null {
    const normalizedPath = this.normalizePath(path);
    const item = this.cache.get(normalizedPath);

    if (!item) {
      return null;
    }

    // 检查缓存是否过期（配置文件使用更长的过期时间）
    const now = Date.now();
    const maxAge = this.isConfigFile(normalizedPath) ? this.configFileMaxAge : this.maxAge;
    if (now - item.timestamp > maxAge) {
      this.cache.delete(normalizedPath);
      return null;
    }

    // 更新访问信息
    item.accessCount++;
    item.lastAccessTime = now;

    return item.content;
  }

  /**
   * 设置缓存的文件内容
   * @param path 文件路径
   * @param content 文件内容
   */
  set(path: string, content: string): void {
    const normalizedPath = this.normalizePath(path);
    const now = Date.now();

    // 如果缓存已满，删除最久未使用的项
    if (this.cache.size >= this.maxSize && !this.cache.has(normalizedPath)) {
      this.evictLRU();
    }

    this.cache.set(normalizedPath, {
      content,
      timestamp: now,
      accessCount: 1,
      lastAccessTime: now,
    });
  }

  /**
   * 删除指定路径的缓存
   * @param path 文件路径
   */
  delete(path: string): void {
    const normalizedPath = this.normalizePath(path);
    this.cache.delete(normalizedPath);
  }

  /**
   * 清除所有缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 清除指定目录下的所有缓存（用于目录删除/重命名）
   * @param dirPath 目录路径
   */
  clearDirectory(dirPath: string): void {
    const normalizedDirPath = this.normalizePath(dirPath);
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (key.startsWith(normalizedDirPath)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * 使缓存失效（用于文件写入/删除/重命名）
   * @param path 文件路径
   */
  invalidate(path: string): void {
    this.delete(path);
  }

  /**
   * 使目录下的所有缓存失效（用于目录操作）
   * @param dirPath 目录路径
   */
  invalidateDirectory(dirPath: string): void {
    this.clearDirectory(dirPath);
  }

  /**
   * 规范化路径（统一路径格式）
   * @param path 原始路径
   * @returns 规范化后的路径
   */
  private normalizePath(path: string): string {
    // 移除 .enc 扩展名（如果存在），统一使用不带扩展名的路径作为key
    let normalized = path;
    if (normalized.endsWith('.enc')) {
      normalized = normalized.slice(0, -4);
    }
    // 统一使用正斜杠
    normalized = normalized.replace(/\\/g, '/');
    // 移除末尾的斜杠（目录路径）
    normalized = normalized.replace(/\/$/, '');
    return normalized;
  }

  /**
   * 使用LRU策略删除最久未使用的缓存项
   */
  private evictLRU(): void {
    if (this.cache.size === 0) return;

    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, item] of this.cache.entries()) {
      // 优先删除访问次数少且最久未访问的项
      const score = item.lastAccessTime - item.accessCount * 1000;
      if (score < oldestTime) {
        oldestTime = score;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * 获取缓存统计信息（用于调试）
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: 0, // TODO: 实现命中率统计
    };
  }

  /**
   * 清理过期缓存
   */
  cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, item] of this.cache.entries()) {
      // 配置文件使用更长的过期时间
      const maxAge = this.isConfigFile(key) ? this.configFileMaxAge : this.maxAge;
      if (now - item.timestamp > maxAge) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));
  }
}

// 创建全局缓存实例
const fileCache = new FileCache();

// 定期清理过期缓存（每5分钟）
if (typeof window !== 'undefined') {
  setInterval(() => {
    fileCache.cleanup();
  }, 5 * 60 * 1000);
}

/**
 * 获取文件内容（带缓存）
 * @param path 文件路径
 * @param readFn 实际读取文件的函数
 * @returns 文件内容
 */
export async function getCachedFile(
  path: string,
  readFn: (path: string) => Promise<string>
): Promise<string> {
  // 先尝试从缓存获取
  const cached = fileCache.get(path);
  if (cached !== null) {
    return cached;
  }

  // 缓存未命中，从文件系统读取
  const content = await readFn(path);
  
  // 存入缓存
  fileCache.set(path, content);

  return content;
}

/**
 * 使文件缓存失效
 * @param path 文件路径
 */
export function invalidateFileCache(path: string): void {
  fileCache.invalidate(path);
}

/**
 * 使目录缓存失效
 * @param dirPath 目录路径
 */
export function invalidateDirectoryCache(dirPath: string): void {
  fileCache.invalidateDirectory(dirPath);
}

/**
 * 清除所有缓存
 */
export function clearFileCache(): void {
  fileCache.clear();
}

/**
 * 获取缓存统计信息
 */
export function getCacheStats() {
  return fileCache.getStats();
}

// 导出缓存实例（用于高级操作）
export { fileCache };

