# Project website

This directory is the public, buildless GitHub Pages site. It is not packed into
the adapter's npm artifact and is not a wallet application. No analytics,
external fonts, wallet connections or third-party runtime scripts are used.

Preview from the repository root:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory site
```

Open `http://127.0.0.1:8765`. JavaScript adds the journey explorer, evaluation
paths, evidence filters and command copying. All narrative content and source
links remain available without JavaScript. Assets use relative paths so the
site works under the GitHub Pages repository prefix.

Check public assets and repository-document links:

```sh
python3 tools/check-project-site.py
npm run lint
```

The Pages workflow checks and uploads only `index.html`, `.nojekyll` and
`assets/`; this maintenance file and the rest of the repository are not served.
Deployment follows pushes to `main` that touch the site or its check/workflow.
Pull requests run the site check without deploying. An explicit workflow
dispatch can redeploy. GitHub Pages must use GitHub Actions as its build source.

When updating evidence, read the linked qualification records. Keep source and
artifact identities explicit; later revisions do not inherit a live result.
Do not publish account-linked transaction identifiers, addresses, values,
operational timings, raw reports, custody or proof inputs. The frozen guided
live run was agent-operated; an independent human walkthrough remains open.
