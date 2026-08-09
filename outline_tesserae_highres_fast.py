import cv2
import numpy as np
import os
import csv
import json
import time

# ============================================================
# SETTINGS FOR HIGH-RES MOSAIC
# ============================================================

INPUT_IMAGE = "mosaic-higher-res.jpg"
OUTPUT_DIR = "outlined_tesserae_output"

# IMPORTANT:
# For a real high-resolution source DO NOT upscale before segmentation.
UPSCALE_FOR_PREVIEW = 1

# If your source is extremely large, process a reduced working copy.
# 0 = keep original size.
# Good safe values: 3000–4500 px.
PROCESS_MAX_WIDTH = 4200

# Filtering is applied in WORKING-image pixels.
MIN_AREA = 20
MAX_AREA = 2500

MIN_W = 3
MIN_H = 3
MAX_W = 100
MAX_H = 100

SHOW_NUMBERS = False

# Threshold parameters.
# On a large image 15px is usually too local, so use a larger block.
ADAPTIVE_BLOCK_SIZE = 31   # must be odd
ADAPTIVE_C = 5

os.makedirs(OUTPUT_DIR, exist_ok=True)


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


# ============================================================
# 1. LOAD
# ============================================================

log(f"Loading {INPUT_IMAGE} ...")

img_original = cv2.imread(INPUT_IMAGE)

if img_original is None:
    raise FileNotFoundError(
        f"Не удалось открыть {INPUT_IMAGE}. "
        f"Проверь имя и положи файл рядом со скриптом."
    )

orig_h, orig_w = img_original.shape[:2]

log(f"Original size: {orig_w} x {orig_h}")


# ============================================================
# 2. MAKE A WORKING IMAGE
# ============================================================

if PROCESS_MAX_WIDTH and orig_w > PROCESS_MAX_WIDTH:
    scale = PROCESS_MAX_WIDTH / orig_w

    work_w = int(orig_w * scale)
    work_h = int(orig_h * scale)

    log(f"Creating working copy: {work_w} x {work_h}")

    img = cv2.resize(
        img_original,
        (work_w, work_h),
        interpolation=cv2.INTER_AREA
    )
else:
    scale = 1.0
    img = img_original.copy()

work_h, work_w = img.shape[:2]

# Conversion factor from working image -> original image
to_original = 1.0 / scale


# ============================================================
# 3. CONTRAST / LAB
# ============================================================

log("Enhancing local contrast ...")

lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
L, A, B = cv2.split(lab)

clahe = cv2.createCLAHE(
    clipLimit=2.0,
    tileGridSize=(12, 12)
)

L_eq = clahe.apply(L)

enhanced = cv2.cvtColor(
    cv2.merge([L_eq, A, B]),
    cv2.COLOR_LAB2BGR
)

gray = cv2.cvtColor(enhanced, cv2.COLOR_BGR2GRAY)

cv2.imwrite(
    os.path.join(OUTPUT_DIR, "01_working_image.jpg"),
    img
)

cv2.imwrite(
    os.path.join(OUTPUT_DIR, "02_enhanced_gray.png"),
    gray
)


# ============================================================
# 4. DARK GROUT MASK
# ============================================================

log("Detecting dark grout ...")

# Light blur only.
gray_blur = cv2.GaussianBlur(gray, (3, 3), 0)

grout = cv2.adaptiveThreshold(
    gray_blur,
    255,
    cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
    cv2.THRESH_BINARY_INV,
    ADAPTIVE_BLOCK_SIZE,
    ADAPTIVE_C
)

kernel2 = np.ones((2, 2), np.uint8)

# Avoid strong CLOSE because it can merge neighbouring stones.
grout = cv2.morphologyEx(
    grout,
    cv2.MORPH_OPEN,
    kernel2,
    iterations=1
)

cv2.imwrite(
    os.path.join(OUTPUT_DIR, "03_grout_mask.png"),
    grout
)


