const ENTITY_VALUES = Object.freeze({
  amp: '&',
  apos: "'",
  bsol: '\\',
  colon: ':',
  gt: '>',
  lt: '<',
  newline: '\n',
  nbsp: '\u00a0',
  period: '.',
  quot: '"',
  sol: '/',
  tab: '\t',
});

export function decodeHtmlEntities(value) {
  return String(value).replace(/&(?:#(x[0-9a-f]+|[0-9]+)|([a-z][a-z0-9]+));?/giu, (entity, numeric, named) => {
    if (numeric) {
      const radix = numeric[0].toLocaleLowerCase('en') === 'x' ? 16 : 10;
      const digits = radix === 16 ? numeric.slice(1) : numeric;
      const codePoint = Number.parseInt(digits, radix);
      if (Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff) {
        try {
          return String.fromCodePoint(codePoint);
        } catch {
          return entity;
        }
      }
      return entity;
    }
    return ENTITY_VALUES[named.toLocaleLowerCase('en')] ?? entity;
  });
}

export function tokenizeHtml(value) {
  const html = String(value);
  const lower = html.toLocaleLowerCase('en');
  const tokens = [];
  let cursor = 0;

  while (cursor < html.length) {
    const start = html.indexOf('<', cursor);
    if (start < 0) break;
    if (html.startsWith('<!--', start)) {
      const end = html.indexOf('-->', start + 4);
      const tokenEnd = end < 0 ? html.length : end + 3;
      tokens.push({ type: 'comment', tag: '#comment', attrs: Object.freeze({}), start, end: tokenEnd });
      cursor = tokenEnd;
      continue;
    }
    if (html[start + 1] === '!' || html[start + 1] === '?') {
      const end = html.indexOf('>', start + 2);
      const tokenEnd = end < 0 ? html.length : end + 1;
      tokens.push({ type: 'declaration', tag: '#declaration', attrs: Object.freeze({}), start, end: tokenEnd });
      cursor = tokenEnd;
      continue;
    }

    let index = start + 1;
    const closing = html[index] === '/';
    if (closing) index += 1;
    while (isSpace(html[index])) index += 1;
    const nameStart = index;
    while (isTagNameCharacter(html[index])) index += 1;
    if (index === nameStart) {
      cursor = start + 1;
      continue;
    }
    const tag = lower.slice(nameStart, index);

    if (closing) {
      const end = html.indexOf('>', index);
      const tokenEnd = end < 0 ? html.length : end + 1;
      tokens.push({ type: 'end', tag, attrs: Object.freeze({}), start, end: tokenEnd });
      cursor = tokenEnd;
      continue;
    }

    const attrs = Object.create(null);
    let selfClosing = false;
    while (index < html.length) {
      while (isSpace(html[index])) index += 1;
      if (html[index] === '>') {
        index += 1;
        break;
      }
      if (html[index] === '/' && html[index + 1] === '>') {
        selfClosing = true;
        index += 2;
        break;
      }
      const attributeStart = index;
      while (index < html.length && !isSpace(html[index]) && !['=', '>', '<'].includes(html[index])) index += 1;
      if (index === attributeStart) {
        index += 1;
        continue;
      }
      const name = lower.slice(attributeStart, index);
      while (isSpace(html[index])) index += 1;
      let attributeValue = '';
      if (html[index] === '=') {
        index += 1;
        while (isSpace(html[index])) index += 1;
        const quote = html[index];
        if (quote === '"' || quote === "'") {
          index += 1;
          const valueStart = index;
          while (index < html.length && html[index] !== quote) index += 1;
          attributeValue = html.slice(valueStart, index);
          if (html[index] === quote) index += 1;
        } else {
          const valueStart = index;
          while (index < html.length && !isSpace(html[index]) && html[index] !== '>') index += 1;
          attributeValue = html.slice(valueStart, index);
        }
      }
      if (!Object.hasOwn(attrs, name)) attrs[name] = decodeHtmlEntities(attributeValue);
    }
    const token = { type: 'start', tag, attrs: Object.freeze(attrs), start, end: index, selfClosing };
    tokens.push(token);
    cursor = index;

    if (!selfClosing && (tag === 'script' || tag === 'style')) {
      const closingStart = findRawClosingTag(lower, tag, cursor);
      if (closingStart < 0) {
        cursor = html.length;
        continue;
      }
      const closingEnd = html.indexOf('>', closingStart + tag.length + 2);
      const tokenEnd = closingEnd < 0 ? html.length : closingEnd + 1;
      tokens.push({ type: 'end', tag, attrs: Object.freeze({}), start: closingStart, end: tokenEnd });
      cursor = tokenEnd;
    }
  }
  return tokens;
}

export function elementRanges(html, tokens, tag, predicate = () => true) {
  const wanted = String(tag).toLocaleLowerCase('en');
  const stack = [];
  const ranges = [];
  for (const token of tokens) {
    if (token.tag !== wanted) continue;
    if (token.type === 'start' && !token.selfClosing) {
      stack.push(token);
    } else if (token.type === 'end' && stack.length > 0) {
      const startToken = stack.pop();
      if (predicate(startToken)) {
        ranges.push({ startToken, endToken: token, html: String(html).slice(startToken.start, token.end) });
      }
    }
  }
  return ranges.sort((left, right) => left.startToken.start - right.startToken.start);
}

export function visibleHtmlText(html, providedTokens) {
  const source = String(html);
  const tokens = providedTokens ?? tokenizeHtml(source);
  const pieces = [];
  let cursor = 0;
  let suppressed = 0;
  for (const token of tokens) {
    if (token.start > cursor && suppressed === 0) pieces.push(source.slice(cursor, token.start));
    if (token.type === 'start' && ['script', 'style'].includes(token.tag)) suppressed += 1;
    if (token.type === 'end' && ['script', 'style'].includes(token.tag)) suppressed = Math.max(0, suppressed - 1);
    if (suppressed === 0) pieces.push(' ');
    cursor = Math.max(cursor, token.end);
  }
  if (cursor < source.length && suppressed === 0) pieces.push(source.slice(cursor));
  return decodeHtmlEntities(pieces.join(' ')).replace(/\s+/gu, ' ').trim();
}

function findRawClosingTag(lower, tag, start) {
  let cursor = start;
  while (cursor < lower.length) {
    const candidate = lower.indexOf(`</${tag}`, cursor);
    if (candidate < 0) return -1;
    const suffix = lower[candidate + tag.length + 2];
    if (suffix === '>' || isSpace(suffix)) return candidate;
    cursor = candidate + tag.length + 2;
  }
  return -1;
}

function isSpace(character) {
  return typeof character === 'string' && /[\t\n\f\r ]/u.test(character);
}

function isTagNameCharacter(character) {
  return typeof character === 'string' && /[a-z0-9:-]/iu.test(character);
}
