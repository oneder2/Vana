/**
 * No Visitors - 同步任务队列管理
 * 管理失败的 Push 任务队列，支持持久化和重试
 * 根据 Sync Protocol.md 实现队列重试机制
 */

/**
 * Push 任务接口
 */
export interface PushTask {
  workspacePath: string;
  remoteName: string;
  branchName: string;
  patToken: string;
  timestamp: number;
}

const QUEUE_STORAGE_KEY = 'no_visitors_push_queue';
const MAX_QUEUE_SIZE = 50; // 最大队列长度，防止存储溢出

/**
 * 从 localStorage 读取任务队列
 */
function loadQueue(): PushTask[] {
  try {
    const stored = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!stored) return [];
    
    const tasks: PushTask[] = JSON.parse(stored);
    // 验证任务格式
    return tasks.filter(task => 
      task.workspacePath && 
      task.remoteName && 
      task.branchName && 
      task.patToken &&
      task.timestamp
    );
  } catch (error) {
    console.error('[syncQueue] 读取队列失败:', error);
    return [];
  }
}

/**
 * 保存任务队列到 localStorage
 */
function saveQueue(tasks: PushTask[]): void {
  try {
    // 限制队列大小，保留最新的任务
    const limitedTasks = tasks.slice(-MAX_QUEUE_SIZE);
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(limitedTasks));
  } catch (error) {
    console.error('[syncQueue] 保存队列失败:', error);
    // 如果存储失败，可能是存储空间不足，尝试清理旧任务
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      try {
        const limitedTasks = tasks.slice(-Math.floor(MAX_QUEUE_SIZE / 2));
        localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(limitedTasks));
        console.warn('[syncQueue] 存储空间不足，已清理部分旧任务');
      } catch (retryError) {
        console.error('[syncQueue] 重试保存队列失败:', retryError);
      }
    }
  }
}

/**
 * 添加失败的 Push 任务到队列
 * @param task Push 任务
 */
export function addFailedPushTask(task: PushTask): void {
  console.log('[syncQueue] 添加失败的 Push 任务到队列:', {
    workspacePath: task.workspacePath,
    remoteName: task.remoteName,
    branchName: task.branchName,
    timestamp: new Date(task.timestamp).toISOString(),
  });
  
  const queue = loadQueue();
  
  // 检查是否已存在相同的任务（避免重复）
  const existingIndex = queue.findIndex(
    t => t.workspacePath === task.workspacePath &&
         t.remoteName === task.remoteName &&
         t.branchName === task.branchName
  );
  
  if (existingIndex >= 0) {
    // 更新现有任务的时间戳
    queue[existingIndex] = task;
    console.log('[syncQueue] 更新现有任务');
  } else {
    // 添加新任务
    queue.push(task);
    console.log('[syncQueue] 添加新任务，队列长度:', queue.length);
  }
  
  // 按时间戳排序（最早的在前）
  queue.sort((a, b) => a.timestamp - b.timestamp);
  
  saveQueue(queue);
}

/**
 * 重试队列中的所有 Push 任务
 * @returns 重试结果统计
 */
export async function retryFailedPushTasks(): Promise<{
  total: number;
  success: number;
  failed: number;
}> {
  const queue = loadQueue();
  
  if (queue.length === 0) {
    console.log('[syncQueue] 队列为空，无需重试');
    return { total: 0, success: 0, failed: 0 };
  }
  
  console.log('[syncQueue] 开始重试队列中的任务，数量:', queue.length);
  
  const results = { total: queue.length, success: 0, failed: 0 };
  const remainingTasks: PushTask[] = [];
  
  // 动态导入 syncWithRemote 以避免循环依赖
  const { syncWithRemote } = await import('@/lib/api');
  
  // 按顺序重试每个任务
  for (const task of queue) {
    try {
      console.log('[syncQueue] 重试任务:', {
        workspacePath: task.workspacePath,
        remoteName: task.remoteName,
        branchName: task.branchName,
        timestamp: new Date(task.timestamp).toISOString(),
      });
      
      const result = await syncWithRemote(
        task.workspacePath,
        task.remoteName,
        task.branchName,
        task.patToken
      );
      
      if (result.success) {
        console.log('[syncQueue] 任务重试成功');
        results.success++;
      } else {
        console.warn('[syncQueue] 任务重试失败（syncWithRemote 返回 success=false）');
        results.failed++;
        remainingTasks.push(task);
      }
    } catch (error) {
      console.error('[syncQueue] 任务重试出错:', error);
      results.failed++;
      remainingTasks.push(task);
    }
  }
  
  // 保存剩余的任务（失败的任务）
  saveQueue(remainingTasks);
  
  console.log('[syncQueue] 重试完成:', results);
  return results;
}

/**
 * 清除队列中的所有任务
 */
export function clearQueue(): void {
  console.log('[syncQueue] 清除队列');
  localStorage.removeItem(QUEUE_STORAGE_KEY);
}

/**
 * 获取队列中的任务数量
 */
export function getQueueSize(): number {
  return loadQueue().length;
}

/**
 * 获取队列中的任务列表（用于调试）
 */
export function getQueueTasks(): PushTask[] {
  return loadQueue();
}


