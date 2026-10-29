# Checkpoints

Every long-running agent saves its state here after each step. When the quota or the machine stops it, the orchestrator wakes it and it resumes from the exact point. What the agents share is files, never the conversation.

## Files

One file for each agent and ticket: `.checkpoints/<role>-<ticket>.md`. The agent overwrites it after each step, so it always holds the latest state.

## Format

The file starts with these fields, one per line, written as `field: value`:

| Field | What it holds |
|---|---|
| `role` | the role of the agent: developer, critic, tester or batch |
| `ticket` | the number of the issue |
| `phase` | where the ticket is: round -1, development, critic or batch |
| `round` | the number of the round of the critic |
| `HEAD` | the commit that the work stands on |
| `next step` | the exact next action, so that anyone can resume from it |
| `pending` | what is still open: questions, failures and unfinished tests |

After the fields come three short sections: what is done, with the evidence (the command and its output); what is missing; and the reasoning in progress.

## Resuming

Before redoing anything, read your checkpoint, the status and the log of git, and the issue. Work that is on disk without a commit is yours: review it and continue from it.
