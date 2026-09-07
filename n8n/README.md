# ENDRA n8n Workflows

n8n is ENDRA's orchestration layer (see `docs/decisions/ADR-001-n8n-as-orchestrator.md`).

## Structure

- `workflows/` - exported workflow JSON, one file per workflow. This is the
  source of truth. A change made live in n8n is not considered complete until
  it is exported back into this folder.
- `templates/` - reusable sub-workflow templates.

## Planned workflows (not yet created - Phase 4+)

- `ENDRA — Entry`
- `ENDRA — Telegram Inbound`
- `ENDRA — Agent Gateway`
- `ENDRA — Memory Jobs`
- `ENDRA — Notifications`
- `ENDRA — Scheduler`
- `Tools/Weather`, `Tools/Web Search`, `Tools/Gmail`, `Tools/Calendar`, `Tools/Notes`, `Tools/Finance`

Keep workflows modular. Prefer small, composable sub-workflows over one large
workflow.
