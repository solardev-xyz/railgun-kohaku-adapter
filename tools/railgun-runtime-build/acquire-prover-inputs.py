#!/usr/bin/env python3
"""Acquire the pinned prover build closure as data. Never run package scripts."""
import base64
import hashlib
import json
import os
import platform
import re
from pathlib import Path
import subprocess
import sys
import tarfile


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate_recipe(recipe):
    require(set(recipe) == {"schema", "scope", "sourceLockSha256", "packages", "provenance"}
            and recipe["schema"] == "railgun-prover-acquisition-v1", "Recipe schema")
    require(re.fullmatch(r"[a-f0-9]{64}", recipe["sourceLockSha256"]) is not None,
            "Source lock digest")
    require(isinstance(recipe["packages"], list) and len(recipe["packages"]) == 16,
            "Package count")
    keys = set()
    for package in recipe["packages"]:
        require(set(package) == {"name", "version", "integrity", "directory", "dependencies"},
                "Package fields")
        name, version = package["name"], package["version"]
        require(re.fullmatch(r"(?:@[a-z0-9_-]+/)?[a-z0-9_-]+", name) is not None
                and re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", version) is not None,
                "Package identity")
        require(package["directory"] == "node_modules/.pnpm/" + name.replace("/", "+")
                + "@" + version + "/node_modules/" + name, "Package directory")
        require(re.fullmatch(r"sha512-[A-Za-z0-9+/]{86}==", package["integrity"]) is not None,
                "Package integrity")
        key = name + "@" + version
        require(key not in keys, "Duplicate package")
        keys.add(key)
    for package in recipe["packages"]:
        require(isinstance(package["dependencies"], dict), "Dependency map")
        for name, key in package["dependencies"].items():
            require(key in keys and key.rsplit("@", 1)[0] == name, "Dependency identity")


def extract(archive_path, destination):
    """All members are validated before writing anything beneath destination."""
    with tarfile.open(archive_path, "r:gz") as archive:
        members = archive.getmembers()
        require(0 < len(members) < 10000, "Archive member bound")
        require(sum(member.size for member in members) < 128 * 1024 * 1024,
                "Archive size bound")
        require(all(member.size >= 0 for member in members), "Negative member size")
        prefix = members[0].name.split("/")[0]
        seen = set()
        targets = []
        for member in members:
            parts = member.name.rstrip("/").split("/")
            require(parts[0] == prefix and all(part not in ("", ".", "..") for part in parts),
                    "Unsafe archive path")
            require(not Path(member.name).is_absolute(), "Absolute archive path")
            require(member.isfile() or member.isdir(), "Archive link or special file refused")
            relative = Path(*parts[1:])
            require(str(relative) not in seen, "Duplicate archive member")
            require(len(parts) > 1 or member.isdir(), "Archive root must be a directory")
            seen.add(str(relative))
            targets.append((member, destination / relative))
        for member, target in targets:
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.extractfile(member) as source, target.open("xb") as output:
                    output.write(source.read())
                os.chmod(target, member.mode & 0o755)


def verify_archive(archive, integrity):
    actual = "sha512-" + base64.b64encode(hashlib.sha512(archive.read_bytes()).digest()).decode()
    require(actual == integrity, "Archive integrity differs")


def verify_inputs(root, inventory):
    for row in inventory["files"]:
        file = root / row["file"]
        require(file.is_file() and not file.is_symlink(), "Input absent or symlinked")
        require(file.stat().st_size == row["size"], "Input size differs")
        require(hashlib.sha256(file.read_bytes()).hexdigest() == row["sha256"],
                "Input hash differs")


def acquire(root):
    here = Path(__file__).resolve().parent
    recipe_bytes = (here / "PROVER-PACKAGES.json").read_bytes()
    recipe = json.loads(recipe_bytes)
    validate_recipe(recipe)
    require(root.is_absolute() and not root.exists() and ".." not in root.parts and
            root.parent.resolve() == root.parent, "A new canonical absolute directory is required")
    root.mkdir(mode=0o700)
    for name in ("empty-user.npmrc", "empty-global.npmrc"):
        (root / name).write_text("")
    env = {key: value for key, value in os.environ.items()
           if key in ("PATH", "HOME", "TMPDIR", "LANG") or key.startswith("LC_")}
    downloads = root / "downloads"
    downloads.mkdir(mode=0o700)
    downloaded = []
    for package in recipe["packages"]:
        command = ["npm", "--userconfig", str(root / "empty-user.npmrc"),
                   "--globalconfig", str(root / "empty-global.npmrc"), "pack",
                   package["name"] + "@" + package["version"], "--ignore-scripts", "--json",
                   "--pack-destination", str(downloads), "--cache", str(root / "npm-cache"),
                   "--registry", "https://registry.npmjs.org"]
        result = subprocess.run(command, check=True, capture_output=True, text=True,
                                env=env, cwd=root, timeout=120)
        metadata = json.loads(result.stdout)[0]
        filename = metadata["filename"]
        require(Path(filename).name == filename, "Unexpected npm archive path")
        archive = downloads / filename
        verify_archive(archive, package["integrity"])
        downloaded.append({"package": package["name"] + "@" + package["version"],
                           "filename": filename})
        destination = root / package["directory"]
        destination.mkdir(parents=True, mode=0o700)
        extract(archive, destination)
        print(json.dumps({"fetched": package["name"] + "@" + package["version"],
                          "integrityMatches": True}), flush=True)
    by_key = {package["name"] + "@" + package["version"]: package
              for package in recipe["packages"]}
    for package in recipe["packages"]:
        directory = root / package["directory"]
        modules = Path(str(directory).rsplit("/node_modules/", 1)[0]) / "node_modules"
        for name, key in package["dependencies"].items():
            link = modules / name
            link.parent.mkdir(parents=True, exist_ok=True)
            target = root / by_key[key]["directory"]
            link.symlink_to(os.path.relpath(target, link.parent), target_is_directory=True)
    inventory = json.loads((here / "scripts/fixtures/railgun-prover-inputs.json").read_text())
    verify_inputs(root, inventory)
    record = {"packages": recipe["packages"], "authenticatedInputFiles": len(inventory["files"]),
              "recipeSha256": hashlib.sha256(recipe_bytes).hexdigest(),
              "sourceLockSha256": recipe["sourceLockSha256"], "scriptsExecuted": False,
              "python": platform.python_version(), "downloads": downloaded,
              "npm": subprocess.run(["npm", "--version"], check=True, capture_output=True,
                                    text=True, env=env, cwd=root, timeout=30).stdout.strip()}
    with (root / "ACQUISITION.json").open("x") as output:
        output.write(json.dumps(record, indent=2) + "\n")
    return record


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python3 acquire-prover-inputs.py /absolute/new-directory")
    try:
        record = acquire(Path(sys.argv[1]))
        print(json.dumps({"passed": True, "files": record["authenticatedInputFiles"]}))
    except (ValueError, TypeError, KeyError, OSError, subprocess.SubprocessError, tarfile.TarError) as error:
        print("Acquisition refused; partial directory preserved: " + str(error), file=sys.stderr)
        raise SystemExit(1)
