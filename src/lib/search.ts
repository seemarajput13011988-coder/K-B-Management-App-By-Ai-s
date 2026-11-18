export const normalizeSearchText = (value: unknown): string => String(value ?? '')
  .normalize('NFKD')
  .replace(/[\\u0300-\\u036f]/g, '')
  .toLocaleLowerCase()
  .trim()
  .replace(/\\s+/g, ' ');

const compactSearchText = (value: unknown): string => normalizeSearchText(value).replace(/[^a-z0-9]/g, '');

const searchValueVariants = (value: unknown): string[] => {
  if (value === null || value === undefined) return [];
  const raw = String(value);
  const variants = [raw];
  const isoDate = raw.match(/^(\\d{4})-(\\d{2})-(\\d{2})/);
  if (isoDate) {
    const date = new Date(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]), 12);
    if (Number.isFinite(date.getTime())) {
      variants.push(
        date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        date.toLocaleDateString('en-IN'),
        date.toLocaleDateString('en-US')
      );
    }
  }
  return variants;
};

export const matchesSearch = (query: string, ...values: unknown[]): boolean => {
  const terms = normalizeSearchText(query).split(' ').filter(Boolean);
  if (!terms.length) return true;
  const searchableValues = values.flatMap(searchValueVariants);
  const haystack = normalizeSearchText(searchableValues.join(' '));
  const compactHaystack = compactSearchText(searchableValues.join(' '));

  // A punctuation-only token has no compact form. Never let includes('') turn
  // it into a match for every record.
  return terms.every(term => {
    if (haystack.includes(term)) return true;
    const compactTerm = compactSearchText(term);
    return compactTerm.length > 0 && compactHaystack.includes(compactTerm);
  });
};
