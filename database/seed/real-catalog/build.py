"""Builds images/ + rows.json for the 100-product dev catalog."""
import json, os, random, re, sys, glob
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(__file__))
from products import P, REPO_PHOTOS

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_IMG = os.path.join(HERE, 'images')
REPO_IMG_DIR = sys.argv[1]  # storefront/public/images/products
os.makedirs(OUT_IMG, exist_ok=True)

DROP = {'AASH-SELECT', 'FORT-MAIDA', 'TSAM-URAD', 'FORT-RICEBRAN', 'EVER-DHANIA', 'AASH-SALT',
        'AMUL-CHCUBE', 'BNAT-MIXED', 'CAD-5STAR', 'COLIN-GLASS'}
PRODUCTS = [p for p in P if p[4] not in DROP]
assert len(PRODUCTS) == 100, len(PRODUCTS)

BRAND_COLORS = {
    'Aashirvaad': '#C8102E', 'Fortune': '#F39C12', 'Tata Sampann': '#6D2C91', 'India Gate': '#8B1E3F',
    'Daawat': '#B22234', 'Gold Winner': '#E8A317', 'Saffola': '#1F7A3A', 'Idhayam': '#7B3F00', 'Amul': '#E30613',
    'Aavin': '#0057A8', 'Everest': '#D52B1E', 'MDH': '#B71C1C', 'Aachi': '#E65100', 'Sakthi': '#C62828',
    'Tata Salt': '#005BAA', 'Madhur': '#00838F', 'Nestle': '#5B6770', 'Britannia': '#D7141A', 'Parle': '#F2B705',
    'Sunfeast': '#3D1F6E', "McVitie's": '#C8102E', "Haldiram's": '#E2231A', "Lay's": '#FFC72C', 'Kurkure': '#F57C00',
    "Kellogg's": '#D71920', 'Quaker': '#B8860B', 'Dabur': '#1B5E20', 'Kissan': '#E53935', 'Pintola': '#8D6E63',
    'Tata Tea': '#9E1B32', 'Red Label': '#D32F2F', '3 Roses': '#AD1457', 'Bru': '#5D4037', 'Nescafe': '#3E2723',
    'Bournvita': '#4A148C', 'Horlicks': '#0D47A1', 'Boost': '#E64A19', 'Real': '#2E7D32', 'Maggi': '#FFC107',
    'Yippee': '#FB8C00', 'Bambino': '#C62828', 'MTR': '#B71C1C', 'Gits': '#6A1B9A', 'Knorr': '#2E7D32',
    "Ching's Secret": '#D50000', "Mother's Recipe": '#EF6C00', 'Priya': '#BF360C', 'KitKat': '#D50000',
    'Cadbury': '#4B1C7A', 'Dettol': '#00843D', 'Dove': '#1E3A8A', 'Lifebuoy': '#D32F2F', 'Medimix': '#2E7D32',
    'Parachute': '#00695C', 'Clinic Plus': '#E91E63', 'Head & Shoulders': '#0D47A1', 'Colgate': '#D50000',
    'Nivea': '#002F87', 'Himalaya': '#2E7D32', 'Vaseline': '#1565C0', 'Surf Excel': '#1565C0', 'Tide': '#F57F17',
    'Ariel': '#00897B', 'Vim': '#7CB342', 'Lizol': '#F9A825', 'Harpic': '#1E88E5', 'Good Knight': '#283593',
}

