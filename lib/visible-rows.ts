// Rendering is bounded; the underlying items still include every matching order.
export function visibleRows(count: number, scrollTop: number, viewportHeight: number, rowHeight: number, overscan = 8) {
  const visible = Math.max(1, Math.ceil(viewportHeight / rowHeight));
  const first = Math.min(Math.max(0, count - visible), Math.max(0, Math.floor(scrollTop / rowHeight)));
  const start = Math.max(0, first - overscan);
  const end = Math.min(count, first + visible + overscan);
  return { start, end, before: start * rowHeight, after: (count - end) * rowHeight };
}
