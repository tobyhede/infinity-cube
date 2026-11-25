# 08 — Port classification, outages and start-up on PostgreSQL

**Status:** ready-for-agent once 05 lands

**Blocked by:** 03, 05; #528's 09 (the store-independent start-up branches, ported once on the scripted store).

**What to build:** Rust ports of the 26 cases `case-map.md` assigns here: `test/unit/postgres-unreachable.test.ts` (9), `test/integration/postgres-misconfiguration.test.ts` (3), the `postgresSqlStore.isUnavailable` describe of `test/unit/sql-connection-failure.test.ts` (12) and the PostgreSQL describe of `test/unit/database-startup.test.ts` (2). Each `%s` case is ported per value.

- [ ] A Rust stand-in server, as `test/support/refusing-postgres-server.ts` is in TypeScript: it refuses connections, resets one mid-conversation, or answers the startup handshake with a chosen SQLSTATE (`28P01`, `3D000`, `53300`, `57P03`), so the classification cases run against the real driver, not a hand-built error value.
- [ ] Each case asserts the repository's answer and, where TypeScript does, the HTTP status through `Application` (503 `persistence-unavailable` for a refused connection, 500 `internal-error` for a wrong password, `postgres-unreachable.test.ts:243,255`).
- [ ] "reaches the database on the next read rather than repeating the first failure" (`:133`) is ported against a server that resets the first connection and serves the next.
- [ ] Start-up over PostgreSQL: a wrong password stops after the confirming retry (`database-startup.test.ts:455`); too many connections keeps waiting past the confirming limit (`:477`); an unmigrated database stops as Q6 decides.
- [ ] The cases about JavaScript cause chains ("walks the cause chain to %s", "terminates on a cyclic cause chain", `sql-connection-failure.test.ts:162,175`) are ported as what they guard in Rust (an error wrapped by the driver, e.g. a `40001` raised at `COMMIT`, is still classified by its SQLSTATE) or exempt as does not apply with that reason, decided in the PR.
- [ ] The resolver difference (Q5) and `\u0000` (Q11) each have a Rust test pinning Rust's answer.

**Named mutants:** a refused connection classified unclassified; a wrong password classified unavailable; start-up counting `53300` toward giving up; start-up not stopping on a confirmed `28P01`; a classification that reads the error's message instead of its code.
