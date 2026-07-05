'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useEffect, useState } from 'react';

import { CHART_PALETTE, type ChartSpec } from '@/lib/charts/types';
import {
  formatCompact,
  formatCurrency,
  formatNumber,
  guessCurrencyCode,
  looksLikeCurrencyLabel,
} from '@/lib/format/numbers';

interface ExplanationChartProps {
  chart: ChartSpec;
  index: number;
}

function useChartThemeColors() {
  const [colors, setColors] = useState({
    grid: 'oklch(0.82 0 0)',
    tick: 'oklch(0.45 0 0)',
    legend: 'oklch(0.35 0 0)',
    axis: 'oklch(0.77 0.14 205 / 15%)',
  });

  useEffect(() => {
    const root = document.documentElement;
    const read = () => {
      const styles = getComputedStyle(root);
      setColors({
        grid: styles.getPropertyValue('--chart-grid').trim() || 'oklch(0.82 0 0)',
        tick: styles.getPropertyValue('--chart-tick').trim() || 'oklch(0.45 0 0)',
        legend: styles.getPropertyValue('--chart-legend').trim() || 'oklch(0.35 0 0)',
        axis: styles.getPropertyValue('--ring').trim() ? `${styles.getPropertyValue('--ring').trim()} / 15%` : 'oklch(0.77 0.14 205 / 15%)',
      });
    };

    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return colors;
}

function seriesColor(series: ChartSpec['series'][number], index: number): string {
  return series.color ?? CHART_PALETTE[index % CHART_PALETTE.length] ?? CHART_PALETTE[0];
}

function formatChartValue(value: number | string | undefined, seriesLabel?: string): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return String(value ?? '');
  }

  if (seriesLabel && looksLikeCurrencyLabel(seriesLabel)) {
    const currency = guessCurrencyCode(seriesLabel);
    if (currency) {
      return formatCurrency(value, currency);
    }
  }

  if (Math.abs(value) >= 10_000) {
    return formatCompact(value);
  }

  return formatNumber(value);
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-lg">
      {label ? <p className="mb-1 text-xs text-muted-foreground">{label}</p> : null}
      <ul className="space-y-0.5">
        {payload.map((entry) => (
          <li key={String(entry.name)} className="text-sm text-foreground">
            <span className="mr-2 inline-block size-2 rounded-full" style={{ backgroundColor: entry.color }} />
            {entry.name}: {formatChartValue(entry.value, String(entry.name ?? ''))}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CartesianChart({ chart }: { chart: ChartSpec }) {
  const themeColors = useChartThemeColors();
  const xKey = chart.xKey ?? 'name';
  const ChartComponent = chart.kind === 'area' ? AreaChart : chart.kind === 'line' ? LineChart : BarChart;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ChartComponent data={chart.data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid stroke={themeColors.grid} strokeDasharray="3 3" />
        <XAxis
          dataKey={xKey}
          tick={{ fill: themeColors.tick, fontSize: 12 }}
          axisLine={{ stroke: themeColors.axis }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: themeColors.tick, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={48}
          tickFormatter={(value: number) => formatCompact(value)}
        />
        <Tooltip content={<ChartTooltip />} />
        <Legend wrapperStyle={{ color: themeColors.legend, fontSize: 12 }} />
        {chart.series.map((series, index) => {
          const color = seriesColor(series, index);
          if (chart.kind === 'area') {
            return (
              <Area
                key={series.key}
                type="monotone"
                dataKey={series.key}
                name={series.label}
                stroke={color}
                fill={color}
                fillOpacity={0.2}
                strokeWidth={2}
              />
            );
          }
          if (chart.kind === 'line') {
            return (
              <Line
                key={series.key}
                type="monotone"
                dataKey={series.key}
                name={series.label}
                stroke={color}
                strokeWidth={2}
                dot={{ fill: color, r: 3 }}
                activeDot={{ r: 5 }}
              />
            );
          }
          return (
            <Bar
              key={series.key}
              dataKey={series.key}
              name={series.label}
              fill={color}
              radius={[4, 4, 0, 0]}
            />
          );
        })}
      </ChartComponent>
    </ResponsiveContainer>
  );
}

function PieChartView({ chart }: { chart: ChartSpec }) {
  const themeColors = useChartThemeColors();

  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={chart.data}
          dataKey={chart.valueKey ?? 'value'}
          nameKey={chart.nameKey ?? 'name'}
          cx="50%"
          cy="50%"
          innerRadius={48}
          outerRadius={88}
          paddingAngle={2}
        >
          {chart.data.map((_, index) => (
            <Cell
              key={`cell-${index}`}
              fill={CHART_PALETTE[index % CHART_PALETTE.length] ?? CHART_PALETTE[0]}
            />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip />} />
        <Legend wrapperStyle={{ color: themeColors.legend, fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function ExplanationChart({ chart, index }: ExplanationChartProps) {
  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-medium text-violet-800 dark:bg-violet-500/10 dark:text-violet-200">
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-medium leading-snug text-foreground">{chart.title}</h3>
          {chart.description ? (
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{chart.description}</p>
          ) : null}
        </div>
      </div>
      <div className="min-h-[240px] w-full">
        {chart.kind === 'pie' ? <PieChartView chart={chart} /> : <CartesianChart chart={chart} />}
      </div>
    </article>
  );
}
