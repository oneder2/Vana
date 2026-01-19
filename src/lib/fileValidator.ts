/**
 * No Visitors - 文件名验证工具
 * 验证文件名是否符合系统要求
 * 跨平台兼容（Windows/Linux）
 */

// 非法字符（在所有平台上都不允许）
const INVALID_CHARS = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'];

// Windows 保留名称（在 Windows 上不允许）
const WINDOWS_RESERVED_NAMES = [
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
];

// 文件名最大长度（Windows: 260, Linux: 255，取较小值）
const MAX_FILENAME_LENGTH = 255;

// 最小文件名长度
const MIN_FILENAME_LENGTH = 1;

/**
 * 验证结果接口
 */
export interface ValidationResult {
  /** 是否有效 */
  valid: boolean;
  /** 错误消息（如果无效） */
  error?: string;
}

/**
 * 验证文件名
 * @param fileName 文件名（不含路径）
 * @returns 验证结果
 */
export function validateFileName(fileName: string): ValidationResult {
  // 检查是否为空
  if (!fileName || fileName.trim().length === 0) {
    return {
      valid: false,
      error: '文件名不能为空',
    };
  }

  const trimmedName = fileName.trim();

  // 检查长度
  if (trimmedName.length < MIN_FILENAME_LENGTH) {
    return {
      valid: false,
      error: '文件名太短',
    };
  }

  if (trimmedName.length > MAX_FILENAME_LENGTH) {
    return {
      valid: false,
      error: `文件名过长（最大长度：${MAX_FILENAME_LENGTH} 字符）`,
    };
  }

  // 检查非法字符
  for (const char of INVALID_CHARS) {
    if (trimmedName.includes(char)) {
      return {
        valid: false,
        error: `文件名不能包含非法字符：${char}`,
      };
    }
  }

  // 检查是否以点或空格开头/结尾（Windows 不允许，Linux 允许但可能造成混淆）
  if (trimmedName.startsWith('.') || trimmedName.endsWith('.')) {
    return {
      valid: false,
      error: '文件名不能以点开头或结尾',
    };
  }

  if (trimmedName.startsWith(' ') || trimmedName.endsWith(' ')) {
    return {
      valid: false,
      error: '文件名不能以空格开头或结尾',
    };
  }

  // 检查 Windows 保留名称（不区分大小写）
  const upperName = trimmedName.toUpperCase();
  // 检查是否是保留名称（精确匹配，不含扩展名）
  const nameWithoutExt = upperName.split('.').slice(0, -1).join('.') || upperName;
  if (WINDOWS_RESERVED_NAMES.includes(nameWithoutExt)) {
    return {
      valid: false,
      error: `文件名不能使用保留名称：${nameWithoutExt}`,
    };
  }

  // 检查是否包含连续的多个点（如 "file..name"）
  if (trimmedName.includes('..')) {
    return {
      valid: false,
      error: '文件名不能包含连续的点',
    };
  }

  return {
    valid: true,
  };
}

/**
 * 清理文件名（移除非法字符）
 * @param fileName 原始文件名
 * @returns 清理后的文件名
 */
export function sanitizeFileName(fileName: string): string {
  let sanitized = fileName.trim();

  // 移除非法字符
  for (const char of INVALID_CHARS) {
    sanitized = sanitized.replace(new RegExp(`\\${char}`, 'g'), '');
  }

  // 移除开头的点和空格
  sanitized = sanitized.replace(/^[.\s]+/, '');

  // 移除结尾的点和空格
  sanitized = sanitized.replace(/[.\s]+$/, '');

  // 替换连续的点为单个点
  sanitized = sanitized.replace(/\.{2,}/g, '.');

  // 限制长度
  if (sanitized.length > MAX_FILENAME_LENGTH) {
    sanitized = sanitized.substring(0, MAX_FILENAME_LENGTH);
  }

  // 如果清理后为空，返回默认名称
  if (sanitized.length === 0) {
    sanitized = 'untitled';
  }

  return sanitized;
}

