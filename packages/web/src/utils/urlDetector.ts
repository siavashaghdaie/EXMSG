const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;

export function extractUrls(text: string): string[] {
  const matches = text.match(URL_REGEX);
  if (!matches) return [];
  // Deduplicate
  return [...new Set(matches)];
}

export function linkifyText(text: string): (string | { type: 'link'; url: string })[] {
  const parts: (string | { type: 'link'; url: string })[] = [];
  let lastIndex = 0;

  const regex = new RegExp(URL_REGEX.source, 'gi');
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push({ type: 'link', url: match[0] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}
