"""Builds App Store header banners (3840x1646 and 5244x2950) from AuraFit screenshots."""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent
SHOTS = ROOT / "iphone-6.9"
ICON = ROOT.parents[1] / "apps/mobile/assets/icon.png"
OUT = ROOT / "header"
PHONES = ["5-hunter-card.png", "4-workout-drops.png", "6-achievements.png"]


def font(size, bold=True):
    for path, index in (("/System/Library/Fonts/SFNS.ttf", 0), ("/System/Library/Fonts/HelveticaNeue.ttc", 1 if bold else 0)):
        try:
            f = ImageFont.truetype(path, size, index=index)
            if path.endswith("SFNS.ttf"):
                try:
                    f.set_variation_by_name("Bold" if bold else "Regular")
                except Exception:
                    pass
            return f
        except Exception:
            continue
    return ImageFont.load_default()


def background(w, h):
    img = Image.new("RGB", (w, h), (7, 10, 18))
    glow = Image.new("RGB", (w, h), (0, 0, 0))
    d = ImageDraw.Draw(glow)
    d.ellipse((int(w * 0.45), int(-h * 0.4), int(w * 1.2), int(h * 1.2)), fill=(88, 48, 200))
    d.ellipse((int(-w * 0.2), int(h * 0.55), int(w * 0.35), int(h * 1.6)), fill=(30, 60, 160))
    glow = glow.filter(ImageFilter.GaussianBlur(int(h * 0.22)))
    return Image.blend(img, glow, 0.55)


def rounded(im, radius):
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, im.size[0], im.size[1]), radius, fill=255)
    out = Image.new("RGBA", im.size)
    out.paste(im, (0, 0), mask)
    return out


def phone(path, height):
    shot = Image.open(path).convert("RGB")
    w = int(shot.width * height / shot.height)
    shot = shot.resize((w, height), Image.LANCZOS)
    bezel = int(height * 0.018)
    frame = Image.new("RGBA", (w + 2 * bezel, height + 2 * bezel), (0, 0, 0, 0))
    ImageDraw.Draw(frame).rounded_rectangle((0, 0, frame.width, frame.height), int(height * 0.075), fill=(28, 30, 40, 255))
    frame.alpha_composite(rounded(shot, int(height * 0.062)), (bezel, bezel))
    return frame


def shadow(im, blur):
    s = Image.new("RGBA", (im.width + blur * 4, im.height + blur * 4), (0, 0, 0, 0))
    alpha = im.split()[3].point(lambda a: int(a * 0.55))
    s.paste((0, 0, 0, 255), (blur * 2, blur * 2), alpha)
    return s.filter(ImageFilter.GaussianBlur(blur))


def build(w, h, name):
    canvas = background(w, h).convert("RGBA")
    # Phones on the right half, middle one raised.
    gap = int(w * 0.018)
    # Phones fill at most ~55% of the width, so text and phones never overlap on taller canvases.
    ph = int(min(h * 0.86, (w * 0.55 - 2 * gap) / (3 * 0.497)))
    phones = [phone(SHOTS / p, ph) for p in PHONES]
    base_y = (h - ph) // 2
    total = sum(p.width for p in phones) + gap * 2
    x = w - total - int(w * 0.05)
    for i, p in enumerate(phones):
        y = base_y - int(ph * 0.04) if i == 1 else base_y + int(ph * 0.04)
        sh = shadow(p, int(h * 0.02))
        canvas.alpha_composite(sh, (x - int(h * 0.04), y - int(h * 0.02)))
        canvas.alpha_composite(p, (x, y))
        x += p.width + gap
    # Brand block on the left.
    left = int(w * 0.06)
    u = ph / 0.86  # text unit = the 3840x1646 layout's height
    icon_size = int(u * 0.16)
    icon = rounded(Image.open(ICON).convert("RGB").resize((icon_size, icon_size), Image.LANCZOS), int(icon_size * 0.22))
    top = (h - int(u * 0.82)) // 2
    canvas.alpha_composite(icon, (left, top))
    d = ImageDraw.Draw(canvas)
    d.text((left, top + icon_size + int(u * 0.05)), "AuraFit", font=font(int(u * 0.13)), fill=(255, 255, 255))
    d.text((left, top + icon_size + int(u * 0.21)), "Level up your body.", font=font(int(u * 0.058)), fill=(167, 139, 250))
    d.text((left, top + icon_size + int(u * 0.285)), "Claim your aura.", font=font(int(u * 0.058)), fill=(167, 139, 250))
    d.text((left, top + icon_size + int(u * 0.385)), "Daily quests  ·  Workout drops  ·  Squads", font=font(int(u * 0.032), bold=False), fill=(203, 213, 225))
    out = OUT / name
    canvas.convert("RGB").save(out, "PNG")
    print(out, canvas.size)


build(3840, 1646, "header-3840x1646.png")
build(5244, 2950, "header-5244x2950.png")
