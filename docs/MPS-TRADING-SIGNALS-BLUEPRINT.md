# MPS Trading Signals — Blueprint (approval before implementation)

**Status:** Blueprint only. No bot, production endpoint, database, token, or Telegram behavior is changed by this document.

## 1. Confirmed requirements

- Four existing Python bots run on Android Termux.
- Known files: `bot_smc.py`, `news_bot.py`, and `scalp_new.py`. The fourth bot filename is not yet known.
- Existing Termux control scripts include `mulai.sh`, `berhenti.sh`, and likely `jaga.sh`; inspect them before making any change.
- Add a member-only **Trading Signals** area to the MPS website.
- Each bot sends its signal directly to the MPS backend over HTTPS. The website must not scrape or parse Telegram messages to reconstruct signals.
- Store signal data in a separate database, not in the member-registration spreadsheet and not in the Market Pulse dataset.
- Preserve the bots' current analysis and Telegram-send behavior. The website integration is an additional delivery path from the bot's structured signal event.
- Test with an isolated TEST backend/database and test credentials first. Never request or paste bot tokens, passwords, or API keys into chat. No production changes before successful testing and explicit release authorization.

## 2. Proposed architecture

```text
Termux Bot 01 ─┐
Termux Bot 02 ─┼─ HTTPS JSON + per-bot authentication ─> MPS Apps Script API
Termux Bot 03 ─┤                                      │
Termux Bot 04 ─┘                                      ├─ Separate MPS Trading Signals DB
                                                       ├─ Append-only event history
                                                       └─ Member-only read API
                                                              │
                                                              └─ MPS Trading Signals page
```

The bot creates one structured event and sends that same event to the MPS backend. The existing Telegram notification remains intact; Telegram is not used as the website's data source. The backend authenticates the originating bot, validates the payload, applies idempotency and status-transition rules, then records the event.

## 3. Bot identity and credentials

Use stable internal IDs `BOT_01` through `BOT_04` until the four actual bot names are confirmed. Display names can later be mapped without changing signal ownership or history.

- Each bot receives its own secret, stored only in Apps Script Script Properties (or another approved secret store).
- Never store secrets in the spreadsheet, frontend HTML, Git repository, bot logs, or Telegram messages.
- Compare secrets in constant time; apply per-bot rate limits and request replay protection.
- The fourth bot identity remains a configuration placeholder; do not guess its filename or strategy.

## 4. Proposed event contract

Required fields for a new signal:

| Field | Meaning |
|---|---|
| `event_id` | Unique ID for each delivery attempt/event; supports idempotency |
| `signal_id` | Stable ID for the full signal lifecycle |
| `bot_id` | `BOT_01`–`BOT_04` |
| `event_type` | `CREATE` or `UPDATE` |
| `instrument` | Instrument, e.g. XAUUSD or EURUSD |
| `side` | BUY or SELL |
| `timeframe` | Bot timeframe, e.g. M5, M15, H1 |
| `entry` | Entry price |
| `stop_loss` | Stop-loss price |
| `take_profit_1` | First target |
| `take_profit_2` | Second target |
| `status` | ACTIVE, TP HIT, SL HIT, or TIMEOUT |
| `signal_time` | Signal creation time with explicit timezone |

Validation should reject non-finite/non-positive prices, malformed IDs, unsupported status values, impossible BUY/SELL SL/TP ordering, unauthorized bot ownership, and invalid state transitions. Repeated `event_id` values must return the original result without appending a duplicate.

For an UPDATE, the backend must confirm that the signal belongs to the same bot and that the prior status permits the requested transition. Terminal signals cannot be reopened by an ordinary update; a corrected signal should receive a new `signal_id`.

## 5. Separate database layout

Use a dedicated spreadsheet configured through a separate Script Property such as `MPS_TRADING_SIGNALS_SPREADSHEET_ID`. Do not reuse `MPS_SPREADSHEET_ID`.

Proposed tabs:

1. **Signals** — latest/current state, one row per `signal_id`.
2. **Signal Events** — append-only event history, including event ID, bot ID, prior/new status, received time, and a payload fingerprint. Do not store bot secrets.
3. **Bot Registry** — bot ID, display name, enabled/disabled state, and allowed instruments/timeframes. Secret values stay outside the sheet.

The database file and tabs must be private. The backend should fail closed if the configured spreadsheet or its Drive ACL is not private or if headers do not match the expected schema.

## 6. Website experience

The public site may show a static **Member Only** preview. Actual signal data is available only through a backend API that calls the existing member authorization gate and checks that registration and deposit status are approved.

Member view:
- Active signals with bot identity, instrument, BUY/SELL, timeframe, entry, SL, TP1, TP2, current status, and signal time.
- Historical signals and status changes.
- Aggregate statistics, computed from stored events rather than values supplied by a bot.
- Filters by bot, instrument, timeframe, and status.
- Automatic refresh with a visible last-updated time; no public data endpoint.

Admin view:
- Bot enabled/disabled state and last-seen/last-event time.
- Signal ingestion errors, duplicate/replay counts, and database health.
- No display of secret values.

## 7. Market Outlook sessions

The agreed session set is:
- Asia — `Asia/Tokyo`
- London/Europe — `Europe/London`
- America/New York — `America/New_York`

Display each center's local time and a WIB comparison, OPEN/CLOSED state, countdown to the next open/close, and London–New York overlap. Use IANA time zones so London and New York DST changes are automatic; Tokyo does not observe DST.

**Open decision before implementation:** exact local opening/closing hours for the three sessions were not specified. Do not hardcode hours until the schedule is approved.

## 8. Termux integration plan

1. Inspect the four bot files and shell scripts read-only; map existing signal creation and Telegram delivery functions.
2. Add a small shared HTTPS client only after the bot event format is approved. It must not alter the analysis engine or remove Telegram sending.
3. Use a local retry/outbox mechanism with exponential backoff and stable event IDs so temporary network failures do not lose signals or create duplicates.
4. Keep credentials out of source files and logs; read per-bot secrets from private Termux configuration.
5. Test one bot in TEST first, then all four, then status updates, duplicate delivery, timeout/retry, and backend outage scenarios.

## 9. Test and release gates

- Unit tests: schema validation, price ordering, event idempotency, status transitions, bot ownership, rate limits, and replay protection.
- Integration tests: all four bots → TEST API → separate TEST database → member-only TEST page.
- Negative tests: missing/wrong token, disabled bot, expired/replayed event, wrong bot updating another bot's signal, malformed payload, and direct unauthenticated page/API access.
- Verify Telegram delivery remains unchanged and no signal is reconstructed from Telegram.
- Android/Termux test: start, stop, restart, network interruption, app/background behavior, and duplicate process prevention.
- Production activation requires explicit approval after all TEST gates pass. No secrets or production database changes are part of this blueprint.

## 10. Optional enhancements — not yet approved as requirements

The following may be considered after the core pipeline works: RR display, signal grade, multi-timeframe analysis (4H/1H/15M), SND/FVG/SNR tags, candle confirmation, market bias, Plans A/B/C, and richer analytics. Keep these optional until the user confirms them; they must not delay or alter the core bot-to-backend pipeline.
