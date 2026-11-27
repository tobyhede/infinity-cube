// PROTOTYPE, throwaway: loaded by main.tsx only in a dev build on a URL that
// asks for a variant, so no other build carries the fonts or the stylesheet.
import './opendyslexic.css';
import { readVariant, setPrototypeFont } from './prototype-font';

// The dev server serves the font files where they sit. Passing `import.meta.url`
// through a name keeps Vite from treating each file as a build asset, so a
// production build, which drops this module, emits no font either.
const here = import.meta.url;
const FACES = [
  {
    url: new URL('./fonts/OpenDyslexic3-Regular.ttf', here).href,
    weight: '400',
  },
  {
    url: new URL('./fonts/OpenDyslexic3-Bold.ttf', here).href,
    weight: '700',
  },
];

/** Register the bundled faces and install the variant. */
export function installPrototypeFont(): void {
  for (const face of FACES) {
    document.fonts.add(
      new FontFace('OpenDyslexic', `url(${face.url}) format('truetype')`, {
        weight: face.weight,
        display: 'swap',
      }),
    );
  }
  setPrototypeFont(readVariant());
}
