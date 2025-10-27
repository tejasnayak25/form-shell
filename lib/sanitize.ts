export function extractUrlFromEmbed(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  // If it's a plain URL
  try {
    const u = new URL(trimmed);
    return u.toString();
  } catch (e) {
    // Not a plain URL, try to extract from src="..." or src='...'
  }

  // Regex to find src attribute
  const srcMatch = trimmed.match(/src\s*=\s*['\"]([^'\"]+)['\"]/i);
  if (srcMatch && srcMatch[1]) {
    try {
      const u = new URL(srcMatch[1]);
      return u.toString();
    } catch (e) {
      return null;
    }
  }

  // Try to find href
  const hrefMatch = trimmed.match(/href\s*=\s*['\"]([^'\"]+)['\"]/i);
  if (hrefMatch && hrefMatch[1]) {
    try {
      const u = new URL(hrefMatch[1]);
      return u.toString();
    } catch (e) {
      return null;
    }
  }

  // Try to find any http(s) URL in text
  const anyUrl = trimmed.match(/https?:\/\/[^\s'\"]+/i);
  if (anyUrl) {
    try {
      const u = new URL(anyUrl[0]);
      return u.toString();
    } catch (e) {
      return null;
    }
  }

  return null;
}
