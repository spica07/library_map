# -*- coding: utf-8 -*-
"""libraries_raw.json (공공데이터포털 전국도서관표준데이터)
-> assets/js/data.js 생성

- 시도명 정규화(서울특별시 -> 서울), 시군구는 표준데이터 값 사용
- 이름+지역+시군구 기준 중복 제거(기준일 최신 우선)
- 운영시간(평일/토/공휴일)·휴관일·장서·좌석 정리
- 유형: 공공도서관 / 작은도서관 / 어린이도서관 / 기타(학교·전문·장애인·대학)
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

TOOLS = Path(__file__).resolve().parent
BASE = TOOLS.parent
RAW = TOOLS / "libraries_raw.json"
OUT = BASE / "assets" / "js" / "data.js"

REGION_MAP = {
    "서울특별시": "서울", "부산광역시": "부산", "대구광역시": "대구",
    "인천광역시": "인천", "광주광역시": "광주", "대전광역시": "대전",
    "울산광역시": "울산", "세종특별자치시": "세종", "경기도": "경기",
    "강원특별자치도": "강원", "강원도": "강원",
    "충청북도": "충북", "충청남도": "충남",
    "전북특별자치도": "전북", "전라북도": "전북", "전라남도": "전남",
    "경상북도": "경북", "경상남도": "경남",
    "제주특별자치도": "제주", "제주도": "제주",
}

REGION_ORDER = ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
                "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"]

KIND_MAP = {
    "공공도서관": "공공도서관",
    "작은도서관": "작은도서관",
    "어린이도서관": "어린이도서관",
}


def norm_name(name):
    return re.sub(r"\s", "", name)


def hours_str(o, c):
    o = (o or "").strip()
    c = (c or "").strip()
    if not o or not c or (o in ("00:00", "0:00") and c in ("00:00", "0:00")):
        return ""
    return o + " ~ " + c


def to_int(v):
    try:
        n = int(float(str(v).strip()))
        return n if n > 0 else 0
    except (TypeError, ValueError):
        return 0


def trim(s, n):
    if not s:
        return ""
    s = re.sub(r"\s+", " ", str(s)).strip()
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


def main():
    raw = json.load(open(RAW, encoding="utf-8"))
    recs = raw["records"]
    print("원본:", len(recs))

    items = {}
    skipped = []
    for r in recs:
        region = REGION_MAP.get((r.get("CTPRVN_NM") or "").strip())
        if not region:
            skipped.append((r.get("LBRRY_NM"), r.get("CTPRVN_NM")))
            continue
        try:
            lat = round(float(r["LATITUDE"]), 6)
            lng = round(float(r["LONGITUDE"]), 6)
        except (TypeError, ValueError):
            skipped.append((r.get("LBRRY_NM"), "좌표없음"))
            continue
        if not (33.0 < lat < 38.7 and 124.5 < lng < 131.9):
            skipped.append((r.get("LBRRY_NM"), "좌표범위밖"))
            continue

        name = re.sub(r"\s+", " ", r["LBRRY_NM"] or "").strip()
        if not name:
            continue
        district = (r.get("SIGNGU_NM") or "").strip()
        key = (norm_name(name), region, district)
        ref = r.get("REFERENCE_DATE") or ""
        if key in items and items[key]["_ref"] >= ref:
            continue

        homepage = (r.get("HOMEPAGE_URL") or "").strip()
        if homepage and not homepage.startswith("http"):
            homepage = "http://" + homepage

        hours_sat = hours_str(r.get("SAT_OPER_OPER_OPEN_HHMM"), r.get("SAT_OPER_CLOSE_HHMM"))
        hours_hol = hours_str(r.get("HOLIDAY_OPER_OPEN_HHMM"), r.get("HOLIDAY_CLOSE_OPEN_HHMM"))

        items[key] = {
            "_ref": ref,
            "name": name,
            "kind": KIND_MAP.get((r.get("LBRRY_SE") or "").strip(), "기타"),
            "region": region,
            "district": district,
            "address": (r.get("RDNMADR") or "").strip(),
            "lat": lat,
            "lng": lng,
            "phone": (r.get("PHONE_NUMBER") or "").strip(),
            "homepage": homepage,
            "hoursWeek": hours_str(r.get("WEEKDAY_OPER_OPEN_HHMM"), r.get("WEEKDAY_OPER_COLSE_HHMM")),
            "hoursSat": hours_sat,
            "hoursHol": hours_hol,
            "satOpen": bool(hours_sat),
            "holOpen": bool(hours_hol),
            "closed": trim(r.get("CLOSE_DAY"), 90),
            "books": to_int(r.get("BOOK_CO")),
            "seats": to_int(r.get("SEAT_CO")),
            "loanCount": to_int(r.get("LON_CO")),
            "loanDays": to_int(r.get("LON_DAYCNT")),
            "operOrg": trim(r.get("OPER_INSTITUTION_NM"), 40),
            "refDate": ref,
        }

    out = []
    ordered = sorted(items.values(),
                     key=lambda x: (REGION_ORDER.index(x["region"]), x["district"], x["name"]))
    for i, it in enumerate(ordered, 1):
        it.pop("_ref")
        it["id"] = i
        out.append(it)

    print("정제 후:", len(out), "| 제외:", len(skipped))
    for s in skipped[:10]:
        print("  제외:", s)

    from collections import Counter
    print("지역별:", dict(Counter(x["region"] for x in out)))
    print("유형별:", dict(Counter(x["kind"] for x in out)))
    print("토요일 운영:", sum(1 for x in out if x["satOpen"]),
          "| 공휴일 운영:", sum(1 for x in out if x["holOpen"]))

    meta = {
        "surveyDate": date.today().isoformat(),
        "source": "공공데이터포털 전국도서관표준데이터",
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("// 자동 생성 파일 — tools/build_data.py 가 생성. 직접 수정하지 마세요.\n")
        f.write("window.DATA_META = " + json.dumps(meta, ensure_ascii=False) + ";\n")
        f.write("window.LIBRARIES = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print("저장:", OUT, "|", OUT.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