F_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
F_REG = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def wrap(draw, text, font, width):
    words, lines, cur = text.split(), [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if draw.textlength(t, font=font) <= width:
            cur = t
        else:
            lines.append(cur)
            cur = w
    lines.append(cur)
    return lines


def hex2rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def packshot(path, brand, name, size, category):
    W = 1000
    color = hex2rgb(BRAND_COLORS.get(brand, '#455A64'))
    light = tuple(int(c + (255 - c) * 0.88) for c in color)
    im = Image.new('RGB', (W, W), (250, 250, 251))
    d = ImageDraw.Draw(im)
    # soft backdrop + "pack"
    d.ellipse((150, 830, 850, 930), fill=(232, 233, 236))
    d.rounded_rectangle((210, 90, 790, 880), radius=46, fill=light, outline=color, width=6)
    d.rounded_rectangle((210, 90, 790, 300), radius=46, fill=color)
    d.rectangle((210, 250, 790, 300), fill=color)
    # brand
    fb = ImageFont.truetype(F_BOLD, 64)
    while d.textlength(brand, font=fb) > 520:
        fb = ImageFont.truetype(F_BOLD, fb.size - 4)
    tw = d.textlength(brand, font=fb)
    lum = 0.299 * color[0] + 0.587 * color[1] + 0.114 * color[2]
    ink = (20, 20, 20) if lum > 170 else (255, 255, 255)
    d.text(((W - tw) / 2, 160), brand, font=fb, fill=ink)
    # product name (without the brand prefix)
    title = name[len(brand):].strip() if name.lower().startswith(brand.lower()) else name
    title = re.sub(r'^(Nestle|Cadbury|Brooke Bond|Sunfeast)\s+', '', title)
    fn = ImageFont.truetype(F_BOLD, 46)
    lines = wrap(d, title, fn, 500)
    while len(lines) > 4:
        fn = ImageFont.truetype(F_BOLD, fn.size - 4)
        lines = wrap(d, title, fn, 500)
    y = 360
    for ln in lines:
        lw = d.textlength(ln, font=fn)
        d.text(((W - lw) / 2, y), ln, font=fn, fill=(30, 30, 35))
        y += fn.size + 14
    # pack size badge
    fs = ImageFont.truetype(F_BOLD, 50)
    sw = d.textlength(size, font=fs)
    bx0 = (W - sw) / 2 - 34
    d.rounded_rectangle((bx0, 690, bx0 + sw + 68, 780), radius=45, fill=color)
    d.text((bx0 + 34, 704), size, font=fs, fill=ink)
    # footer
    fc = ImageFont.truetype(F_REG, 26)
    cat = category.upper()
    cw = d.textlength(cat, font=fc)
    d.text(((W - cw) / 2, 820), cat, font=fc, fill=(110, 110, 120))
    ff = ImageFont.truetype(F_REG, 22)
    note = 'Sample image - replace with real product photo'
    nw = d.textlength(note, font=ff)
    d.text(((W - nw) / 2, 955), note, font=ff, fill=(160, 160, 168))
    im.save(path, 'JPEG', quality=88)


rnd = random.Random(42)
rows = []
for (cat, sub, brand, name, code, hsn, gst, ret, mfr, short, desc, variants) in PRODUCTS:
    img = slug(name) + '.jpg'
    if code in REPO_PHOTOS:
        Image.open(os.path.join(REPO_IMG_DIR, REPO_PHOTOS[code])).convert('RGB').save(os.path.join(OUT_IMG, img), 'JPEG', quality=92)
    else:
        packshot(os.path.join(OUT_IMG, img), brand, name, variants[0][0], sub)
    for i, (size, mrp, sp) in enumerate(variants):
        stock = rnd.choice([24, 36, 40, 48, 60, 72, 96, 120])
        rows.append({
            'Product Name': name,
            'Product Code': code,
            'Category': cat,
            'Subcategory': sub,
            'Brand': brand,
            'Description': desc,
            'Short Description': short,
            'Material': '',
            'Unit': 'Pack',
            'HSN Code': hsn,
            'Tax': str(gst),
            'Tax Type': 'INCLUSIVE',  # MRP / selling price already include GST
            'Manufacturer': mfr,
            'Manufacturing Date': '',
            'Expiry Date': '',
            'Return Eligible': 'Yes' if ret else 'No',
            'Return Window (Days)': '',
            'Product Image Path': img if i == 0 else '',
            'Variant SKU': f"{code}-{slug(size).upper()}",
            'Variant Barcode': '',
            'Variant Description': f'{name} - {size}',
            'Size': size,
            'Color': '',
            'MRP': str(mrp),
            'Selling Price': str(sp),
            'Variant Cost Price': str(round(sp * 0.82, 2)),
            'Opening Stock': str(stock),
            'Low Stock Threshold': '10',
            'Variant Image Path': '',
            'Status': 'ACTIVE',
        })

json.dump(rows, open(os.path.join(HERE, 'rows.json'), 'w'), ensure_ascii=False, indent=1)
print('products', len(PRODUCTS), 'rows', len(rows), 'images', len(glob.glob(OUT_IMG + '/*.jpg')))
