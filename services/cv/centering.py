# services/cv/centering.py
import cv2
import numpy as np


def measure_centering(image_bytes: bytes) -> dict:
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        return {"error": "decode_failed", "confidence": "low"}

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 30, 120)

    # Dilate to close gaps in card border
    kernel = np.ones((3, 3), np.uint8)
    edges = cv2.dilate(edges, kernel, iterations=1)

    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if not contours:
        return {"error": "no_contours", "confidence": "low"}

    # Find largest rectangular-ish contour (the card)
    largest = max(contours, key=cv2.contourArea)
    area = cv2.contourArea(largest)
    img_area = img.shape[0] * img.shape[1]

    # Card should occupy a reasonable fraction of the image
    if area < img_area * 0.10:
        return {"error": "card_too_small", "confidence": "low"}

    x, y, w, h = cv2.boundingRect(largest)
    img_h, img_w = img.shape[:2]

    left = x
    right = img_w - (x + w)
    top = y
    bottom = img_h - (y + h)

    lr_total = left + right
    tb_total = top + bottom

    if lr_total < 4 or tb_total < 4:
        return {"error": "no_border_detected", "confidence": "low"}

    left_pct = round(left / lr_total * 100)
    top_pct = round(top / tb_total * 100)

    # PSA 10 requires 55/45 or better on each axis
    lr_ok = max(left_pct, 100 - left_pct) <= 55
    tb_ok = max(top_pct, 100 - top_pct) <= 55
    psa10_eligible = lr_ok and tb_ok

    return {
        "left_right": left_pct,
        "top_bottom": top_pct,
        "psa10_eligible": psa10_eligible,
        "confidence": "high",
    }
