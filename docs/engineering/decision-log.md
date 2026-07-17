# Decision Log

Append-only record of dated, non-obvious engineering decisions.

## 2026-07-16 — Share one token authority across Shell CSS and GJS

The primitive catalog packages `design/system/tokens.json` for runtime drawing and
geometry, and generates its Shell stylesheet from the same manifest. A pure
validation module is shared by the renderer, unit tests, and extension startup so a
missing or malformed role fails closed instead of silently falling back to a second
value source.

GNOME Shell CSS cannot provide the GJS drawing code with a portable shared custom-
property mechanism. Generation keeps the approved literals reviewable while the
gate prevents the template, output, and runtime values from diverging.

## 2026-07-17 — Start the production shell at a fixed five-minute cadence

`claudex-usage@hugo.local` is the SURF-002 production UUID. While any registered
provider is eligible, its surface refreshes immediately and then schedules one shared
cycle five minutes after the prior cycle completes. A fixed default keeps this shell
provider-neutral and avoids persistence until SURF-003 introduces the accepted
user-facing cadence choice.
