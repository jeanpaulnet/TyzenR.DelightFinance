REMOTE_DIR = "/delight.futurecaps.com"
PUBLISH_URL = "https://delight.futurecaps.com"
FTP_CREDENTIALS_RELATIVE = r"Auto.AI\Credentials\tyzenr.ftp.txt"
GIT_BRANCH = "main"

"""
deploy.py — Build & FTP deploy for delight.futurecaps.com

Steps:
  1. Read FTP credentials from Dropbox\\Auto.AI\\tyzenr.ftp.txt
  2. Git pull master
  3. npm run build  (Vite → dist/)
  4. Upload dist/ to FTP root of delight.futurecaps.com

Expected format of tyzenr.ftp.txt:
  host=ftp.futurecaps.com
  username=your_user
  password=your_pass
"""

import ftplib
import json
import os
import subprocess
import webbrowser
import sys
from pathlib import Path


# ── Locate Dropbox folder ─────────────────────────────────────────────────────

def find_dropbox_root() -> Path:
    """Read Dropbox's own info.json to get the canonical path."""
    info_locations = [
        Path(os.environ.get("APPDATA", "")) / "Dropbox" / "info.json",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Dropbox" / "info.json",
    ]
    for info_file in info_locations:
        if info_file.exists():
            data = json.loads(info_file.read_text(encoding="utf-8"))
            # info.json has "personal" and/or "business" keys
            for key in ("personal", "business"):
                if key in data:
                    return Path(data[key]["path"])
    raise FileNotFoundError(
        "Could not find Dropbox info.json. Is Dropbox installed and signed in?"
    )


# ── Parse credentials file ────────────────────────────────────────────────────

def load_ftp_credentials(creds_path: Path) -> dict:
    """Parse key=value pairs from the credentials file."""
    if not creds_path.exists():
        raise FileNotFoundError(f"Credentials file not found: {creds_path}")

    creds = {}
    for line in creds_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            key, _, value = line.partition("=")
            creds[key.strip()] = value.strip()

    required = ("host", "username", "password")
    missing = [k for k in required if k not in creds]
    if missing:
        raise ValueError(f"Missing keys in credentials file: {', '.join(missing)}")

    return creds


# ── Shell helpers ─────────────────────────────────────────────────────────────

def run(cmd: list[str], cwd: Path | None = None) -> None:
    """Run a command, stream output, raise on failure."""
    print(f"\n▶  {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=cwd, shell=True)
    if result.returncode != 0:
        sys.exit(f"Command failed with exit code {result.returncode}")


# ── FTP upload ────────────────────────────────────────────────────────────────

def ftp_mkdir_p(ftp: ftplib.FTP, remote_path: str) -> None:
    """Recursively create remote directories (ignore if they exist)."""
    parts = [p for p in remote_path.replace("\\", "/").split("/") if p]
    for part in parts:
        try:
            ftp.mkd(part)
        except ftplib.error_perm:
            pass  # already exists
        ftp.cwd(part)


def upload_directory(ftp: ftplib.FTP, local_dir: Path, remote_root: str) -> None:
    """Recursively upload local_dir to remote_root on the FTP server."""
    try:
        ftp.cwd(remote_root)
    except ftplib.error_perm:
        ftp.cwd("/")
        ftp_mkdir_p(ftp, remote_root)

    for item in sorted(local_dir.rglob("*")):
        rel = item.relative_to(local_dir)
        remote_path = remote_root.rstrip("/") + "/" + str(rel).replace("\\", "/")

        if item.is_dir():
            try:
                ftp.mkd(remote_path)
            except ftplib.error_perm:
                pass  # already exists
        else:
            remote_dir = remote_path.rsplit("/", 1)[0]
            try:
                ftp.cwd(remote_dir)
            except ftplib.error_perm:
                ftp.cwd("/")
                ftp_mkdir_p(ftp, remote_dir)

            print(f"  ↑ {rel}")
            with open(item, "rb") as f:
                ftp.storbinary(f"STOR {item.name}", f)


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    project_root = Path(__file__).parent.resolve()

    # ── Step 1: Load credentials ──────────────────────────────────────────────
    print("═" * 60)
    print("STEP 1 — Loading FTP credentials")
    print("═" * 60)
    dropbox = find_dropbox_root()
    creds_path = dropbox / FTP_CREDENTIALS_RELATIVE
    print(f"  Dropbox   : {dropbox}")
    print(f"  Creds file: {creds_path}")
    creds = load_ftp_credentials(creds_path)
    host       = creds["host"]
    username   = creds["username"]
    password   = creds["password"]
    remote_dir = REMOTE_DIR
    print(f"  Host      : {host}")
    print(f"  User      : {username}")
    print(f"  Remote dir: {remote_dir}")

    # ── Step 2: Git pull master ───────────────────────────────────────────────
    print("\n" + "═" * 60)
    print("STEP 2 — Git pull master")
    print("═" * 60)
    run(["git", "fetch", "origin"], cwd=project_root)
    run(["git", "checkout", GIT_BRANCH], cwd=project_root)
    run(["git", "pull", "origin", GIT_BRANCH], cwd=project_root)

    # ── Step 3: Vite build ────────────────────────────────────────────────────
    print("\n" + "═" * 60)
    print("STEP 3 — npm run build")
    print("═" * 60)
    run(["npm", "install"], cwd=project_root)
    run(["npm", "run", "build"], cwd=project_root)

    dist_dir = project_root / "dist"
    if not dist_dir.is_dir():
        sys.exit(f"Build output not found at {dist_dir}. Check your vite config.")

    # ── Step 4: FTP upload ────────────────────────────────────────────────────
    print("\n" + "═" * 60)
    print(f"STEP 4 — Uploading dist/ → {host}{remote_dir}")
    print("═" * 60)
    with ftplib.FTP(host, username, password, timeout=30) as ftp:
        ftp.set_pasv(True)
        print(f"  Connected: {ftp.getwelcome()}")
        upload_directory(ftp, dist_dir, remote_dir)

    print(f"\n✅  Deploy complete → {PUBLISH_URL}")
    webbrowser.open(PUBLISH_URL)


if __name__ == "__main__":
    main()
