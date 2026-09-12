import { textLinks, type SourceTextLink } from '../lib/text-links';

export function LinkedText({
  text,
  links = [],
}: {
  text: string;
  links?: SourceTextLink[];
}) {
  return textLinks(text, links).map((part, index) =>
    part.href ? (
      <a
        key={index}
        href={part.href}
        className="inline-source-link"
        rel="external noopener noreferrer"
      >
        {part.text}
      </a>
    ) : (
      part.text
    ),
  );
}
