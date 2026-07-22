/** 터미널에서 문자 하나가 차지하는 표시 폭. */
export function charWidth(codePoint: number): number {
  return (codePoint >= 0x1100 &&
    (codePoint <= 0x115f || codePoint === 0x2329 || codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) || (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe4f) || (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) || (codePoint >= 0x1f300 && codePoint <= 0x1faff)))
    ? 2 : 1;
}

export function displayWidth(value: string): number {
  let width = 0;
  for (const character of value) width += charWidth(character.codePointAt(0)!);
  return width;
}

export function truncateToWidth(value: string, maximumWidth: number): string {
  if (maximumWidth <= 1) return "";
  let width = 0;
  let output = "";
  for (const character of value) {
    const characterWidth = charWidth(character.codePointAt(0)!);
    if (width + characterWidth > maximumWidth - 1) return `${output}…`;
    width += characterWidth;
    output += character;
  }
  return output;
}
