#!/usr/bin/env python3
"""Bootstrap OpsVault: install, build, typecheck, commit, push.

Double-click or: py -3 scripts/run-bootstrap.py
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def run(cmd: list[str] | str, **kwargs) -> None:
    print(f"==> {cmd if isinstance(cmd, str) else ' '.join(cmd)}")
    subprocess.check_call(cmd, cwd=ROOT, shell=isinstance(cmd, str), **kwargs)


def main() -> int:
    os.chdir(ROOT)
    print(f"cwd: {ROOT}")

    pnpm = shutil.which("pnpm")
    if not pnpm:
        # corepack path
        node = shutil.which("node")
        if not node:
            print("ERROR: node/pnpm not on PATH", file=sys.stderr)
            return 1
        run(["corepack", "enable"])
        run(["corepack", "prepare", "pnpm@10.12.4", "--activate"])
        pnpm = shutil.which("pnpm") or "pnpm"

    run([pnpm, "install"])
    run([pnpm, "--filter", "@ops-vault/core", "build"])
    run([pnpm, "--filter", "@ops-vault/db", "build"])
    run([pnpm, "--filter", "@ops-vault/api", "typecheck"])
    run([pnpm, "--filter", "@ops-vault/web", "typecheck"])

    # git
    try:
        subprocess.check_call(
            ["git", "remote", "get-url", "origin"],
            cwd=ROOT,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except subprocess.CalledProcessError:
        run(
            [
                "git",
                "remote",
                "add",
                "origin",
                "https://github.com/lepfsi/ops-vault.git",
            ]
        )

    run(["git", "add", "-A"])
    status = subprocess.check_output(
        ["git", "status", "--porcelain"], cwd=ROOT, text=True
    )
    if status.strip():
        msg = (
            "feat: OTP, SQLite VaultStore, vault auth + type fixes\n\n"
            "- core: createVaultAuth/unlockVault, TOTP (otpauth), encryptPayload\n"
            "- core: MasterKey / noble Uint8Array cast fixes for TS 5.9\n"
            "- db: VaultStore on node:sqlite with stable DatabaseSync typing\n"
            "- api/web: vault setup-unlock flow, secrets UI, live OTP codes"
        )
        run(["git", "commit", "-m", msg])
    else:
        print("==> nothing new to commit")

    run(["git", "branch", "-M", "main"])
    run(["git", "push", "-u", "origin", "main"])

    sha = subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
    ).strip()
    oneline = subprocess.check_output(
        ["git", "log", "-1", "--oneline"], cwd=ROOT, text=True
    ).strip()
    print(f"==> done\n{sha}\n{oneline}\nhttps://github.com/lepfsi/ops-vault")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
