import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveCodexBinary } from "./codex_binary.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

describe("resolveCodexBinary", () => {
  it("优先解析进程 PATH 中的可执行文件", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "askx-codex-binary-"));
    temporaryDirectories.push(directory);
    const executable = path.join(directory, "codex");
    await writeFile(executable, "#!/bin/sh\nexit 0\n");
    await chmod(executable, 0o755);
    await expect(resolveCodexBinary("codex", { PATH: directory })).resolves.toBe(executable);
  });

  it("绝对路径保持配置值", async () => {
    await expect(resolveCodexBinary("/tmp/custom-codex", { PATH: "" })).resolves.toBe("/tmp/custom-codex");
  });
});
