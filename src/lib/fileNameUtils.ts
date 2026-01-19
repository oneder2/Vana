/**
 * No Visitors - 文件名工具函数
 * 处理文件名的显示和格式化，特别是处理 .enc 后缀
 */

/**
 * 从文件名中移除 .enc 后缀（仅用于显示）
 * @param fileName 原始文件名（可能包含 .enc）
 * @returns 不包含 .enc 的文件名（用于显示）
 */
export function removeEncSuffix(fileName: string): string {
  if (fileName.endsWith('.enc')) {
    return fileName.slice(0, -4); // 移除 '.enc' (4个字符)
  }
  return fileName;
}

/**
 * 为文件名添加 .enc 后缀（如果是文件且没有后缀）
 * @param fileName 文件名
 * @param isDirectory 是否为目录
 * @returns 添加了 .enc 的文件名（如果适用）
 */
export function ensureEncSuffix(fileName: string, isDirectory: boolean): string {
  // 目录不需要 .enc 后缀
  if (isDirectory) {
    return fileName;
  }
  
  // 如果已经有 .enc 后缀，直接返回
  if (fileName.endsWith('.enc')) {
    return fileName;
  }
  
  // 为文件添加 .enc 后缀
  return `${fileName}.enc`;
}

