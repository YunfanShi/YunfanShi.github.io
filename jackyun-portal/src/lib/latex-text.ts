/** Accepts common escaped comparison symbols inside user-authored LaTeX. */
export function normalizeLatexRelations(value: string): string {
  return value.replace(/\\([<>])/gu, '$1');
}
