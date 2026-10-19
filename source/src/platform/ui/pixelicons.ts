/**
 * Little pictures drawn here, pixel by pixel, for the menus (no picture files to license): each a grid of
 * letters, one a pixel, made into an SVG of squares that stays crisp at any size.
 */

/** Each picture's letters and the colour each stands for ('.' is clear). */
function pixelArt(rows: readonly string[], palette: Record<string, string>): string {
  const w = Math.max(...rows.map((r) => r.length));
  const rects: string[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = palette[row[x]];
      if (c) rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`);
    }
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${rows.length}" shape-rendering="crispEdges">${rects.join('')}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** A magnifying glass, Minecraft's search tab's kind: a glass lens in a grey rim, a glint on it, a wooden handle. */
export const MAGNIFIER = pixelArt(
  [
    '....KKKKK.......',
    '..KKRRRRRKK.....',
    '.KRRLLLGGRRK....',
    '.KRLWWGGGGRK....',
    'KRLWLGGGGGGRK...',
    'KRLWGGGGGGGRK...',
    'KRLGGGGGGGGrK...',
    'KRGGGGGGGGGrK...',
    'KRGGGGGGGGrrK...',
    '.KRGGGGGGGrK....',
    '.KrrGGGGGrrKh...',
    '..KKrrrrrKKhHh..',
    '....KKKKK.hHHHh.',
    '...........hHHHh',
    '............hHHh',
    '.............hh.',
  ],
  { K: '#1f1f24', R: '#a7a9ae', r: '#6f7277', G: '#7cc3ee', L: '#bfe6ff', W: '#ffffff', H: '#9a6a3c', h: '#5a3a1e' },
);
