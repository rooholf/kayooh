# OpenCode Personas & GitHub Automation

AI agent personas for the Jambi Bike Rental Platform, generated from `AGENTS.md`,
`SRS_Jambi_Bike_Rental_Platform.md` (v1.3) and the open GitHub issues. The GitHub
Actions workflows use these personas to automate the issue tracker.

## Personas (`.opencode/agents/`)

| Agent ID | File | AGENTS.md | GitHub label | Color |
|---|---|---|---|---|
| `architect` | `architect.md` | #1 Lead Platform Architect | `Lead Platform Architect` | `#5319E7` |
| `backend` | `backend.md` | #2 Backend Specialist | `Backend Specialist` | `#1D76DB` |
| `web-frontend` | `web-frontend.md` | #3 Web Frontend Developer | `Web Frontend Developer` | `#0E8A16` |
| `pwa-engineer` | `pwa-engineer.md` | #4 Offline PWA Engineer | `Offline PWA Engineer` | `#FBCA04` |
| `qa` | `qa.md` | #5 Quality Assurance & SDET | `Quality Assurance & SDET` | `#D93F0B` |
| `tpm` | `tpm.md` | #6 Technical Project Manager | `Technical Project Manager` | `#B60205` |
| `ui-ux` | `ui-ux.md` | #7 UI/UX Designer | `UI/UX Designer` | `#a2eeef` |

All personas run on **GLM 5.3 Flash (free)**:

- Local (this machine): `omniroute/crw/glm-5.3-flash:free` via `omniroute`
  (the `crw/` relay to CrowLLM through `http://localhost:20128/v1`).
- GitHub Actions: `crowllm/glm-5.3-flash:free` — same model on CrowLLM's hosted
  endpoint (`https://crowllm.com/v1`), which runners can reach. The project
  config (`.opencode/opencode.json`) registers the `crowllm` provider with the
  key read from `CROWLLM_API_KEY`.

Every persona embeds its scope, directives and issue-solving loop from
`AGENTS.md`, grounded in the SRS revision history (1.1 no deposits, 1.2 guest
checkout, 1.3 link-in-bio direct entry) and the currently open issues
(#13, #35–#43).

## Workflows (`.github/workflows/`)

| Workflow | Trigger | Persona | What it does |
|---|---|---|---|
| `opencode.yml` | `/oc` or `/opencode` in an issue/PR comment | Resolved from the issue's persona label (falls back to `general`) | Implements, fixes, reviews, or answers on a branch/PR |
| `opencode-triage.yml` | Issue opened/edited | `tpm` | Applies the persona label, posts routing note with SRS references |
| `opencode-roadmap-audit.yml` | Mondays 02:00 UTC + manual dispatch | `tpm` | Posts a grounded status report (critical path, blockers, TBD decisions) |

## Setup

1. **Secrets** (repo Settings → Secrets and variables → Actions):
   - `CROWLLM_API_KEY` — your CrowLLM key (free model; the hosted endpoint is
     required because the local `omniroute` proxy at `localhost:20128` is
     unreachable from runners).
   - `OPENCODE_GITHUB_TOKEN` — a PAT with **repo** scope (needed by the triage
     and audit workflows which use `use_github_token: true`; the main
     `/oc` workflow falls back to the built-in `github.token`).

2. **GitHub App (optional, for the `/oc` workflow's OIDC mode):** install
   [opencode-agent](https://github.com/apps/opencode-agent). If you skip it,
   the `/oc` workflow still works — it passes `GITHUB_TOKEN` explicitly and
   grants `contents: read`, `issues: write`, `pull-requests: write`.

3. **Labels** already exist and mirror the personas 1:1, so triage and the
   label→persona routing in `opencode.yml` work out of the box.

## Usage

```text
# on any issue — routed to the persona matching its label
/oc explain this issue
/oc fix this            # implements on a branch and opens a PR

# on PR code lines
/oc add error handling here

# force a specific persona regardless of label
/oc @backend review the reservation lock SQL
/oc @qa what does T-16 assert?
```

## Known trade-offs

- CrowLLM's free tier measured **~80 s average latency** (24 h window,
  2026-11-10) with a ~97% success rate — acceptable for async CI, not for
  interactive pair programming. Swap `model:` in the workflows to any hosted
  provider when you need speed.
- The workflows run with broad write permissions on issues/PRs. Tighten
  `permissions:` per workflow if that concerns you.
- `opencode-roadmap-audit.yml` expects a pinned tracking issue to comment on;
  create one before enabling the schedule (or trigger it manually first with
  **Run workflow** and check the log output).
