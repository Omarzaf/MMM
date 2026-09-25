export function parseCsv(text) {
  const matrix = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (quoted && character === '"' && next === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (!quoted && character === ',') {
      row.push(cell);
      cell = '';
    } else if (!quoted && character === '\n') {
      row.push(cell.replace(/\r$/, ''));
      matrix.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }

  if (quoted) throw new Error('unterminated quoted field');
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.replace(/\r$/, ''));
    matrix.push(row);
  }

  const [headers, ...records] = matrix.filter((entry) => entry.some(Boolean));
  if (!headers) return [];
  return records.map((values, index) => {
    if (values.length !== headers.length) {
      throw new Error(`row ${index + 2} has ${values.length} fields; expected ${headers.length}`);
    }
    return Object.fromEntries(headers.map((header, column) => [header, values[column]]));
  });
}
