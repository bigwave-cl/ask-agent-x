#!/usr/bin/env python3
"""把 AskX 本地 registry 渲染为离线 HTML 表格。"""

from __future__ import annotations

import argparse
import json
from html import escape
from pathlib import Path


def render(registry_path: Path, output_path: Path) -> None:
    """读取 registry 并生成不依赖网络资源的统计页面。"""
    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    rows = sorted(
        registry.get("skills", {}).items(),
        key=lambda item: (-int(item[1].get("usage_count", 0)), item[1].get("current_name", item[0])),
    )
    body = "".join(
        f"<tr><td>{escape(item.get('current_name', skill_id))}</td>"
        f"<td>{escape(item.get('version', '-'))}</td>"
        f"<td>{int(item.get('usage_count', 0))}</td>"
        f"<td>{len(item.get('targets', {}))}</td></tr>"
        for skill_id, item in rows
    )
    html = f"""<!doctype html><html lang=\"zh-CN\"><meta charset=\"utf-8\">
<title>AskX Skill Stats</title><style>
body{{font:14px/1.5 system-ui;margin:32px;color:#17191c;background:#f7f9fa}}
table{{width:100%;border-collapse:collapse;background:white}}th,td{{padding:10px 12px;border:1px solid #dfe4e7;text-align:left}}
</style><h1>AskX Skill Stats</h1><table><thead><tr><th>Skill</th><th>Version</th><th>Usage</th><th>Targets</th></tr></thead><tbody>{body}</tbody></table></html>"""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(html, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--registry", type=Path, default=Path(__file__).parents[1] / "registry" / "skills.json")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    render(args.registry, args.output)


if __name__ == "__main__":
    main()
