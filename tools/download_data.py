# -*- coding: utf-8 -*-
"""공공데이터포털 「전국도서관표준데이터」(publicDataPk=15013109)를
로그인·API키 없이 내려받아 tools/libraries_raw.json 으로 저장.

방법: ① columList.json 으로 totalCount·svcTableNm·컬럼 목록 획득
      ② standard.json 으로 전체 레코드 JSON 다운로드
"""
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

PK = "15013109"
OUT = Path(__file__).resolve().parent / "libraries_raw.json"
BASE = "https://www.data.go.kr/download"
HEADERS = {"User-Agent": "Mozilla/5.0"}


def get_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=120) as res:
        return json.load(res)


def main():
    meta = get_json(f"{BASE}/columList.json?pk={PK}&ext=CSV")
    total = meta["totalCount"]
    table = meta["tableVO"]["svcTableNm"]
    cols = [c["columCode"] for c in meta["columList"]
            if c["columCode"] not in ("INSTT_CODE", "INSTT_NM")]
    print("totalCount:", total, "| svcTableNm:", table, "| 컬럼:", len(cols))

    records = []
    page = 1
    while len(records) < total:
        params = [("publicDataPk", PK), ("totalCount", str(total)),
                  ("svcTableNm", table), ("perPage", "10000"), ("page", str(page))]
        params += [("colNmList", c) for c in cols]
        url = f"{BASE}/standard.json?" + urllib.parse.urlencode(params)
        data = get_json(url)
        if isinstance(data, list):
            chunk = data
        else:
            chunk = data.get("resultList") or data.get("records") or []
        if not chunk:
            print("페이지", page, "응답 키:", list(data.keys()))
            break
        records.extend(chunk)
        print("페이지", page, "누적", len(records))
        page += 1

    OUT.write_text(json.dumps({"totalCount": total, "records": records},
                              ensure_ascii=False), encoding="utf-8")
    print("저장:", OUT, "|", OUT.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
