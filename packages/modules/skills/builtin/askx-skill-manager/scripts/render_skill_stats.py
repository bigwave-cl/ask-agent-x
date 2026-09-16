#!/usr/bin/env python3
"""将 AskX schema 2 Registry 渲染为离线 HTML 统计报告。"""

from __future__ import annotations

import argparse
import json
from html import escape
from pathlib import Path


def read_registry(path: Path) -> dict:
    """读取并校验 AskX schema 2 Registry。"""
    value = json.loads(path.read_text(encoding="utf-8"))
    if value.get("schema") != 2 or not isinstance(value.get("skills"), dict):
        raise ValueError("Registry 必须是 AskX schema 2 数据。")
    return value


def render(registry_path: Path, output_directory: Path) -> Path:
    """生成不依赖网络资源的统计页面。"""
    registry = read_registry(registry_path)
    rows = []
    for skill_id, item in registry["skills"].items():
        targets = item.get("targets", {})
        issues = sum(target.get("status") in {"stale", "conflict", "failed"} for target in targets.values())
        rows.append({
            "id": skill_id,
            "name": item.get("current_name", skill_id),
            "version": item.get("version") or "-",
            "usage": int(item.get("usage_count", 0)),
            "last": item.get("last_used_at") or "-",
            "targets": len(targets),
            "issues": issues,
        })
    rows.sort(key=lambda item: (-item["usage"], item["name"]))
    maximum = max((item["usage"] for item in rows), default=1)
    body = "".join(
        "<tr>"
        f"<td>{index}</td><td><strong>{escape(item['name'])}</strong><small>{escape(item['id'])}</small></td>"
        f"<td>{escape(item['version'])}</td><td>{item['usage']}<i style=\"width:{item['usage'] / maximum * 100:.1f}%\"></i></td>"
        f"<td>{item['targets']}</td><td>{item['issues']}</td><td>{escape(item['last'])}</td></tr>"
        for index, item in enumerate(rows, 1)
    ) or '<tr><td colspan="7" class="empty">当前没有可统计的 Skill。</td></tr>'
    total_usage = sum(item["usage"] for item in rows)
    total_targets = sum(item["targets"] for item in rows)
    total_issues = sum(item["issues"] for item in rows)
    html = f"""<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AskX Skill Stats</title><style>
:root{{--bg:#f4f7f8;--card:#fff;--ink:#17191c;--muted:#748087;--line:#dfe6e8;--cyan:#2bb8c5;--lime:#b9eb4d}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 system-ui,-apple-system,sans-serif}}
main{{max-width:1180px;margin:auto;padding:40px 24px}}h1{{font-size:38px;margin:0 0 6px}}.meta{{color:var(--muted)}}
.cards{{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:28px 0}}.card,table{{background:var(--card);border:1px solid var(--line);border-radius:18px}}
.card{{padding:20px}}.card b{{display:block;font-size:28px;margin-top:8px}}table{{width:100%;border-collapse:separate;border-spacing:0;overflow:hidden}}
th,td{{padding:13px 15px;text-align:left;border-bottom:1px solid var(--line)}}th{{color:var(--muted);font-size:12px}}tr:last-child td{{border:0}}
small{{display:block;color:var(--muted)}}i{{display:block;height:3px;margin-top:6px;background:linear-gradient(90deg,var(--cyan),var(--lime));border-radius:9px}}.empty{{padding:50px;text-align:center;color:var(--muted)}}
@media(max-width:760px){{.cards{{grid-template-columns:repeat(2,1fr)}}main{{padding:24px 12px}}table{{display:block;overflow:auto}}}}
</style></head><body><main><h1>AskX Skill Stats</h1><div class="meta">Registry revision {registry.get('revision', 0)} · {escape(registry.get('updated_at', '-'))}</div>
<section class="cards"><div class="card">Skills<b>{len(rows)}</b></div><div class="card">累计 Usage<b>{total_usage}</b></div><div class="card">目标<b>{total_targets}</b></div><div class="card">异常目标<b>{total_issues}</b></div></section>
<table><thead><tr><th>#</th><th>Skill</th><th>版本</th><th>Usage</th><th>目标</th><th>异常</th><th>最近使用</th></tr></thead><tbody>{body}</tbody></table></main></body></html>"""
    output_directory.mkdir(parents=True, exist_ok=True)
    output_path = output_directory / "skill-stats.html"
    output_path.write_text(html, encoding="utf-8")
    return output_path


def main() -> None:
    """解析参数并输出报告路径。"""
    parser = argparse.ArgumentParser(description="Render AskX Skill statistics")
    parser.add_argument("--registry", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        print(render(args.registry.expanduser().resolve(), args.output.expanduser().resolve()))
    except (OSError, ValueError, json.JSONDecodeError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
