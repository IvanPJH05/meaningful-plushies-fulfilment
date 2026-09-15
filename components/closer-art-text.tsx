import styles from "./closer-art-text.module.css";

const ASSET_BASE = "https://meaningful-plushies-fulfilment.vercel.app/closer/glyphs";

const glyphName = (character: string) => ({ ":": "colon", "+": "plus", "-": "dash" }[character] || character);

export function CloserGlyphText({ text, className = "", label }: { text: string; className?: string; label?: string }) {
  return <span className={`${styles.glyphText} ${className}`} aria-label={label || text} role="img">
    {Array.from(text.toUpperCase()).map((character, index) => character === " " || !/^[A-Z0-9:+-]$/.test(character)
      ? <span className={styles.space} key={`${character}-${index}`} />
      : <img key={`${character}-${index}`} src={`${ASSET_BASE}/${glyphName(character)}.png`} alt="" />)}
  </span>;
}

export function CloserWordArt({ asset, label, className = "" }: { asset: string; label: string; className?: string }) {
  return <img className={`${styles.wordArt} ${className}`} src={`${ASSET_BASE}/${asset}.png`} alt={label} />;
}
