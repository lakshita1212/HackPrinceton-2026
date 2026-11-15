"""Publish the public copy of Stay Tuned to Hugging Face Spaces.

  backend\\.venv\\Scripts\\python deploy\\deploy_space.py        (from the repo root)

Needs HF_TOKEN (write) in backend/.env. Copies only what the site needs into a
clean staging folder (no .env, no keys, no texted photos), uploads it to the
Space, and stores the Groq key as a private Space secret. The Space runs on
GROQ_API_KEY_2 (a teammate's account) so the judging laptop's quota is untouched.
Rerun it after changes; Hugging Face rebuilds automatically.
"""
import os
import shutil
import sys
import tempfile
from pathlib import Path

from dotenv import dotenv_values
from huggingface_hub import HfApi

ROOT = Path(__file__).resolve().parent.parent
ENV = dotenv_values(ROOT / "backend" / ".env")
SPACE = os.getenv("HF_SPACE", "Lakshita12/stay-tuned")

SKIP_DIRS = {".venv", "__pycache__", "memories", "tests", ".git"}
SKIP_FILES = {".env", "redteam_results.md", "redteam_era_results.md"}


def stage(dest: Path) -> None:
    shutil.copy(ROOT / "deploy" / "Dockerfile", dest / "Dockerfile")
    shutil.copy(ROOT / "deploy" / "README.md", dest / "README.md")
    for part in ("backend", "frontend"):
        for src in (ROOT / part).rglob("*"):
            rel = src.relative_to(ROOT)
            if any(p in SKIP_DIRS for p in rel.parts) or src.name in SKIP_FILES or src.is_dir():
                continue
            # From the cache, ship only the saved demo answers and fetched Wikipedia pages.
            if "cache" in rel.parts and not (src.name == "answers.json" or "wiki" in rel.parts):
                continue
            out = dest / rel
            out.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, out)


def main() -> None:
    token = ENV.get("HF_TOKEN")
    groq_key = ENV.get("GROQ_API_KEY_2") or ENV.get("GROQ_API_KEY")
    if not token or not groq_key:
        sys.exit("Need HF_TOKEN and a Groq key in backend/.env")
    api = HfApi(token=token)
    api.create_repo(SPACE, repo_type="space", space_sdk="docker", exist_ok=True)
    api.add_space_secret(SPACE, "GROQ_API_KEY", groq_key)
    with tempfile.TemporaryDirectory() as tmp:
        stage(Path(tmp))
        files = [p for p in Path(tmp).rglob("*") if p.is_file()]
        size = sum(p.stat().st_size for p in files) / 1e6
        print(f"Uploading {len(files)} files ({size:.0f} MB) to {SPACE}...", flush=True)
        api.upload_folder(folder_path=tmp, repo_id=SPACE, repo_type="space",
                          commit_message="Deploy Stay Tuned")
    print(f"Done. Building at https://huggingface.co/spaces/{SPACE}")
    print(f"Live link (after the build): https://{SPACE.replace('/', '-').lower()}.hf.space")


if __name__ == "__main__":
    main()
