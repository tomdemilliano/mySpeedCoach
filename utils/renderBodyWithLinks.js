// utils/renderBodyWithLinks.js
//
// Renders announcement body text with URLs automatically converted to
// clickable <a> tags. Supports http:// and https:// URLs.
//
// Usage (React):
//   import { renderBodyWithLinks } from '../utils/renderBodyWithLinks';
//   <div>{renderBodyWithLinks(ann.body)}</div>

const URL_REGEX = /(https?:\/\/[^\s<>"')\],]+)/g;

/**
 * Splits text on URLs and returns an array of strings and <a> elements.
 * Safe to render as React children.
 *
 * @param {string} text  - Raw announcement body
 * @param {object} opts
 * @param {string} opts.linkColor     - CSS color for links (default '#60a5fa')
 * @param {string} opts.fontSize      - CSS font-size (default 'inherit')
 * @returns {Array}  Array of strings and React elements
 */
export function renderBodyWithLinks(text, opts = {}) {
  if (!text) return [];
  const { linkColor = '#60a5fa', fontSize = 'inherit' } = opts;

  const lines = text.split('\n');

  return lines.flatMap((line, lineIdx) => {
    const parts = [];
    let lastIndex = 0;
    let match;

    URL_REGEX.lastIndex = 0; // reset stateful regex
    while ((match = URL_REGEX.exec(line)) !== null) {
      // Text before the URL
      if (match.index > lastIndex) {
        parts.push(line.slice(lastIndex, match.index));
      }

      const url = match[0];
      // Strip trailing punctuation that is likely not part of the URL
      const cleanUrl = url.replace(/[.,;:!?)'"\]]+$/, '');

      parts.push(
        <a
          key={`${lineIdx}-${match.index}`}
          href={cleanUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: linkColor,
            textDecoration: 'underline',
            textDecorationColor: linkColor + '88',
            wordBreak: 'break-all',
            fontSize,
          }}
          onClick={(e) => e.stopPropagation()} // prevent card collapse toggles
        >
          {cleanUrl}
        </a>
      );

      // If we stripped trailing chars, add them back as plain text
      const stripped = url.slice(cleanUrl.length);
      if (stripped) parts.push(stripped);

      lastIndex = match.index + url.length;
    }

    // Remainder of line after last URL
    if (lastIndex < line.length) {
      parts.push(line.slice(lastIndex));
    }

    // Add a line break between lines (except after the last line)
    if (lineIdx < lines.length - 1) {
      parts.push(<br key={`br-${lineIdx}`} />);
    }

    return parts;
  });
}
