# Benchmarks

Measured with the self-test (`KS_FORGE_SELFTEST=1`, see CLAUDE.md) on a release build. Only numbers recorded here may be quoted.

| Date | Version | Machine | Start-up to first prompt | 1,000,000 lines (`seq 1 1000000`) | App size |
|---|---|---|---|---|---|
| 2026-11-24 | dev build before v0.1.0 | Apple-silicon Mac, macOS 27, zsh with the owner's own startup files | 937 ms cold, 428–434 ms warm | 3.1–3.3 s, WebGL renderer | 8.5 MB (.app) |

- Start-up is from the process start to the shell's first prompt report (OSC 7), so it includes the shell's own start-up.
- The line count is measured until the line after the output appears on screen; the self-test reads the screen every 100 ms, so the real time is a little lower.
- **Not yet measured:** typing latency, Windows numbers, and the same tests in the system terminal for comparison. Until then no "faster than" claim is made.
