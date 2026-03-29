/**
 * Checks whether the app is running in a local environment.
 *
 * Returns true only if process.env.IS_LOCAL exists
 * and its value (case-insensitive) equals "true".
 */
export function isLocal(): boolean {
  const val = process.env.IS_LOCAL;
  return typeof val === "string" && val.trim().toLowerCase() === "true";
}
