export function parseTagNames(rawTags: string[] | string | null | undefined) {
  if (!rawTags) {
    return [];
  }

  const tags = Array.isArray(rawTags) ? rawTags : rawTags.split(',');

  return Array.from(
    new Set(
      tags
        .map((tag) => String(tag).trim())
        .filter((tag) => tag.length > 0),
    ),
  );
}
