export interface ChartTheme {
  grid: string;
  axis: string;
  tooltipBackground: string;
  tooltipBorder: string;
  cursor: string;
  series: string[];
}

const fallbackChartTheme: ChartTheme = {
  grid: "rgba(100, 116, 139, 0.22)",
  axis: "#64748b",
  tooltipBackground: "#ffffff",
  tooltipBorder: "rgba(15, 23, 42, 0.12)",
  cursor: "rgba(22, 163, 74, 0.08)",
  series: ["#16a34a", "#2563eb", "#7c3aed", "#d97706", "#0891b2"],
};

function readCssVariable(styles: CSSStyleDeclaration, name: string): string {
  return styles.getPropertyValue(name).trim();
}

export function getChartTheme(): ChartTheme {
  if (typeof window === "undefined") {
    return fallbackChartTheme;
  }

  const styles = window.getComputedStyle(document.documentElement);

  return {
    grid: readCssVariable(styles, "--chart-grid") || fallbackChartTheme.grid,
    axis: readCssVariable(styles, "--chart-axis") || fallbackChartTheme.axis,
    tooltipBackground:
      readCssVariable(styles, "--chart-tooltip-bg") ||
      fallbackChartTheme.tooltipBackground,
    tooltipBorder:
      readCssVariable(styles, "--chart-tooltip-border") ||
      fallbackChartTheme.tooltipBorder,
    cursor: readCssVariable(styles, "--chart-cursor") || fallbackChartTheme.cursor,
    series: fallbackChartTheme.series.map(
      (_color, index) =>
        readCssVariable(styles, `--chart-series-${index + 1}`) ||
        fallbackChartTheme.series[index]
    ),
  };
}
