#!/usr/bin/env python3
"""Regenerate the optimized files in page/ from the originals in page/_src/.

    python3 page/_src/build.py          # needs: pip install pillow fonttools brotli

page/_src/ is never published (GitHub Pages skips folders starting with "_"),
so originals stay full-size here while visitors only download the optimized
copies. The originals (page/_src/images/, page/_src/fonts/) are kept out of
git by .gitignore, so keep your own backup of them; commit build.py and the
generated files in page/assets/ and page/images/.

To add a publication figure or an experience logo, put the original in
_src/images/publications/ or _src/images/experiences/ and run this script.
It writes page/images/<folder>/<name>.jpg|png and prints the width/height to
use in the <img> tag of the entry.
"""
import io
from pathlib import Path

from fontTools import subset
from PIL import Image, ImageCms, ImageDraw, ImageFont

SRC = Path(__file__).resolve().parent  # page/_src
OUT = SRC.parent                       # page

# Avatar: (source, output, longest side in px, fraction of the width trimmed
# from EACH of the left and right sides). The page shows it 240 px wide.
AVATAR = ("avatar.jpg", "avatar.jpg", 800, 0.08)

# Entry images: every original in _src/images/<folder>/ becomes
# page/images/<folder>/<same name><format>, at most this many px wide.
ENTRY_IMAGES = {
    # folder:       (format, max width)
    "publications": (".jpg", 480),  # figures, shown 240 px wide (2x for high-DPI screens)
    "experiences":  (".png", 180),  # logos as 256-colour PNG, shown 150 px wide
}
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff"}
JPEG_QUALITY = 85

# Latin Modern Roman, the OpenType version of LaTeX's default Computer Modern,
# at the 8pt optical size (same design as the 10pt face, heavier strokes).
# v2.004 from CTAN; GUST Font License, http://tug.org/fonts/licenses/GUST-FONT-LICENSE.txt
FONTS = ["lmroman8-regular.otf", "lmroman8-italic.otf", "lmroman8-bold.otf"]

# Latin + Latin Extended (same ranges as Google Fonts' latin/latin-ext subsets).
# Other scripts (e.g. Chinese) fall back to the next font in the CSS stack.
FONT_UNICODES = (
    "U+0000-00FF,U+0100-02AF,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,"
    "U+1E00-1E9F,U+1EF2-1EFF,U+2000-206F,U+2074,U+20A0-20C0,U+2113,U+2122,U+2191,"
    "U+2193,U+2212,U+2215,U+2C60-2C7F,U+A720-A7FF,U+FEFF,U+FFFD"
)

# Favicon: a white "Z" in Latin Modern bold on the site's link brown
# (keep FAVICON_BG equal to --link in page/assets/css/style.css).
FAVICON_FONT = "lmroman8-bold.otf"
FAVICON_BG = "#8f3e24"
FAVICON_SIZES = [16, 32, 48, 64]


def to_srgb_on_white(im):
    """Convert to plain sRGB and flatten transparency onto white (the page background)."""
    icc = im.info.get("icc_profile")
    im = im.convert("RGBA")
    if icc:
        src = ImageCms.ImageCmsProfile(io.BytesIO(icc))
        im = ImageCms.profileToProfile(im, src, ImageCms.createProfile("sRGB"), outputMode="RGBA")
    white = Image.new("RGBA", im.size, (255, 255, 255, 255))
    return Image.alpha_composite(white, im).convert("RGB")


def build_image(src, dst, box, trim_x=0):
    """Scale src down to fit inside box (width, height) and save it as dst.

    The format follows dst's suffix: .jpg for photos and figures, .png
    (256-colour palette) for logos and flat graphics. Returns the output size.
    """
    im = to_srgb_on_white(Image.open(src))
    if trim_x:
        dx = round(im.width * trim_x)
        im = im.crop((dx, 0, im.width - dx, im.height))
    im.thumbnail(box, Image.LANCZOS)  # only ever shrinks
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.suffix == ".jpg":
        im.save(dst, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
    else:
        im.quantize(256, method=Image.MEDIANCUT, dither=Image.NONE).save(dst, "PNG", optimize=True)
    return im.size


def build_font(src, dst):
    opts = subset.Options()
    opts.flavor = "woff2"
    font = subset.load_font(str(src), opts)
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=subset.parse_unicodes(FONT_UNICODES))
    sub.subset(font)
    dst.parent.mkdir(parents=True, exist_ok=True)
    subset.save_font(font, str(dst), opts)


def render_favicon(px, font_path):
    """Draw one favicon size, supersampled 8x for smooth edges."""
    ss = px * 8
    im = Image.new("RGBA", (ss, ss), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    draw.rounded_rectangle((0, 0, ss - 1, ss - 1), radius=round(ss * 0.18), fill=FAVICON_BG)
    font = ImageFont.truetype(str(font_path), round(ss * 0.86))
    left, top, right, bottom = font.getbbox("Z")  # ink box, so the glyph is visually centred
    x = (ss - (right - left)) / 2 - left
    y = (ss - (bottom - top)) / 2 - top
    draw.text((x, y), "Z", font=font, fill="white")
    return im.resize((px, px), Image.LANCZOS)


def build_favicon(dst):
    font_path = SRC / "fonts" / FAVICON_FONT
    images = [render_favicon(px, font_path) for px in FAVICON_SIZES]
    images[-1].save(dst, format="ICO", sizes=[(px, px) for px in FAVICON_SIZES], append_images=images[:-1])


def report(src, dst, size=None):
    line = f"{dst.relative_to(OUT.parent)}: {src.stat().st_size // 1024} KB -> {dst.stat().st_size // 1024} KB"
    if size:
        line += f'  (width="{size[0]}" height="{size[1]}")'
    print(line)


if __name__ == "__main__":
    src_name, dst_name, longest_side, trim_x = AVATAR
    src, dst = SRC / "images" / src_name, OUT / "images" / dst_name
    report(src, dst, build_image(src, dst, (longest_side, longest_side), trim_x))

    for folder, (suffix, max_width) in ENTRY_IMAGES.items():
        for src in sorted((SRC / "images" / folder).iterdir()):
            if src.suffix.lower() in IMAGE_SUFFIXES:
                dst = OUT / "images" / folder / (src.stem + suffix)
                report(src, dst, build_image(src, dst, (max_width, 10**6)))

    favicon = OUT / "assets" / "favicon.ico"
    build_favicon(favicon)
    print(f"{favicon.relative_to(OUT.parent)}: {favicon.stat().st_size // 1024} KB ({', '.join(map(str, FAVICON_SIZES))} px)")

    for name in FONTS:
        src, dst = SRC / "fonts" / name, (OUT / "assets" / "fonts" / name).with_suffix(".woff2")
        build_font(src, dst)
        report(src, dst)
