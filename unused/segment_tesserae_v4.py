import cv2
import numpy as np
import os
import csv
import json
import time
from scipy.spatial import cKDTree

# ============================================================
# V4 — MULTI-SCALE CENTERS + LOCAL REGION GROWING PERIMETERS
# ============================================================

INPUT_IMAGE = "mosaic-higher-res.jpg"
OUTPUT_DIR = "tesserae_v4_output"

# Working resolution
PROCESS_MAX_WIDTH = 3000  # 0 = original size

# ---------- CENTER DETECTION ----------
# We detect centers on several scales, then merge nearby detections.
CENTER_SCALES = [1.0, 0.75, 0.5]

# Color-gradient edge threshold percentile.
# Lower => more boundaries, more centers, more false positives.
# Higher => fewer boundaries, more false negatives.
EDGE_PERCENTILES = [62, 66, 70]

# Minimum distance-transform radius for a candidate center.
SEED_MIN_DISTANCE = 2.5

# Local maxima kernel for center detection
SEED_KERNEL = 7  # odd

# Merge detections closer than this many working pixels
MERGE_RADIUS = 5.0

# ---------- LOCAL PERIMETER ----------
# Local crop radius around each center.
PATCH_RADIUS = 18

# Region growing color tolerance in LAB.
# Higher => region grows more, possibly merges neighbours.
LAB_COLOR_TOL = 22.0

# Local gradient stop threshold percentile inside each patch
LOCAL_EDGE_PERCENTILE = 72

# Max allowed region radius from seed within patch
MAX_REGION_RADIUS = 16

# Reject absurd regions
MIN_AREA = 10
MAX_AREA = 900
MAX_ASPECT_RATIO = 4.0

SHOW_NUMBERS = False

os.makedirs(OUTPUT_DIR, exist_ok=True)


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


# ============================================================
# LOAD
# ============================================================

log(f"Loading {INPUT_IMAGE} ...")
original = cv2.imread(INPUT_IMAGE)

if original is None:
    raise FileNotFoundError(
        f"Не удалось открыть {INPUT_IMAGE}. "
        f"Положи изображение рядом со скриптом."
    )

orig_h, orig_w = original.shape[:2]
log(f"Original size: {orig_w} x {orig_h}")

# ============================================================
# WORKING COPY
# ============================================================

if PROCESS_MAX_WIDTH and orig_w > PROCESS_MAX_WIDTH:
    base_scale = PROCESS_MAX_WIDTH / orig_w
    work_w = int(orig_w * base_scale)
    work_h = int(orig_h * base_scale)

    img = cv2.resize(
        original,
        (work_w, work_h),
        interpolation=cv2.INTER_AREA
    )
else:
    base_scale = 1.0
    img = original.copy()

h, w = img.shape[:2]
to_original = 1.0 / base_scale

log(f"Working size: {w} x {h}")

cv2.imwrite(
    os.path.join(OUTPUT_DIR, "01_working.jpg"),
    img,
    [cv2.IMWRITE_JPEG_QUALITY, 96]
)

# ============================================================
# PREP BASE LAB IMAGE
# ============================================================

log("Preparing LAB image ...")

smooth = cv2.bilateralFilter(
    img,
    d=5,
    sigmaColor=30,
    sigmaSpace=5
)

lab_base = cv2.cvtColor(smooth, cv2.COLOR_BGR2LAB)

# ============================================================
# MULTI-SCALE CENTER DETECTION
# ============================================================

