import cv2
import numpy as np
import os
import csv
import json
import time

# ============================================================
# HIGH-RES TESSELLA SEGMENTATION — COLOR EDGES + WATERSHED
# ============================================================

INPUT_IMAGE = "mosaic-higher-res.jpg"
OUTPUT_DIR = "tesserae_watershed_output"

# Keep the real high-res source. Downscale only if enormous.
PROCESS_MAX_WIDTH = 3000   # 0 = never downscale

# Edge sensitivity:
# lower = more boundaries, higher = fewer boundaries
EDGE_PERCENTILE = 68

# Width of the boundary band around detected color edges
EDGE_DILATE = 1

# Approximate minimum radius (pixels on working image) of a stone interior.
# For a ~2000–3000 px wide image, 3–5 is a good range.
SEED_MIN_DISTANCE = 3.0

# Local-max neighbourhood. Increase if one stone gets many seeds.
SEED_KERNEL = 9  # odd number

# Candidate tessera size in WORKING pixels
MIN_AREA = 18
MAX_AREA = 1200

# Reject absurd aspect ratios
MAX_ASPECT_RATIO = 4.0

SHOW_NUMBERS = False

os.makedirs(OUTPUT_DIR, exist_ok=True)


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


# ============================================================
# 1. LOAD
# ============================================================

log(f"Loading {INPUT_IMAGE} ...")
original = cv2.imread(INPUT_IMAGE)

if original is None:
    raise FileNotFoundError(
        f"Не удалось открыть {INPUT_IMAGE}. "
        f"Положи изображение рядом со скриптом."
    )

orig_h, orig_w = original.shape[:2]
log(f"Original: {orig_w} x {orig_h}")

# ============================================================
# 2. WORKING COPY
# ============================================================

if PROCESS_MAX_WIDTH and orig_w > PROCESS_MAX_WIDTH:
    scale = PROCESS_MAX_WIDTH / orig_w
    work_w = int(orig_w * scale)
    work_h = int(orig_h * scale)

    img = cv2.resize(
        original,
        (work_w, work_h),
        interpolation=cv2.INTER_AREA
    )
else:
    scale = 1.0
    img = original.copy()

h, w = img.shape[:2]
to_original = 1.0 / scale

log(f"Working: {w} x {h}")

cv2.imwrite(
    os.path.join(OUTPUT_DIR, "01_working.jpg"),
    img,
    [cv2.IMWRITE_JPEG_QUALITY, 96]
)

# ============================================================
# 3. EDGE-PRESERVING DENOISE
# ============================================================

log("Denoising while preserving tessera boundaries ...")

# Bilateral filter is slower than Gaussian, but much better here:
# it smooths surface texture while keeping grout/color boundaries.
smooth = cv2.bilateralFilter(
    img,
    d=5,
    sigmaColor=35,
    sigmaSpace=5
)

# ============================================================
# 4. COLOR GRADIENT IN LAB
# ============================================================

log("Computing color-gradient boundary map ...")

lab = cv2.cvtColor(smooth, cv2.COLOR_BGR2LAB)
channels = cv2.split(lab)

gradients = []

for ch in channels:
    gx = cv2.Scharr(ch, cv2.CV_32F, 1, 0)
    gy = cv2.Scharr(ch, cv2.CV_32F, 0, 1)
    mag = cv2.magnitude(gx, gy)
    gradients.append(mag)

# Max gradient over L, a, b:
# catches boundaries even when two stones have similar brightness
# but different colour.
grad = np.maximum.reduce(gradients)

# Robust normalization
p99 = np.percentile(grad, 99.5)
grad = np.clip(grad / max(p99, 1e-6), 0, 1)
grad8 = (grad * 255).astype(np.uint8)

cv2.imwrite(
    os.path.join(OUTPUT_DIR, "02_color_gradient.png"),
    grad8
)

# ============================================================
# 5. BOUNDARY MASK
# ============================================================

