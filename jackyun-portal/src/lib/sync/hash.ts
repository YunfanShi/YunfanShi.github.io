function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => normalize(item));
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(source).sort().filter((key) => source[key] !== undefined).map((key) => [key, normalize(source[key])]),
    );
  }
  return value;
}

/** Stable JSON input for hashes across devices regardless of object key order. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value)) ?? 'null';
}
