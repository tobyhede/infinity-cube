# 08 — Port classification, outages and start-up on PostgreSQL

**Status:** ready-for-agent once 05 lands

**Blocked by:** 03, 05.

**What to build:** Rust ports of the 26 names `case-map.md` assigns here, 61 runs once each value is counted: `test/unit/postgres-unreachable.test.ts` (9), `test/integration/postgres-misconfiguration.test.ts` (3, under a `describe.each` over `28P01` and `3D000`), the `postgresSqlStore.isUnavailable` describe of `test/unit/sql-connection-failure.test.ts` (12, among them `:98` over twelve SQLSTATEs and `:144` over six socket codes) and the PostgreSQL describe of `test/unit/database-startup.test.ts` (2). Each value gets its own port; `EAI_AGAIN` is the accepted difference (Q5).

- [ ] A Rust stand-in server, as `test/support/refusing-postgres-server.ts` is in TypeScript: it refuses connections, closes one mid-conversation with a FIN and with an RST, or answers the startup handshake with a chosen SQLSTATE (`28P01`, `3D000`, `53300`, `57P03`), so the cases run against the real driver and pool, not a hand-built error value.
- [ ] Each case asserts the repository's answer and, where TypeScript does, the HTTP status through `Application` (503 `persistence-unavailable` for a refused connection, 500 `internal-error` for a wrong password, `postgres-unreachable.test.ts:243,255`); a refused connection answers within the pool's acquire timeout plus a margin (Q8).
- [ ] "reaches the database on the next read rather than repeating the first failure" (`:133`) against a server that resets the first connection and serves the next.
- [ ] The cause-chain cases (`sql-connection-failure.test.ts:162`, `:175`) are ported as what they guard in Rust: a `40001` or `40P01` raised at `COMMIT`, and one behind a failed rollback, are still classified by SQLSTATE.
- [ ] Start-up over PostgreSQL: a wrong password stops after the confirming retry (`database-startup.test.ts:455`); too many connections keeps waiting past the confirming limit (`:477`); an unmigrated database stops as Q6 decides.
- [ ] Rust tests pin the resolver difference (Q5) and `\u0000` answering unclassified by `22P05` (Q11).

**Named mutants (each killed by this ticket's tests):** a refused connection classified unclassified; a connection closed mid-conversation (`UnexpectedEof`) classified unclassified; a wrong password classified unavailable; start-up counting `53300` toward giving up; start-up not stopping on a confirmed `28P01`; a classification that reads the message instead of the code (port of `:179`, a code named only in prose); `COMMIT`-time `40001` left unclassified.