def detect_centers_one_scale(image, edge_percentile):
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    channels = cv2.split(lab)

    gradients = []
    for ch in channels:
        gx = cv2.Scharr(ch, cv2.CV_32F, 1, 0)
        gy = cv2.Scharr(ch, cv2.CV_32F, 0, 1)
        gradients.append(cv2.magnitude(gx, gy))

    grad = np.maximum.reduce(gradients)

    p99 = np.percentile(grad, 99.5)
    grad = np.clip(grad / max(p99, 1e-6), 0, 1)
    grad8 = (grad * 255).astype(np.uint8)

    thr = np.percentile(grad8, edge_percentile)
    boundaries = np.uint8(grad8 >= thr) * 255

    boundaries = cv2.morphologyEx(
        boundaries,
        cv2.MORPH_OPEN,
        np.ones((2, 2), np.uint8),
        iterations=1
    )

    boundaries = cv2.dilate(
        boundaries,
        np.ones((3, 3), np.uint8),
        iterations=1
    )

    interior = cv2.bitwise_not(boundaries)

    dist = cv2.distanceTransform(
        interior,
        cv2.DIST_L2,
        5
    )

    k = SEED_KERNEL if SEED_KERNEL % 2 == 1 else SEED_KERNEL + 1
    dilated = cv2.dilate(
        dist,
        np.ones((k, k), np.uint8)
    )

    maxima = (
        (dist >= dilated - 1e-6) &
        (dist >= SEED_MIN_DISTANCE)
    )

    seed_mask = np.uint8(maxima) * 255

    # Slightly grow each maximum cluster so connectedComponents gives one center
    seed_mask = cv2.dilate(
        seed_mask,
        np.ones((3, 3), np.uint8),
        iterations=1
    )

    n, labels, stats, cents = cv2.connectedComponentsWithStats(seed_mask, 8)

    centers = []
    for i in range(1, n):
        x, y, bw, bh, area = stats[i]
        if area <= 0:
            continue
        centers.append((float(cents[i][0]), float(cents[i][1])))

    return centers, grad8, boundaries, seed_mask


all_centers = []

debug_grad = None
debug_boundaries = None
debug_seeds = None

for s_idx, scale_factor in enumerate(CENTER_SCALES):
    sw = max(1, int(w * scale_factor))
    sh = max(1, int(h * scale_factor))

    if scale_factor == 1.0:
        scaled = img
    else:
        scaled = cv2.resize(
            img,
            (sw, sh),
            interpolation=cv2.INTER_AREA
        )

    for edge_p in EDGE_PERCENTILES:
        log(f"Detecting centers: scale={scale_factor}, edge percentile={edge_p}")

        centers, grad8, boundaries, seed_mask = detect_centers_one_scale(
            scaled,
            edge_p
        )

        # map back to base working coordinates
        inv = 1.0 / scale_factor
        for cx, cy in centers:
            all_centers.append((cx * inv, cy * inv))

        if scale_factor == 1.0 and edge_p == EDGE_PERCENTILES[1]:
            debug_grad = grad8
            debug_boundaries = boundaries
            debug_seeds = seed_mask

log(f"Raw multi-scale center detections: {len(all_centers)}")

# ============================================================
# MERGE NEARBY CENTER DETECTIONS
# ============================================================

if not all_centers:
    raise RuntimeError("No centers detected. Lower EDGE_PERCENTILES or SEED_MIN_DISTANCE.")

pts = np.array(all_centers, dtype=np.float32)
tree = cKDTree(pts)

visited = np.zeros(len(pts), dtype=bool)
merged_centers = []

for i in range(len(pts)):
    if visited[i]:
        continue

    idxs = tree.query_ball_point(pts[i], MERGE_RADIUS)
    idxs = [j for j in idxs if not visited[j]]

    if not idxs:
        continue

    cluster = pts[idxs]
    center = cluster.mean(axis=0)

    for j in idxs:
        visited[j] = True

    merged_centers.append((float(center[0]), float(center[1])))

log(f"Merged candidate centers: {len(merged_centers)}")

# Save center preview
center_preview = img.copy()
for cx, cy in merged_centers:
    cv2.circle(
        center_preview,
        (int(round(cx)), int(round(cy))),
        2,
        (0, 255, 0),
        -1
    )

cv2.imwrite(
    os.path.join(OUTPUT_DIR, "02_centers_preview.jpg"),
    center_preview,
    [cv2.IMWRITE_JPEG_QUALITY, 96]
)

if debug_grad is not None:
    cv2.imwrite(os.path.join(OUTPUT_DIR, "03_debug_gradient.png"), debug_grad)
if debug_boundaries is not None:
    cv2.imwrite(os.path.join(OUTPUT_DIR, "04_debug_boundaries.png"), debug_boundaries)
if debug_seeds is not None:
    cv2.imwrite(os.path.join(OUTPUT_DIR, "05_debug_seed_mask.png"), debug_seeds)

