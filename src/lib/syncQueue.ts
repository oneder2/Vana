/** Retired Git queue: never persist credentials in browser storage. */
export interface PushTask {
  workspacePath: string; remoteName: string; branchName: string; patToken: string; timestamp: number;
}
export function clearQueue() { if (typeof localStorage !== 'undefined') localStorage.removeItem('no_visitors_push_queue'); }
export function addFailedPushTask(_task: PushTask): never { clearQueue(); throw new Error('Git 同步已停用。'); }
export async function retryFailedPushTasks() { clearQueue(); return { total: 0, success: 0, failed: 0 }; }
export function getQueueSize() { clearQueue(); return 0; }
export function getQueueTasks(): PushTask[] { clearQueue(); return []; }
