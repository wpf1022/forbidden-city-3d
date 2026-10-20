"""Convert raw CDP screenshots into the JPEG previews used by README."""
import os
from PIL import Image

SRC = "shots"
os.makedirs("docs/preview", exist_ok=True)
mapping = {
    "raw-a-day.png": ("01-taihe-hall-day.jpg", 88, (1600, 900)),
    "raw-a-night.png": ("02-taihe-hall-night.jpg", 86, (1600, 900)),
    "raw-b-axis.png": ("03-central-axis.jpg", 88, (1600, 900)),
    "raw-c-aerial.png": ("04-aerial.jpg", 86, (1600, 900)),
    "raw-d-west.png": ("05-west-close.jpg", 88, (1600, 900)),
    "raw-meridian.png": ("06-meridian-gate.jpg", 88, (1600, 900)),
    "_mobile3.png": ("07-mobile.jpg", 86, (390, 844)),
}
for src, (dst, q, size) in mapping.items():
    p = os.path.join(SRC, src)
    if not os.path.exists(p):
        print("missing", p)
        continue
    im = Image.open(p).convert("RGB").resize(size, Image.LANCZOS)
    out = os.path.join("docs/preview", dst)
    im.save(out, "JPEG", quality=q, optimize=True, progressive=True)
    print(f"{out}  {os.path.getsize(out)//1024} KB")
