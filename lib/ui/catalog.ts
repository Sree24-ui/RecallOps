export function recallNumber(number: string) {
  return `${number.slice(0, 2)}-${number.slice(2)}`;
}
export function filterRecalls<
  T extends {
    number: string;
    title: string;
    description: string;
    products: string[];
  },
>(records: T[], query: string): T[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return records.filter((record) => {
    const text = [
      'CPSC',
      record.number,
      recallNumber(record.number),
      record.title,
      record.description,
      ...record.products,
    ]
      .join(' ')
      .toLowerCase();
    return terms.every((term) => text.includes(term));
  });
}
