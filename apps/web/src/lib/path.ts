/** Lesen und Schreiben verschachtelter Werte über Pfade wie „variant.aspiration.boost“ oder „ratios.2“. */

export function getPath(obj: unknown, path: string): unknown {
  let node: unknown = obj;
  for (const part of path.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

export function setPath(obj: object, path: string, value: unknown): void {
  const parts = path.split('.');
  let node = obj as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) {
    const next = node[part];
    if (next === null || typeof next !== 'object') throw new Error(`Pfad ${path} existiert nicht`);
    node = next as Record<string, unknown>;
  }
  node[parts.at(-1)!] = value;
}
