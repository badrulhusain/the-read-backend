import sanitizeHtml from 'sanitize-html';

export function computeReadingStats(html: string): {
  wordCount: number;
  readingTime: number;
} {
  const plain = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} });
  const words = plain
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w.length > 0);

  const wordCount = words.length;
  const readingTime = Math.max(1, Math.ceil(wordCount / 200));

  return { wordCount, readingTime };
}
