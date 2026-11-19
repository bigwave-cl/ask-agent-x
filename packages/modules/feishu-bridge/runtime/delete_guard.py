#!/usr/bin/env python3
"""Deny local file deletion tools in Feishu bridge Codex turns."""

import json
import re
import sys


DELETE_COMMAND = re.compile(
    r"(?:^|[\s;&|({])(?:rm|rmdir|unlink)(?=\s|$)|"
    r"\bgit\s+(?:clean\b|reset\s+--hard\b)|"
    r"\bfind\b[^\n]*\s-delete\b|"
    r"\b(?:os\.(?:remove|unlink|rmdir)|shutil\.rmtree|"
    r"Path\([^\n]*\)\.(?:unlink|rmdir)|fs\.(?:rmSync|unlinkSync|rmdirSync|rm|unlink|rmdir))\s*\(",
    re.IGNORECASE,
)


def deletion_reason(event):
    tool = event.get("tool_name")
    tool_input = event.get("tool_input") or {}
    if not isinstance(tool_input, dict):
        return None
    command = tool_input.get("command") or tool_input.get("cmd") or ""
    if tool == "apply_patch" and re.search(r"^\*\*\* Delete File:", str(command), re.MULTILINE):
        return "飞书群会话禁止删除本机文件。"
    if tool == "Bash" and DELETE_COMMAND.search(str(command)):
        return "飞书群会话禁止执行本机文件删除命令。"
    return None


def main():
    try:
        event = json.load(sys.stdin)
        reason = deletion_reason(event)
    except (json.JSONDecodeError, TypeError, AttributeError):
        reason = "无法检查工具调用，已拒绝执行。"
    if reason:
        print(json.dumps({
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": reason,
            }
        }, ensure_ascii=False))


if __name__ == "__main__":
    main()
