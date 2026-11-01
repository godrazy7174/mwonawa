# -*- coding: utf-8 -*-
"""테스트 목록. 이 순서가 홈 화면 순서이고, 첫 번째가 맨 위 큰 카드가 된다."""
import importlib

MODULES = ["snack", "emoji", "chat", "love", "cafe", "rpg", "trip", "money", "study", "year2027"]
WIDE = {"2027"}  # 홈에서 가로로 넓게 보여 줄 테스트(slug)


def load_tests():
    return [importlib.import_module(f"content.{m}").TEST for m in MODULES]
