export function readableTextColor(hex: string): '#261732' | '#fff' {
  const normalized = hex.replace('#', '').trim();
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return '#261732';
  const [r, g, b] = [0, 2, 4].map((index) => parseInt(normalized.slice(index, index + 2), 16) / 255);
  const luminance = [r, g, b]
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  return luminance > 0.5 ? '#261732' : '#fff';
}