threshold = np.percentile(
    grad8,
    EDGE_PERCENTILE
)

boundaries = np.uint8(
    grad8 >= threshold
) * 255

# Remove isolated single-pixel noise
boundaries = cv2.morphologyEx(
    boundaries,
    cv2.MORPH_OPEN,
    np.ones((2, 2), np.uint8),
    iterations=1
)

if EDGE_DILATE > 0:
    boundaries = cv2.dilate(
        boundaries,
        np.ones((3, 3), np.uint8),
        iterations=EDGE_DILATE
    )

cv2.imwrite(
    os.path.join(OUTPUT_DIR, "03_boundary_mask.png"),
    boundaries
)

# ============================================================
# 6. INTERIORS + DISTANCE TRANSFORM
# ============================================================

log("Building stone-interior map ...")

interior = cv2.bitwise_not(boundaries)

# Small open removes tiny noise islands
interior = cv2.morphologyEx(
    interior,
    cv2.MORPH_OPEN,
    np.ones((2, 2), np.uint8),
    iterations=1
)

cv2.imwrite(
    os.path.join(OUTPUT_DIR, "04_interior_mask.png"),
    interior
)

dist = cv2.distanceTransform(
    interior,
    cv2.DIST_L2,
    5
)

dist_vis = cv2.normalize(
    dist,
    None,
    0,
    255,
    cv2.NORM_MINMAX
).astype(np.uint8)

cv2.imwrite(
    os.path.join(OUTPUT_DIR, "05_distance.png"),
    dist_vis
)

# ============================================================
# 7. ONE SEED PER TESSELLA (LOCAL MAXIMA)
# ============================================================

log("Finding candidate tessera centres ...")

k = SEED_KERNEL
if k % 2 == 0:
    k += 1

dilated_dist = cv2.dilate(
    dist,
    np.ones((k, k), np.uint8)
)

local_max = (
    (dist >= dilated_dist - 1e-6) &
    (dist >= SEED_MIN_DISTANCE)
)

seed_mask = np.uint8(local_max) * 255

# Merge tiny clusters of adjacent max pixels into single markers
seed_mask = cv2.dilate(
    seed_mask,
    np.ones((3, 3), np.uint8),
    iterations=1
)

num_seeds, seed_labels = cv2.connectedComponents(seed_mask)

log(f"Initial seeds: {num_seeds - 1}")

cv2.imwrite(
    os.path.join(OUTPUT_DIR, "06_seed_centres.png"),
    seed_mask
)

# ============================================================
# 8. MARKER-CONTROLLED WATERSHED
# ============================================================

log("Running watershed ...")

markers = np.zeros((h, w), dtype=np.int32)

# Boundary network acts as known background label 1
markers[boundaries > 0] = 1

# Seeds become labels 2...
for label in range(1, num_seeds):
    markers[seed_labels == label] = label + 1

markers = cv2.watershed(smooth, markers)

# ============================================================
# 9. EXTRACT REGIONS
# ============================================================

log("Extracting tessera polygons ...")

preview = img.copy()
detected = []

unique_labels = np.unique(markers)

