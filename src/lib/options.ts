export function resolveOptions<T extends object>(
  defaults: T,
  options: Partial<T>,
): Partial<T> {
  const resolved: Partial<T> = {};
  for (const key of Object.keys(options) as (keyof T)[]) {
    const value = options[key];
    resolved[key] = value === undefined ? defaults[key] : value;
  }
  return resolved;
}
