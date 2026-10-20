import json
import sys
import zipfile
from pathlib import Path, PurePosixPath


def fail(message):
    raise SystemExit(message)


if len(sys.argv) != 3:
    fail("Usage: python scripts/verify-archive.py <archive.zip> <dist-directory>")

archive_path = Path(sys.argv[1])
dist_path = Path(sys.argv[2])
if not archive_path.is_file() or not dist_path.is_dir():
    fail("Archive and build output must both exist.")

expected_files = {
    path.relative_to(dist_path).as_posix()
    for path in dist_path.rglob("*")
    if path.is_file()
}
required_files = {
    "manifest.json",
    "index.html",
    "content.js",
    "background.js",
    "rules/youtube-advertising.json",
}

try:
    with zipfile.ZipFile(archive_path) as archive:
        if archive.testzip() is not None:
            fail("ZIP CRC validation failed.")

        entries = archive.namelist()
        files = [entry for entry in entries if not entry.endswith("/")]
        actual_files = {entry.rstrip("/") for entry in files}
        if len(files) != len(actual_files):
            fail("ZIP contains duplicate paths.")
        if actual_files != expected_files:
            fail(
                "ZIP entries do not match dist. "
                f"Missing: {sorted(expected_files - actual_files)}; "
                f"unexpected: {sorted(actual_files - expected_files)}"
            )

        for entry in entries:
            path = PurePosixPath(entry.rstrip("/"))
            if path.is_absolute() or ".." in path.parts or "\\" in entry:
                fail(f"Unsafe or non-portable ZIP path: {entry}")

        missing = required_files - actual_files
        if missing:
            fail(f"ZIP is missing required extension files: {sorted(missing)}")

        manifest = json.loads(archive.read("manifest.json"))
        if manifest.get("manifest_version") != 3:
            fail("ZIP manifest is not Manifest V3.")

except (OSError, zipfile.BadZipFile, json.JSONDecodeError) as error:
    fail(f"Could not validate extension ZIP: {error}")

print(f"Verified {archive_path}: {len(expected_files)} production files.")
