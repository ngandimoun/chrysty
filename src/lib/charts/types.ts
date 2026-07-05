export type ChartKind = 'bar' | 'line' | 'pie' | 'area';

export interface ChartSeries {
  key: string;
  label: string;
  color?: string;
}

export interface ChartSpec {
  id: string;
  title: string;
  description?: string;
  kind: ChartKind;
  xKey?: string;
  nameKey?: string;
  valueKey?: string;
  series: ChartSeries[];
  data: Array<Record<string, string | number>>;
}

export interface CodeExecutionImage {
  mimeType: string;
  data: string;
  caption?: string;
}

export const CHART_PALETTE = ['#22d3ee', '#a78bfa', '#34d399', '#fbbf24', '#fb7185'] as const;

export const MAX_CHARTS = 3;
export const MAX_CHART_ROWS = 24;
