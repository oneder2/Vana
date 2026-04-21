type WindowCleanup = () => void;

export interface TauriWindowHandle {
  close(): Promise<void>;
  innerPosition(): Promise<{ x: number; y: number }>;
  innerSize(): Promise<{ width: number; height: number }>;
  isMaximized(): Promise<boolean>;
  maximize(): Promise<void>;
  minimize(): Promise<void>;
  onMoved(handler: () => void | Promise<void>): Promise<WindowCleanup>;
  onResized(handler: () => void | Promise<void>): Promise<WindowCleanup>;
  setPosition(position: unknown): Promise<void>;
  setSize(size: unknown): Promise<void>;
  unmaximize(): Promise<void>;
}

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function getCurrentTauriWindow(): Promise<TauriWindowHandle | null> {
  if (!isTauriRuntime()) {
    return null;
  }

  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  return getCurrentWindow();
}

export async function createLogicalSize(width: number, height: number): Promise<unknown> {
  const { LogicalSize } = await import('@tauri-apps/api/window');
  return new LogicalSize(width, height);
}

export async function createLogicalPosition(x: number, y: number): Promise<unknown> {
  const { LogicalPosition } = await import('@tauri-apps/api/window');
  return new LogicalPosition(x, y);
}
