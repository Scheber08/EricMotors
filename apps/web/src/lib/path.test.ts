import { describe, expect, it } from 'vitest';
import { getPath, setPath } from './path';

describe('Pfade', () => {
  it('liest und schreibt verschachtelt, auch Array-Indizes', () => {
    const o = { a: { b: [1, 2, 3] } };
    expect(getPath(o, 'a.b.1')).toBe(2);
    setPath(o, 'a.b.2', 9);
    expect(o.a.b[2]).toBe(9);
    expect(getPath(o, 'a.x.y')).toBeUndefined();
    expect(() => setPath(o, 'a.x.y', 1)).toThrow();
  });
});
