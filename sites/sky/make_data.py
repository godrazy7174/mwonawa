# -*- coding: utf-8 -*-
"""하늘봐 달력과 시각표에 쓰는 숫자를 미리 계산해 data/에 저장한다.
빌드는 이 파일들만 읽으므로, 범위를 늘릴 때만 다시 돌리면 된다:
    pip install ephem korean_lunar_calendar
    python3 sites/sky/make_data.py
해와 달 시각은 서울(북위 37.5665°, 동경 126.9780°), 해발 0 m, 대기 굴절 34′, 해와 달의 윗가장자리 기준이다."""
import datetime
import json
import math
import os

import ephem
from korean_lunar_calendar import KoreanLunarCalendar

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data")
KST = datetime.timedelta(hours=9)
FIRST = datetime.date(2026, 11, 1)
LAST = datetime.date(2030, 12, 31)
YEARS = range(2026, 2031)


def observer():
    o = ephem.Observer()
    o.lat, o.lon = "37.5665", "126.9780"
    o.elevation = 0
    o.pressure = 0
    o.horizon = "-0:34"
    return o


def local(d):
    """ephem 시각을 한국 시각 datetime으로 (분 단위 반올림, 자정을 넘기면 23:59)."""
    dt = ephem.Date(d).datetime() + KST
    r = (dt + datetime.timedelta(seconds=30)).replace(second=0, microsecond=0)
    if r.date() != dt.date():
        r = dt.replace(second=0, microsecond=0)
    return r


def phase_name(p):
    if p < 0.03 or p >= 0.97:
        return "삭"
    for lim, nm in ((0.22, "초승달"), (0.28, "상현달"), (0.47, "차오르는 달"), (0.53, "보름달"), (0.72, "기우는 달"), (0.78, "하현달")):
        if p < lim:
            return nm
    return "그믐달"


def moon_phase(when):
    m, s = ephem.Moon(when), ephem.Sun(when)
    diff = (ephem.Ecliptic(m).lon - ephem.Ecliptic(s).lon) % (2 * math.pi)
    return diff / (2 * math.pi), m.moon_phase


def day_row(day):
    o = observer()
    start = ephem.Date(datetime.datetime(day.year, day.month, day.day) - KST)
    end = ephem.Date(start + 1)
    sun, moon = ephem.Sun(), ephem.Moon()
    o.date = start
    sr = local(o.next_rising(sun))
    o.date = start
    ss = local(o.next_setting(sun))
    row = [sr.strftime("%H:%M"), ss.strftime("%H:%M")]
    for fn in (o.next_rising, o.next_setting):
        o.date = start
        try:
            t = fn(moon)
            row.append(local(t).strftime("%H:%M") if t < end else "")
        except (ephem.AlwaysUpError, ephem.NeverUpError):
            row.append("")
    p, frac = moon_phase(ephem.Date(start + 21 / 24))
    row += [round(p, 3), round(frac, 3)]
    return row


def lunar(y, m, d):
    c = KoreanLunarCalendar()
    c.setLunarDate(y, m, d, False)
    return c.SolarIsoFormat()


def main():
    os.makedirs(OUT, exist_ok=True)
    hol = {}
    for y in YEARS:
        hol[f"{y}:seollal"] = lunar(y, 1, 1)
        hol[f"{y}:boreum"] = lunar(y, 1, 15)
        hol[f"{y}:chilseok"] = lunar(y, 7, 7)
        hol[f"{y}:chuseok"] = lunar(y, 8, 15)
    alm = {}
    day = FIRST
    while day <= LAST:
        alm.setdefault(day.year, {})[day.isoformat()] = day_row(day)
        day += datetime.timedelta(days=1)
    for y, rows in alm.items():
        with open(os.path.join(OUT, f"alm-{y}.json"), "w", encoding="utf-8") as f:
            json.dump(rows, f, ensure_ascii=False, separators=(",", ":"))
    months = {}
    for y, rows in alm.items():
        for key in rows:
            months.setdefault(key[:7], None)
    info = {}
    for ym in sorted(months):
        y, m = map(int, ym.split("-"))
        ms = ephem.Date(datetime.datetime(y, m, 1) - KST)
        me = ephem.Date(datetime.datetime(y + (m == 12), m % 12 + 1, 1) - KST)
        ev = []
        for kind, fn in (("full", ephem.next_full_moon), ("new", ephem.next_new_moon), ("first", ephem.next_first_quarter_moon), ("last", ephem.next_last_quarter_moon)):
            t = fn(ms)
            while t < me:
                lt = ephem.Date(t).datetime() + KST
                ev.append([kind, lt.strftime("%Y-%m-%d %H:%M")])
                t = fn(ephem.Date(t + 1))
        ev.sort(key=lambda r: r[1])
        info[ym] = ev
    with open(os.path.join(OUT, "holidays.json"), "w", encoding="utf-8") as f:
        json.dump(hol, f, ensure_ascii=False, indent=1)
    with open(os.path.join(OUT, "moons.json"), "w", encoding="utf-8") as f:
        json.dump(info, f, ensure_ascii=False, indent=1)
    print("holidays", len(hol), "days", sum(len(r) for r in alm.values()), "months", len(info))


if __name__ == "__main__":
    main()
