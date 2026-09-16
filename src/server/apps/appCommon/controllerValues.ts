export function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function readParamString(value: string | string[] | undefined) {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0].trim();
  return '';
}

export function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