# ============================================================
# LOCAL REGION GROWING AROUND EACH CENTER
# ============================================================

def local_color_gradient(patch_bgr):
    patch_lab = cv2.cvtColor(patch_bgr, cv2.COLOR_BGR2LAB)
    chans = cv2.split(patch_lab)

    mags = []
    for ch in chans:
        gx = cv2.Scharr(ch, cv2.CV_32F, 1, 0)
        gy = cv2.Scharr(ch, cv2.CV_32F, 0, 1)
        mags.append(cv2.magnitude(gx, gy))

    g = np.maximum.reduce(mags)
    p99 = np.percentile(g, 99.0)

    if p99 <= 1e-6:
        return np.zeros_like(g, dtype=np.uint8)

    g = np.clip(g / p99, 0, 1)
    return (g * 255).astype(np.uint8)


def region_grow_one(patch_bgr, seed_x, seed_y):
    ph, pw = patch_bgr.shape[:2]

    if not (0 <= seed_x < pw and 0 <= seed_y < ph):
        return None

    lab = cv2.cvtColor(patch_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    grad8 = local_color_gradient(patch_bgr)

    edge_thr = np.percentile(grad8, LOCAL_EDGE_PERCENTILE)

    seed_color = lab[seed_y, seed_x].copy()

    visited = np.zeros((ph, pw), dtype=np.uint8)
    region = np.zeros((ph, pw), dtype=np.uint8)

    q = [(seed_x, seed_y)]
    visited[seed_y, seed_x] = 1

    # 8-neighbourhood
    neigh = [
        (-1,-1),(0,-1),(1,-1),
        (-1, 0),       (1, 0),
        (-1, 1),(0, 1),(1, 1)
    ]

    while q:
        x, y = q.pop()

        # radial limit from seed
        if (x-seed_x)**2 + (y-seed_y)**2 > MAX_REGION_RADIUS**2:
            continue

        color_dist = np.linalg.norm(lab[y, x] - seed_color)

        # Stop if very different in LAB
        if color_dist > LAB_COLOR_TOL:
            continue

        # Stop on strong local edge, but allow the exact seed pixel
        if grad8[y, x] >= edge_thr and not (x == seed_x and y == seed_y):
            continue

        region[y, x] = 255

        for dx, dy in neigh:
            nx, ny = x + dx, y + dy

            if 0 <= nx < pw and 0 <= ny < ph and not visited[ny, nx]:
                visited[ny, nx] = 1
                q.append((nx, ny))

    # Clean tiny spikes
    region = cv2.morphologyEx(
        region,
        cv2.MORPH_CLOSE,
        np.ones((2,2), np.uint8),
        iterations=1
    )

    return region, grad8


log("Estimating local perimeters around each center ...")

preview = img.copy()
accepted = []
uncertain = []

for idx, (cx, cy) in enumerate(merged_centers):
    cxi = int(round(cx))
    cyi = int(round(cy))

    x0 = max(0, cxi - PATCH_RADIUS)
    y0 = max(0, cyi - PATCH_RADIUS)
    x1 = min(w, cxi + PATCH_RADIUS + 1)
    y1 = min(h, cyi + PATCH_RADIUS + 1)

    patch = img[y0:y1, x0:x1]

    seed_x = cxi - x0
    seed_y = cyi - y0

    result = region_grow_one(
        patch,
        seed_x,
        seed_y
    )

    if result is None:
        continue

    region, local_grad = result

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
        uncertain.append((cx,cy,"area"))
        continue

    bx, by, bw, bh = cv2.boundingRect(cnt)

    if bw < 2 or bh < 2:
        uncertain.append((cx,cy,"tiny"))
        continue

    aspect = max(
        bw / max(bh,1),
        bh / max(bw,1)
    )

    if aspect > MAX_ASPECT_RATIO:
        uncertain.append((cx,cy,"aspect"))
        continue

    # Shift contour back into full image coordinates
    cnt_full = cnt.copy()
    cnt_full[:, 0, 0] += x0
    cnt_full[:, 0, 1] += y0

    epsilon = max(
        0.6,
        0.025 * cv2.arcLength(cnt_full, True)
    )

    poly = cv2.approxPolyDP(
        cnt_full,
        epsilon,
        True
    )

    # Mean color from region
    local_mask = np.zeros(
        (patch.shape[0], patch.shape[1]),
        dtype=np.uint8
    )

    cv2.drawContours(
        local_mask,
        [cnt],
        -1,
        255,
        -1
    )

    mean_bgr = cv2.mean(
        patch,
        mask=local_mask
    )[:3]

    mean_rgb = [
        int(mean_bgr[2]),
        int(mean_bgr[1]),
        int(mean_bgr[0])
    ]

    stone_id = len(accepted) + 1

    polygon_original = []
    for p in poly:
        px = round(float(p[0][0]) * to_original, 2)
        py = round(float(p[0][1]) * to_original, 2)
        polygon_original.append([px, py])

    accepted.append({
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
        (cxi, cyi),
        2,
        (0, 255, 0),
        -1
    )

    if SHOW_NUMBERS:
        cv2.putText(
            preview,
            str(stone_id),
            (cxi + 2, cyi - 2),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.28,
            (255,255,255),
            1,
            cv2.LINE_AA
        )

    if idx % 1000 == 0 and idx > 0:
        log(f"Processed {idx}/{len(merged_centers)} centers ...")


# ============================================================
# UNCERTAIN CENTER PREVIEW
# ============================================================

uncertain_preview = img.copy()

for cx, cy, reason in uncertain:
    cv2.circle(
        uncertain_preview,
        (int(round(cx)), int(round(cy))),
        3,
        (0, 165, 255),  # orange
        1
    )

# ============================================================
# SAVE
# ============================================================

preview_path = os.path.join(
    OUTPUT_DIR,
    "06_tesserae_preview_v4.jpg"
)

cv2.imwrite(
    preview_path,
    preview,
    [cv2.IMWRITE_JPEG_QUALITY, 96]
)

cv2.imwrite(
    os.path.join(OUTPUT_DIR, "07_uncertain_centers.jpg"),
    uncertain_preview,
    [cv2.IMWRITE_JPEG_QUALITY, 96]
)

csv_path = os.path.join(
    OUTPUT_DIR,
    "08_tesserae_centers.csv"
)

with open(
    csv_path,
    "w",
    newline="",
    encoding="utf-8"
) as f:

    writer = csv.writer(f)

    writer.writerow([
        "id","x","y","area",
        "red","green","blue"
    ])

    for s in accepted:
        writer.writerow([
            s["id"],
            s["center_x"],
            s["center_y"],
            s["area"],
            *s["color_rgb"]
        ])

json_path = os.path.join(
    OUTPUT_DIR,
    "09_tesserae_v4.json"
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
            "working_scale": base_scale,
            "raw_multiscale_centers": len(all_centers),
            "merged_centers": len(merged_centers),
            "accepted_tesserae": len(accepted),
            "uncertain_centers": len(uncertain),
            "settings": {
                "CENTER_SCALES": CENTER_SCALES,
                "EDGE_PERCENTILES": EDGE_PERCENTILES,
                "SEED_MIN_DISTANCE": SEED_MIN_DISTANCE,
                "SEED_KERNEL": SEED_KERNEL,
                "MERGE_RADIUS": MERGE_RADIUS,
                "PATCH_RADIUS": PATCH_RADIUS,
                "LAB_COLOR_TOL": LAB_COLOR_TOL,
                "LOCAL_EDGE_PERCENTILE": LOCAL_EDGE_PERCENTILE,
                "MAX_REGION_RADIUS": MAX_REGION_RADIUS,
                "MIN_AREA": MIN_AREA,
                "MAX_AREA": MAX_AREA
            },
            "tesserae": accepted
        },
        f,
        ensure_ascii=False,
        indent=2
    )

log("DONE")
print()
print("Merged centers:", len(merged_centers))
print("Accepted tesserae:", len(accepted))
print("Uncertain:", len(uncertain))
print()
print("Сначала посмотри:")
print(os.path.join(OUTPUT_DIR, "02_centers_preview.jpg"))
print(preview_path)
print(os.path.join(OUTPUT_DIR, "07_uncertain_centers.jpg"))
print()
print("Data:")
print(csv_path)
print(json_path)
