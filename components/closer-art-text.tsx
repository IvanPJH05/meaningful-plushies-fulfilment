import styles from "./closer-art-text.module.css";

const ASSET_BASE = "https://meaningful-plushies-fulfilment.vercel.app/closer/glyphs";

const glyphName = (character: string) => ({ ":": "colon", "+": "plus", "-": "dash" }[character] || character);

const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter() : null;

export function closerCharacters(text: string): string[] {
  return segmenter ? Array.from(segmenter.segment(text), ({ segment }) => segment) : Array.from(text);
}

export function CloserGlyphText({ text, className = "", label }: { text: string; className?: string; label?: string }) {
  return <span className={`${styles.glyphText} ${className}`} aria-label={label || text} role="img">
    {closerCharacters(text).map((character, index) => {
      const key = `${character}-${index}`;
      if (/^\s+$/u.test(character)) return <span className={styles.space} key={key} />;
      if (/^[a-zA-Z0-9:+-]$/.test(character)) {
        return <img key={key} src={`${ASSET_BASE}/${glyphName(character.toUpperCase())}.png`} alt="" />;
      }
      return <span className={styles.fallback} aria-hidden="true" key={key}>{character}</span>;
    })}
  </span>;
}

export function CloserWordArt({ asset, label, className = "" }: { asset: string; label: string; className?: string }) {
  return <img className={`${styles.wordArt} ${className}`} src={`${ASSET_BASE}/${asset}.png`} alt={label} />;
}
