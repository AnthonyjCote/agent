export function inferHeuristicEmailTags(subject: string, snippet: string): string[] {
  const source = `${subject} ${snippet}`.toLowerCase();
  const tags: string[] = [];
  if (source.includes('urgent') || source.includes('asap')) {
    tags.push('Urgent');
  }
  if (source.includes('invoice') || source.includes('billing')) {
    tags.push('Finance');
  }
  if (source.includes('recruit') || source.includes('hire') || source.includes('staff')) {
    tags.push('Hiring');
  }
  return tags.slice(0, 2);
}
