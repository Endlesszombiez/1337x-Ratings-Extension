# Agent Instructions

## Version Bumps
- If an agent edits `manifest.json` or any file under `src/`, bump the extension version by one patch step at the end of the agent's work, not after each individual change.
- Version bump examples: `0.1.1` becomes `0.1.2`; `0.1.10` becomes `0.2.0`.

## Line Separators
- Maintain the existing line-separator style of every touched file.
- Default to CRLF line separators for new files.

## Line Endings
- Maintain the existing line-ending style of every touched file.
- Default to CRLF for new files.
