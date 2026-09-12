export type SourceTextLink = { text: string; url: string };
export type TextPart = { text: string; href?: string };

function webUrl(value: string): string | undefined {
  try {
    const url = new URL(value.startsWith('www.') ? 'https://' + value : value);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

/** Keep evidence text unchanged; only turn explicit web addresses into anchors. */
export function textLinks(
  text: string,
  sourceLinks: SourceTextLink[] = [],
): TextPart[] {
  const parts: TextPart[] = [];
  let cursor = 0;
  for (const match of text.matchAll(/(?:https?:\/\/|www\.)[^\s<>"'“”‘’]+/giu)) {
    const start = match.index;
    // Avoid treating a URL-shaped suffix of an email or custom scheme as a link.
    if (start > 0 && /[\p{L}\p{N}_@:/]/u.test(text[start - 1]!)) continue;
    let label = match[0].replace(/[.,;:!?]+$/u, '');
    for (const [open, close] of [
      ['(', ')'],
      ['[', ']'],
      ['{', '}'],
    ]) {
      while (
        label.endsWith(close!) &&
        label.split(close!).length > label.split(open!).length
      )
        label = label.slice(0, -1);
    }
    const visibleUrl = webUrl(label);
    if (!visibleUrl) continue;
    // Official documents sometimes display a portal URL but link to a specific result.
    const destinations = new Set(
      sourceLinks
        .filter((link) => webUrl(link.text.trim()) === visibleUrl)
        .map((link) => webUrl(link.url))
        .filter((url): url is string => !!url),
    );
    const href = destinations.size === 1 ? [...destinations][0]! : visibleUrl;
    if (start > cursor) parts.push({ text: text.slice(cursor, start) });
    parts.push({ text: label, href });
    cursor = start + label.length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts;
}
