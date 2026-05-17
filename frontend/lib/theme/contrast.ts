export interface ContrastResult {
  ratio: number;
  passesAA: boolean;
  passesAAA: boolean;
}

function parseHexColor(hex: string): [number, number, number] | null {
  const normalized = hex.replace("#", "").trim();

  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return null;
  }

  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

function luminanceChannel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number | null {
  const rgb = parseHexColor(hex);
  if (!rgb) return null;

  const [red, green, blue] = rgb.map(luminanceChannel);
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

export function getContrastRatio(
  foreground: string,
  background: string
): ContrastResult | null {
  const foregroundLum = relativeLuminance(foreground);
  const backgroundLum = relativeLuminance(background);

  if (foregroundLum === null || backgroundLum === null) {
    return null;
  }

  const lighter = Math.max(foregroundLum, backgroundLum);
  const darker = Math.min(foregroundLum, backgroundLum);
  const ratio = (lighter + 0.05) / (darker + 0.05);

  return {
    ratio,
    passesAA: ratio >= 4.5,
    passesAAA: ratio >= 7,
  };
}
