import cv2
import numpy as np
import os
import csv
import json

# =========================
# SETTINGS
# =========================
INPUT_IMAGE = "mosaic-higher-res.jpg"
OUTPUT_DIR = "outlined_tesserae_output"

UPSCALE = 6          # во сколько раз увеличить
MIN_AREA = 40        # минимальная площадь камушка на увеличенной картинке
MAX_AREA = 5000      # максимальная площадь
SHOW_NUMBERS = False # если True, подпишет каждый камушек номером

os.makedirs(OUTPUT_DIR, exist_ok=True)

# =========================
# 1. LOAD IMAGE
# =========================
img = cv2.imread(INPUT_IMAGE)

if img is None:
    raise FileNotFoundError(
        f"Не удалось открыть {INPUT_IMAGE}. "
        "Положи mosaic.png рядом со скриптом."
    )

orig_h, orig_w = img.shape[:2]

# =========================
# 2. UPSCALE
# =========================
upscaled = cv2.resize(
    img,
    None,
    fx=UPSCALE,
    fy=UPSCALE,
    interpolation=cv2.INTER_NEAREST
)

cv2.imwrite(os.path.join(OUTPUT_DIR, "01_upscaled.png"), upscaled)

# =========================
# 3. PREPROCESS
# =========================
# Переводим в LAB, чтобы лучше работать с контрастом
lab = cv2.cvtColor(upscaled, cv2.COLOR_BGR2LAB)
L, A, B = cv2.split(lab)

clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
L_eq = clahe.apply(L)

lab_eq = cv2.merge([L_eq, A, B])
enhanced = cv2.cvtColor(lab_eq, cv2.COLOR_LAB2BGR)

gray = cv2.cvtColor(enhanced, cv2.COLOR_BGR2GRAY)

# Сохраняем для проверки
cv2.imwrite(os.path.join(OUTPUT_DIR, "02_enhanced_gray.png"), gray)

# =========================
# 4. DETECT GROUT (dark seams)
# =========================
# Ищем тёмные швы между камушками
grout = cv2.adaptiveThreshold(
    gray,
    255,
    cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
    cv2.THRESH_BINARY_INV,
    15,   # block size
    4     # constant
)

# Немного чистим
kernel_small = np.ones((2, 2), np.uint8)
kernel_med = np.ones((3, 3), np.uint8)

grout = cv2.morphologyEx(grout, cv2.MORPH_OPEN, kernel_small, iterations=1)
grout = cv2.morphologyEx(grout, cv2.MORPH_CLOSE, kernel_small, iterations=1)

cv2.imwrite(os.path.join(OUTPUT_DIR, "03_grout_mask.png"), grout)

# =========================
# 5. STONES MASK
# =========================
# Камни = всё, что не швы
stones_mask = cv2.bitwise_not(grout)

# Убираем мусор, но не слишком агрессивно
stones_mask = cv2.morphologyEx(stones_mask, cv2.MORPH_OPEN, kernel_small, iterations=1)
stones_mask = cv2.morphologyEx(stones_mask, cv2.MORPH_CLOSE, kernel_med, iterations=1)

cv2.imwrite(os.path.join(OUTPUT_DIR, "04_stones_mask.png"), stones_mask)

# =========================
# 6. FIND CONTOURS
# =========================
contours, _ = cv2.findContours(
    stones_mask,
    cv2.RETR_LIST,
    cv2.CHAIN_APPROX_SIMPLE
)

preview = upscaled.copy()
detected = []

stone_id = 1

for cnt in contours:
    area = cv2.contourArea(cnt)

    if area < MIN_AREA or area > MAX_AREA:
        continue

    x, y, w, h = cv2.boundingRect(cnt)

    # отсекаем слишком тонкие / странные формы
    if w < 5 or h < 5:
        continue
    if w > 120 or h > 120:
        continue

    # немного упрощаем контур
    epsilon = 0.02 * cv2.arcLength(cnt, True)
    poly = cv2.approxPolyDP(cnt, epsilon, True)

    M = cv2.moments(cnt)
    if M["m00"] == 0:
        continue

    cx = M["m10"] / M["m00"]
    cy = M["m01"] / M["m00"]

    # Цвет внутри камушка
    mask = np.zeros(upscaled.shape[:2], dtype=np.uint8)
    cv2.drawContours(mask, [cnt], -1, 255, -1)
    mean_bgr = cv2.mean(upscaled, mask=mask)[:3]
    mean_rgb = [int(mean_bgr[2]), int(mean_bgr[1]), int(mean_bgr[0])]

    # Перевод координат обратно к исходному размеру
    original_cx = round(cx / UPSCALE, 2)
    original_cy = round(cy / UPSCALE, 2)

    polygon_original = []
    for p in poly:
        px = round(p[0][0] / UPSCALE, 2)
        py = round(p[0][1] / UPSCALE, 2)
        polygon_original.append([px, py])

    detected.append({
        "id": stone_id,
        "center_x": original_cx,
        "center_y": original_cy,
        "area": round(area / (UPSCALE * UPSCALE), 2),
        "color_rgb": mean_rgb,
        "polygon": polygon_original
    })

    # Рисуем контур
    cv2.drawContours(preview, [poly], -1, (0, 0, 255), 1, cv2.LINE_AA)

    # Центр
    cv2.circle(preview, (int(cx), int(cy)), 2, (0, 255, 0), -1)

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

    stone_id += 1

# =========================
# 7. SAVE PREVIEW
# =========================
cv2.imwrite(os.path.join(OUTPUT_DIR, "05_outlined_stones.png"), preview)

# =========================
# 8. SAVE CSV
# =========================
csv_path = os.path.join(OUTPUT_DIR, "06_stone_centers.csv")
with open(csv_path, "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(["id", "x", "y", "area", "red", "green", "blue"])
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

# =========================
# 9. SAVE JSON
# =========================
json_path = os.path.join(OUTPUT_DIR, "07_tesserae.json")
with open(json_path, "w", encoding="utf-8") as f:
    json.dump({
        "image_width": orig_w,
        "image_height": orig_h,
        "count": len(detected),
        "tesserae": detected
    }, f, ensure_ascii=False, indent=2)

print("Готово.")
print("Найдено камушков:", len(detected))
print("Смотри файлы:")
print(os.path.join(OUTPUT_DIR, "01_upscaled.png"))
print(os.path.join(OUTPUT_DIR, "03_grout_mask.png"))
print(os.path.join(OUTPUT_DIR, "04_stones_mask.png"))
print(os.path.join(OUTPUT_DIR, "05_outlined_stones.png"))
print(csv_path)
print(json_path)