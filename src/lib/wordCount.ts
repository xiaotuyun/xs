/**
 * Helper to calculate the "pure" word count of a given text.
 * It counts only Chinese characters, English letters, and numbers,
 * excluding all kinds of punctuation, symbols, spaces, and formatting characters.
 */
export function getPureWordCount(text: string | null | undefined): number {
  if (!text) return 0;
  
  // [\u4e00-\u9fa5] matches Chinese characters
  // [a-zA-Z0-9] matches English letters and Arabic numerals
  const matches = text.match(/[\u4e00-\u9fa5a-zA-Z0-9]/g);
  return matches ? matches.length : 0;
}