for label in unique_labels:

    if label <= 1:
        continue

    region = np.uint8(markers == label) * 255

    contours, _ = cv2.findContours(
        region,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE
    )

    if not contours:
        continue

    cnt = max(contours, key=cv2.contourArea)
    area = cv2.contourArea(cnt)

    if area < MIN_AREA or area > MAX_AREA:
        continue

    x, y, bw, bh = cv2.boundingRect(cnt)

    if bw < 3 or bh < 3:
        continue

    aspect = max(bw / max(bh, 1), bh / max(bw, 1))

    if aspect > MAX_ASPECT_RATIO:
        continue

    M = cv2.moments(cnt)

    if M["m00"] == 0:
        continue

    cx = M["m10"] / M["m00"]
    cy = M["m01"] / M["m00"]

    # Polygon simplification
    epsilon = max(
        0.7,
        0.018 * cv2.arcLength(cnt, True)
    )

    poly = cv2.approxPolyDP(
        cnt,
        epsilon,
        True
    )

    # Efficient local color mask
    local = img[y:y+bh, x:x+bw]

    local_mask = np.zeros(
        (bh, bw),
        dtype=np.uint8
    )

    shifted = cnt.copy()
    shifted[:, 0, 0] -= x
    shifted[:, 0, 1] -= y

    cv2.drawContours(
        local_mask,
        [shifted],
        -1,
        255,
        -1
    )

    mean_bgr = cv2.mean(
        local,
        mask=local_mask
    )[:3]

    mean_rgb = [
        int(mean_bgr[2]),
        int(mean_bgr[1]),
        int(mean_bgr[0])
    ]

    polygon_original = []

    for p in poly:
        px = round(float(p[0][0]) * to_original, 2)
        py = round(float(p[0][1]) * to_original, 2)
        polygon_original.append([px, py])

    stone_id = len(detected) + 1

    detected.append({
        "id": stone_id,
        "center_x": round(cx * to_original, 2),
        "center_y": round(cy * to_original, 2),
        "area": round(area * (to_original ** 2), 2),
        "color_rgb": mean_rgb,
        "polygon": polygon_original
    })

    cv2.drawContours(
        preview,
        [poly],
        -1,
        (0, 0, 255),
        1,
        cv2.LINE_AA
    )

    cv2.circle(
        preview,
        (int(cx), int(cy)),
        2,
        (0, 255, 0),
        -1
    )

    if SHOW_NUMBERS:
        cv2.putText(
            preview,
            str(stone_id),
            (int(cx) + 2, int(cy) - 2),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.28,
            (255, 255, 255),
            1,
            cv2.LINE_AA
        )

# ============================================================
# 10. SAVE
# ============================================================

preview_path = os.path.join(
    OUTPUT_DIR,
    "07_tesserae_preview.jpg"
)

cv2.imwrite(
    preview_path,
    preview,
    [cv2.IMWRITE_JPEG_QUALITY, 96]
)

csv_path = os.path.join(
    OUTPUT_DIR,
    "08_tesserae_centres.csv"
)

with open(
    csv_path,
    "w",
    newline="",
    encoding="utf-8"
) as f:

    writer = csv.writer(f)
    writer.writerow([
        "id",
        "x",
        "y",
        "area",
        "red",
        "green",
        "blue"
    ])

    for s in detected:
        writer.writerow([
            s["id"],
            s["center_x"],
            s["center_y"],
            s["area"],
            *s["color_rgb"]
        ])

json_path = os.path.join(
    OUTPUT_DIR,
    "09_tesserae.json"
)

with open(
    json_path,
    "w",
    encoding="utf-8"
) as f:

    json.dump(
        {
            "image_width": orig_w,
            "image_height": orig_h,
            "working_width": w,
            "working_height": h,
            "scale": scale,
            "count": len(detected),
            "settings": {
                "EDGE_PERCENTILE": EDGE_PERCENTILE,
                "EDGE_DILATE": EDGE_DILATE,
                "SEED_MIN_DISTANCE": SEED_MIN_DISTANCE,
                "SEED_KERNEL": SEED_KERNEL,
                "MIN_AREA": MIN_AREA,
                "MAX_AREA": MAX_AREA
            },
            "tesserae": detected
        },
        f,
        ensure_ascii=False,
        indent=2
    )

log("DONE")
print()
print("Candidate tesserae:", len(detected))
print()
print("Сначала посмотри:")
print(os.path.join(OUTPUT_DIR, "02_color_gradient.png"))
print(os.path.join(OUTPUT_DIR, "03_boundary_mask.png"))
print(os.path.join(OUTPUT_DIR, "06_seed_centres.png"))
print(preview_path)
print()
print("Data:")
print(csv_path)
print(json_path)
