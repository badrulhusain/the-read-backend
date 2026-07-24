export function generateSlug(title: string): string {
  const slug = title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return slug || 'article';
}

export function makeUniqueSlug(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base;

  for (let i = 2; i <= 99; i++) {
    const candidate = `${base}-${i}`;
    if (!existing.has(candidate)) return candidate;
  }

  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}
