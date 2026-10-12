/** Pointer capability describes the primary input, not whether a laptop has a touchscreen. */
export const TOUCH_WORKSPACE_QUERY = '(max-width: 1023px), (pointer: coarse)';
export type WorkspaceLayout = 'phone' | 'tablet' | 'desktop';
export function workspaceLayout(width: number, height: number, coarsePointer: boolean): WorkspaceLayout {
  if (width < 768 || (coarsePointer && width < 1024 && height < 500)) return 'phone';
  return width < 1024 || coarsePointer ? 'tablet' : 'desktop';
}

let layoutHeight = 0;
let layoutWidth = 0;
/** A software keyboard changes height without changing the device category. */
export function browserWorkspaceLayout(): WorkspaceLayout {
  const editing = document.activeElement?.matches('input, textarea, select, [contenteditable="true"], iframe');
  if (!editing || layoutWidth !== window.innerWidth || !layoutHeight) layoutHeight = window.innerHeight;
  layoutWidth = window.innerWidth;
  return workspaceLayout(layoutWidth, layoutHeight, window.matchMedia('(pointer: coarse)').matches);
}
