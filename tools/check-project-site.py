#!/usr/bin/env python3
"""Check the static Pages bundle and its repository links without network access."""

from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
REPO = "/solardev-xyz/railgun-kohaku-adapter"


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids = set()
        self.links = []
        self.controls = []
        self.scripts = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if "id" in attrs:
            assert attrs["id"] not in self.ids, f"Duplicate id: {attrs['id']}"
            self.ids.add(attrs["id"])
        for key in ("href", "src"):
            if key in attrs:
                self.links.append(attrs[key])
        for key in ("data-step", "data-start", "data-copy"):
            if key in attrs:
                self.controls.append(attrs[key])
        if tag == "script":
            assert "src" in attrs, "Inline scripts are not permitted"
            self.scripts.append(attrs["src"])
        assert not any(key.startswith("on") for key in attrs), "Inline event handler"
        assert tag not in ("iframe", "form"), f"Unexpected active content: {tag}"


def markdown_fragments(path):
    fragments = set()
    occurrences = {}
    for heading in re.findall(r"^#{1,6}\s+(.+)$", path.read_text(), re.M):
        slug = re.sub(r"[^\w\- ]", "", heading.lower()).replace(" ", "-")
        occurrence = occurrences.get(slug, 0)
        occurrences[slug] = occurrence + 1
        fragments.add(slug if occurrence == 0 else f"{slug}-{occurrence}")
    return fragments


def main():
    html = (SITE / "index.html").read_text()
    page = Page()
    page.feed(html)
    assert page.scripts == ["assets/site.js"], "Unexpected script entry"
    assert all(control in page.ids for control in page.controls), "Unbound UI control"
    for link in page.links:
        url = urlsplit(link)
        if not url.scheme:
            assert not url.netloc, f"Protocol-relative URL: {link}"
            if url.path:
                assert not url.path.startswith("/"), f"Pages-prefix-unsafe asset: {link}"
                target = (SITE / unquote(url.path)).resolve()
                assert target.is_relative_to(SITE), f"Asset escapes site: {link}"
                assert target.is_file(), f"Missing local asset: {link}"
            if url.fragment:
                assert url.fragment in page.ids, f"Missing section: {link}"
            continue
        assert url.scheme == "https" and url.netloc == "github.com", f"Unexpected destination: {link}"
        assert url.path == REPO or url.path.startswith(REPO + "/"), f"Unexpected repository: {link}"
        if url.path.startswith(REPO + "/blob/main/"):
            path = ROOT / unquote(url.path.removeprefix(REPO + "/blob/main/"))
            assert path.resolve().is_relative_to(ROOT), f"Repository link escapes checkout: {link}"
            assert path.is_file(), f"Missing repository document: {link}"
            if url.fragment and path.suffix == ".md":
                assert url.fragment in markdown_fragments(path), f"Missing document heading: {link}"
        elif url.path == REPO and url.fragment:
            assert url.fragment in markdown_fragments(ROOT / "README.md"), f"Missing README heading: {link}"
    assets = set()
    for path in (SITE / "assets").rglob("*"):
        assert not path.is_symlink(), f"Symlink in public assets: {path}"
        if path.is_file():
            assets.add(path.relative_to(SITE).as_posix())
    assert assets == {"assets/style.css", "assets/site.js", "assets/mark.svg"}, "Review new public assets explicitly"
    evidence = json.loads((ROOT / "docs/qualification/reference-guided-live-2026-10-12/INDEX.json").read_text())
    public_software_pins = {
        evidence["installation"]["package"]["sha256"],
        evidence["runtime"]["archives"]["engine"]["sha256"],
        evidence["runtime"]["archives"]["prover"]["sha256"],
    }
    for relative in assets | {"index.html"}:
        content = (SITE / relative).read_text()
        assert not re.search(r"0x[0-9a-fA-F]{40,}\b", content), f"Account/transaction-like hex in {relative}"
        digests = set(re.findall(r"\b[0-9a-fA-F]{64}\b", content))
        assert digests <= public_software_pins, f"Unreviewed evidence-like digest in {relative}"
        assert not re.search(r"(?<![\w-])/(?:Users|private|home)/", content), f"Local path in {relative}"
        assert "BEGIN PRIVATE KEY" not in content, f"Private key in {relative}"
    packed = json.loads((ROOT / "package.json").read_text())["files"]
    assert not any(value.strip("/") == "site" or value.startswith("site/") for value in packed), "Website must stay outside package artifact"
    print(f"Project site: {len(page.links)} links, {len(page.ids)} unique IDs, local assets and control targets passed.")
    print("Scope: structural checks and obvious sensitive-data patterns; not a privacy audit or browser test.")


if __name__ == "__main__":
    main()
