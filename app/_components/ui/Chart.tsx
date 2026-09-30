/**
 * Minimal inline-SVG stacked bar chart — no charting library dependency.
 * Renders whatever real data points it's given; it has no notion of "demo"
 * data and renders an empty-state message if given none.
 */
export interface ChartSeriesPoint {
  date: string;
  delivered: number;
  failed: number;
}

export function DeliveryBarChart({ data }: { data: ChartSeriesPoint[] }) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-foreground-muted">No message activity in this period yet.</p>;
  }

  const max = Math.max(1, ...data.map((d) => d.delivered + d.failed));
  const width = 640;
  const height = 160;
  const barGap = 4;
  const barWidth = data.length > 0 ? width / data.length - barGap : 0;

  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Messages delivered vs failed over time">
        {data.map((d, i) => {
          const total = d.delivered + d.failed;
          const deliveredHeight = (d.delivered / max) * (height - 20);
          const failedHeight = (d.failed / max) * (height - 20);
          const x = i * (barWidth + barGap);
          return (
            <g key={d.date}>
              {total === 0 ? (
                <rect x={x} y={height - 22} width={barWidth} height={2} className="fill-border" />
              ) : (
                <>
                  <rect x={x} y={height - 20 - deliveredHeight - failedHeight} width={barWidth} height={failedHeight} className="fill-danger" rx={1} />
                  <rect x={x} y={height - 20 - deliveredHeight} width={barWidth} height={deliveredHeight} className="fill-success" rx={1} />
                </>
              )}
              <title>
                {d.date}: {d.delivered} delivered, {d.failed} failed
              </title>
            </g>
          );
        })}
      </svg>
      <div className="flex items-center gap-4 text-xs text-foreground-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-success" /> Delivered
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-danger" /> Failed
        </span>
      </div>
    </div>
  );
}
