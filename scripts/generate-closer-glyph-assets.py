"""Create tight, transparent web assets from the supplied Closer artwork."""

from pathlib import Path

from PIL import Image

Image.MAX_IMAGE_PIXELS = None

SOURCE = Path(r"D:\Chrome Downloads\plushies (1000 x 1000 px) (1)")
OUTPUT = Path(__file__).resolve().parents[1] / "public" / "closer" / "glyphs"
OUTPUT.mkdir(parents=True, exist_ok=True)


def alpha_box(image: Image.Image) -> tuple[int, int, int, int]:
    box = image.getchannel("A").getbbox()
    if box is None:
        raise ValueError("Artwork did not contain visible pixels")
    return box


def save_tight(image: Image.Image, destination: Path, max_height: int) -> None:
    left, top, right, bottom = alpha_box(image)
    pad = 22
    crop = image.crop((max(0, left - pad), max(0, top - pad), min(image.width, right + pad), min(image.height, bottom + pad)))
    if crop.height > max_height:
        width = round(crop.width * max_height / crop.height)
        crop = crop.resize((width, max_height), Image.Resampling.LANCZOS)
    crop.save(destination, "PNG", optimize=True)


def runs_for_row(alpha: Image.Image, y_start: int, y_end: int) -> list[tuple[int, int]]:
    pixels = alpha.load()
    runs: list[tuple[int, int]] = []
    in_run = False
    start = 0
    for x in range(alpha.width):
        visible = any(pixels[x, y] > 15 for y in range(y_start, y_end + 1, 4))
        if visible and not in_run:
            start = x
            in_run = True
        elif in_run and (not visible or x == alpha.width - 1):
            runs.append((start, x))
            in_run = False
    return runs


def glyph_filename(character: str) -> str:
    return {":": "colon", "+": "plus", "-": "dash"}.get(character, character)


def build_glyphs() -> None:
    image = Image.open(SOURCE / "19.png").convert("RGBA")
    alpha = image.getchannel("A")
    rows = [
        (712, 1986, "ABCDEFG"),
        (2838, 4331, "HIJKLMN"),
        (4817, 6267, "OPQRSTU"),
        (7006, 8158, "VWXYZ"),
        (8793, 10022, "1234567"),
        (10851, 12084, "890-+"),
    ]
    for y_start, y_end, characters in rows:
        character_runs = runs_for_row(alpha, y_start, y_end)
        if len(character_runs) != len(characters):
            raise ValueError(f"Expected {len(characters)} glyphs in {characters}, found {len(character_runs)}")
        for character, (left, right) in zip(characters, character_runs):
            save_tight(image.crop((left - 18, y_start - 18, right + 18, y_end + 18)), OUTPUT / f"{glyph_filename(character)}.png", 360)

    # Colon is included in the third supplied title artwork rather than the grid.
    title = Image.open(SOURCE / "13.png").convert("RGBA")
    alpha = title.getchannel("A")
    x_runs = runs_for_row(alpha, 0, alpha.height - 1)
    if len(x_runs) < 3:
        raise ValueError("Could not find the colon artwork")
    save_tight(title.crop((x_runs[2][0] - 24, 0, x_runs[2][1] + 24, title.height)), OUTPUT / "colon.png", 360)


def build_static_words() -> None:
    files = {
        "11.png": "english.png",
        "12.png": "malay.png",
        "14.png": "pair-snowy.png",
        "17.png": "your-nickname.png",
        "18.png": "partners-id.png",
        "20.png": "pair-now.png",
    }
    for source, destination in files.items():
        save_tight(Image.open(SOURCE / source).convert("RGBA"), OUTPUT / destination, 360)


if __name__ == "__main__":
    build_glyphs()
    build_static_words()