# ============================================================
# 5. STONE MASK
# ============================================================

log("Creating candidate stone mask ...")

stones_mask = cv2.bitwise_not(grout)

# A tiny erosion can strengthen separation between adjacent tesserae.
stones_mask = cv2.erode(
    stones_mask,
    np.ones((2, 2), np.uint8),
    iterations=1
)

cv2.imwrite(
    os.path.join(OUTPUT_DIR, "04_stones_mask.png"),
    stones_mask
)


# ============================================================
# 6. CONTOURS
# ============================================================

log("Finding contours ...")

# RETR_EXTERNAL is much lighter than RETR_LIST.
contours, _ = cv2.findContours(
    stones_mask,
    cv2.RETR_EXTERNAL,
    cv2.CHAIN_APPROX_SIMPLE
)

log(f"Raw contours: {len(contours)}")

preview = img.copy()
detected = []

for index, cnt in enumerate(contours):

    area = cv2.contourArea(cnt)

    if area < MIN_AREA or area > MAX_AREA:
        continue

    x, y, bw, bh = cv2.boundingRect(cnt)

    if bw < MIN_W or bh < MIN_H:
        continue

    if bw > MAX_W or bh > MAX_H:
        continue

    M = cv2.moments(cnt)

    if M["m00"] == 0:
        continue

    cx = M["m10"] / M["m00"]
    cy = M["m01"] / M["m00"]

    epsilon = max(
        0.8,
        0.018 * cv2.arcLength(cnt, True)
    )

    poly = cv2.approxPolyDP(
        cnt,
        epsilon,
        True
    )

    # --------------------------------------------------------
    # IMPORTANT PERFORMANCE FIX:
    # Never allocate a full-size mask for every contour.
    # Make a tiny LOCAL mask only inside its bounding box.
    # --------------------------------------------------------

    crop = img[y:y+bh, x:x+bw]

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
        crop,
        mask=local_mask
    )[:3]

    mean_rgb = [
        int(mean_bgr[2]),
        int(mean_bgr[1]),
        int(mean_bgr[0])
    ]

    # Coordinates mapped back to original high-resolution image.
    original_cx = round(cx * to_original, 2)
    original_cy = round(cy * to_original, 2)

    polygon_original = []

    for p in poly:
        px = round(float(p[0][0]) * to_original, 2)
        py = round(float(p[0][1]) * to_original, 2)

        polygon_original.append([px, py])

    stone_id = len(detected) + 1

    detected.append({
        "id": stone_id,
        "center_x": original_cx,
        "center_y": original_cy,
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
            0.3,
            (255, 255, 255),
            1,
            cv2.LINE_AA
        )

    if index % 5000 == 0 and index > 0:
        log(f"Processed {index}/{len(contours)} raw contours ...")


# ============================================================
# 7. SAVE PREVIEW
# ============================================================

log(f"Accepted candidate tesserae: {len(detected)}")

preview_path = os.path.join(
    OUTPUT_DIR,
    "05_outlined_stones.jpg"
)

cv2.imwrite(
    preview_path,
    preview,
    [cv2.IMWRITE_JPEG_QUALITY, 95]
)


# ============================================================
# 8. CSV
# ============================================================

csv_path = os.path.join(
    OUTPUT_DIR,
    "06_stone_centers.csv"
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
            s["color_rgb"][0],
            s["color_rgb"][1],
            s["color_rgb"][2]
        ])


# ============================================================
# 9. JSON
# ============================================================

json_path = os.path.join(
    OUTPUT_DIR,
    "07_tesserae.json"
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
            "working_width": work_w,
            "working_height": work_h,
            "working_scale": scale,
            "count": len(detected),
            "tesserae": detected
        },
        f,
        ensure_ascii=False,
        indent=2
    )


# ============================================================
# DONE
# ============================================================

log("DONE")

print()
print("Главный файл для проверки:")
print(preview_path)
print()
print("Coordinates:")
print(csv_path)
print(json_path)
