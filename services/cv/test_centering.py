# services/cv/test_centering.py
import numpy as np
import cv2
import pytest
from centering import measure_centering


def make_card_image(
    img_w: int = 600,
    img_h: int = 800,
    left: int = 30,
    right: int = 30,
    top: int = 40,
    bottom: int = 40,
) -> bytes:
    """Create a synthetic card image with white card on gray background."""
    img = np.full((img_h, img_w, 3), 100, dtype=np.uint8)
    card_x = left
    card_y = top
    card_w = img_w - left - right
    card_h = img_h - top - bottom
    img[card_y : card_y + card_h, card_x : card_x + card_w] = 255
    _, buf = cv2.imencode(".png", img)
    return buf.tobytes()


def test_perfectly_centered():
    img = make_card_image(left=30, right=30, top=40, bottom=40)
    result = measure_centering(img)
    assert result.get("confidence") == "high"
    # Edge dilation can shift bounding rect by ±1px; allow that tolerance
    assert abs(result["left_right"] - 50) <= 1
    assert abs(result["top_bottom"] - 50) <= 1
    assert result["psa10_eligible"] is True


def test_off_center_fails_psa10():
    # 70/30 split → not PSA 10 eligible
    img = make_card_image(left=70, right=30, top=40, bottom=40)
    result = measure_centering(img)
    assert result.get("confidence") == "high"
    assert result["psa10_eligible"] is False


def test_borderline_55_45_eligible():
    # Exactly 55/45 → still PSA 10 eligible
    img = make_card_image(left=55, right=45, top=50, bottom=50)
    result = measure_centering(img)
    assert result.get("confidence") == "high"
    assert result["psa10_eligible"] is True


def test_empty_bytes_returns_error():
    result = measure_centering(b"not an image")
    assert "error" in result
    assert result["confidence"] == "low"
