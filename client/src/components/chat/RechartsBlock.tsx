/**
 * RechartsBlock — Renders rich charts from AI-generated UIBlock data using Recharts.
 * Supports line, bar, area, pie, donut, radial, scatter, stacked_bar, composed.
 */
import React from "react";
import {
  LineChart, Line,
  BarChart, Bar,
  AreaChart, Area,
  PieChart, Pie, Cell,
  ScatterChart, Scatter,
  ComposedChart,
  RadialBarChart, RadialBar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface SeriesConfig {
  dataKey: string;
  label: string;
  color: string;
  type?: "line" | "bar" | "area";
  stackId?: string;
}

interface RechartsBlockData {
  type: "recharts";
  chartType: "line" | "bar" | "area" | "pie" | "donut" | "radial" | "scatter" | "stacked_bar" | "composed";
  title?: string;
  subtitle?: string;
  data: Record<string, unknown>[];
  xKey: string;
  series: SeriesConfig[];
  showGrid?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  innerRadius?: number;
  height?: number;
}

const DEFAULT_COLORS = [
  "hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))",
  "hsl(var(--chart-4))", "hsl(var(--chart-5))",
  "#8884d8", "#82ca9d", "#ffc658", "#ff7300", "#0088FE",
];

function getColor(series: SeriesConfig, index: number): string {
  return series.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length];
}

export function RechartsBlock({ block }: { block: RechartsBlockData }) {
  const chartHeight = block.height || 300;
  const showGrid = block.showGrid !== false;
  const showLegend = block.showLegend !== false;
  const showTooltip = block.showTooltip !== false;

  const renderChart = () => {
    switch (block.chartType) {
      case "line":
        return (
          <LineChart data={block.data}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />}
            <XAxis dataKey={block.xKey} className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
            <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
            {showTooltip && <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />}
            {showLegend && <Legend />}
            {block.series.map((s, i) => (
              <Line key={s.dataKey} type="monotone" dataKey={s.dataKey} name={s.label} stroke={getColor(s, i)} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        );

      case "bar":
      case "stacked_bar":
        return (
          <BarChart data={block.data}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />}
            <XAxis dataKey={block.xKey} className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
            <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
            {showTooltip && <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />}
            {showLegend && <Legend />}
            {block.series.map((s, i) => (
              <Bar key={s.dataKey} dataKey={s.dataKey} name={s.label} fill={getColor(s, i)} stackId={block.chartType === "stacked_bar" ? (s.stackId || "stack") : undefined} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        );

      case "area":
        return (
          <AreaChart data={block.data}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />}
            <XAxis dataKey={block.xKey} className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
            <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
            {showTooltip && <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />}
            {showLegend && <Legend />}
            {block.series.map((s, i) => (
              <Area key={s.dataKey} type="monotone" dataKey={s.dataKey} name={s.label} stroke={getColor(s, i)} fill={getColor(s, i)} fillOpacity={0.2} />
            ))}
          </AreaChart>
        );

      case "pie":
      case "donut": {
        const dataKey = block.series[0]?.dataKey || "value";
        const innerR = block.chartType === "donut" ? (block.innerRadius || 60) : 0;
        return (
          <PieChart>
            <Pie
              data={block.data}
              dataKey={dataKey}
              nameKey={block.xKey}
              cx="50%" cy="50%"
              innerRadius={innerR}
              outerRadius={100}
              paddingAngle={2}
              label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
            >
              {block.data.map((_entry, i) => (
                <Cell key={i} fill={block.series[i]?.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]} />
              ))}
            </Pie>
            {showTooltip && <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />}
            {showLegend && <Legend />}
          </PieChart>
        );
      }

      case "radial": {
        const dataKey = block.series[0]?.dataKey || "value";
        return (
          <RadialBarChart cx="50%" cy="50%" innerRadius="20%" outerRadius="90%" data={block.data} startAngle={180} endAngle={0}>
            <RadialBar dataKey={dataKey} label={{ position: "insideStart", fill: "#fff", fontSize: 12 }}>
              {block.data.map((_entry, i) => (
                <Cell key={i} fill={block.series[i]?.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]} />
              ))}
            </RadialBar>
            {showTooltip && <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />}
            {showLegend && <Legend />}
          </RadialBarChart>
        );
      }

      case "scatter":
        return (
          <ScatterChart>
            {showGrid && <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />}
            <XAxis dataKey={block.xKey} type="number" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
            <YAxis dataKey={block.series[0]?.dataKey} type="number" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
            {showTooltip && <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />}
            {showLegend && <Legend />}
            {block.series.map((s, i) => (
              <Scatter key={s.dataKey} name={s.label} data={block.data} fill={getColor(s, i)} />
            ))}
          </ScatterChart>
        );

      case "composed":
        return (
          <ComposedChart data={block.data}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />}
            <XAxis dataKey={block.xKey} className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
            <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
            {showTooltip && <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />}
            {showLegend && <Legend />}
            {block.series.map((s, i) => {
              const color = getColor(s, i);
              const seriesType = s.type || "bar";
              if (seriesType === "line") return <Line key={s.dataKey} type="monotone" dataKey={s.dataKey} name={s.label} stroke={color} strokeWidth={2} dot={false} />;
              if (seriesType === "area") return <Area key={s.dataKey} type="monotone" dataKey={s.dataKey} name={s.label} stroke={color} fill={color} fillOpacity={0.2} />;
              return <Bar key={s.dataKey} dataKey={s.dataKey} name={s.label} fill={color} radius={[4, 4, 0, 0]} />;
            })}
          </ComposedChart>
        );

      default:
        return null;
    }
  };

  return (
    <Card>
      {(block.title || block.subtitle) && (
        <CardHeader className="pb-2">
          {block.title && <CardTitle className="text-base">{block.title}</CardTitle>}
          {block.subtitle && <CardDescription>{block.subtitle}</CardDescription>}
        </CardHeader>
      )}
      <CardContent className="pb-4">
        <ResponsiveContainer width="100%" height={chartHeight}>
          {renderChart() || <div className="flex items-center justify-center h-full text-muted-foreground">Unsupported chart type</div>}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
