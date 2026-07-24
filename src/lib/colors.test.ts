import { describe, expect, it } from 'vitest';
import { readableTextColor } from './colors';

describe('readableTextColor', () => {
  it('uses dark text on light labels', () => {
    expect(readableTextColor('ffffff')).toBe('#261732');
  });

  it('uses white text on dark labels', () => {
    expect(readableTextColor('000000')).toBe('#fff');
  });
});
