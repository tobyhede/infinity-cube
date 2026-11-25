# Case map: TypeScript PostgreSQL cases and the ticket that ports each

Generated at `fdb63a1` by `node .scratch/rust-postgresql-store/case-map.mjs <files>` (the `it` calls of each file, named as `test/unit/http-conformance-rust-ports.test.ts` names them), then assigned by hand. 03's pending exemptions are this table. Three contract names run for two values each (the loops at `repository-contract.ts:530`, `:889` and `:2444`), so the contract's 73 names are 76 runs; each value gets its own port, `// Case: <name> (<value>)`.

`database-startup.test.ts` and `sql-connection-failure.test.ts` are listed whole so a reader sees what the PostgreSQL adapter leaves to the SQLite plan.

## `test/support/repository-contract.ts`

| Line | Case | Ticket |
| --- | --- | --- |
| 485 | preserves the established aggregate across a fresh repository host | 02 (table), 06 (on PostgreSQL) |
| 498 | persists first-working-load initialization for a fresh repository host | 02 (table), 06 (on PostgreSQL) |
| 530 | replaces * stored state through the destructive lifecycle door | 02 (table), 06 (on PostgreSQL) |
| 562 | names a broken stored document broken stored state on the single-Space fast path, and leaves loadSpace's answer narrower | 02 (table), 06 (on PostgreSQL) |
| 577 | truncates stored Spaces without a Meta identity only when none was expected | 02 (table), 06 (on PostgreSQL) |
| 597 | initializes and replaces only through explicit Meta-rooted aggregates | 02 (table), 06 (on PostgreSQL) |
| 630 | classifies canonical and different initialization proposals | 02 (table), 06 (on PostgreSQL) |
| 656 | refuses a replacement proposal naming a Meta Space it does not hold | 02 (table), 06 (on PostgreSQL) |
| 677 | ignores object-key insertion order when classifying initialization | 02 (table), 06 (on PostgreSQL) |
| 709 | lets only one different concurrent initialization establish state | 02 (table), 06 (on PostgreSQL) |
| 725 | rolls back a refused replacement | 02 (table), 06 (on PostgreSQL) |
| 742 | refuses replacement before initialization | 02 (table), 06 (on PostgreSQL) |
| 754 | reads the stored Meta identity as each lifecycle door leaves it | 02 (table), 06 (on PostgreSQL) |
| 770 | refuses a replacement expecting no Meta identity where one is stored | 02 (table), 06 (on PostgreSQL) |
| 785 | refuses a replacement authorized against a superseded Meta identity | 02 (table), 06 (on PostgreSQL) |
| 816 | refuses to record an exported revision for a Space it does not store | 02 (table), 06 (on PostgreSQL) |
| 824 | refuses an aggregate that repeats a Space identity, storing none of it | 02 (table), 06 (on PostgreSQL) |
| 849 | refuses an aggregate that repeats a Resource identity, storing none of it | 02 (table), 06 (on PostgreSQL) |
| 889 | refuses a replacement that repeats a * identity, keeping the stored aggregate | 02 (table), 06 (on PostgreSQL) |
| 909 | refuses an initialization that fails domain intake, storing none of it | 02 (table), 06 (on PostgreSQL) |
| 930 | replaces everything stored, freeing the Resource ids it clears | 02 (table), 06 (on PostgreSQL) |
| 954 | raises an identifiable invariant failure for a stored Space whose revision is not canonical | 02 (table), 06 (on PostgreSQL) |
| 970 | becomes committable from an empty store | 02 (table), 06 (on PostgreSQL) |
| 993 | stores and reloads an Image Resource unchanged | 02 (table), 06 (on PostgreSQL) |
| 1043 | stores and reloads an Ur Resource and a Reference Resource to it unchanged | 02 (table), 06 (on PostgreSQL) |
| 1079 | stores, renames and reloads a Resource whose plugin is missing unchanged | 02 (table), 06 (on PostgreSQL) |
| 1137 | carries a Resource whose plugin is missing through Import and Export byte-identical | 02 (table), 06 (on PostgreSQL) |
| 1235 | hands a Resource whose plugin is missing to that plugin when it returns | 02 (table), 06 (on PostgreSQL) |
| 1325 | refuses a topology-preserving update when stored Spaces have no Meta identity | 02 (table), 06 (on PostgreSQL) |
| 1340 | stores an initialized Space, then lists, loads and commits it | 02 (table), 06 (on PostgreSQL) |
| 1366 | keeps an Edge's Title and hidden flag through initialization, commit and load | 02 (table), 06 (on PostgreSQL) |
| 1403 | keeps a Graph's head shape through initialization, commit and load | 02 (table), 06 (on PostgreSQL) |
| 1440 | keeps every Resource's Map content through initialization, commit and load | 02 (table), 06 (on PostgreSQL) |
| 1503 | keeps every Resource through a topology-preserving commit's own delete | 02 (table), 06 (on PostgreSQL) |
| 1522 | refuses to create a new unreachable Space by removing its last reference alone | 02 (table), 06 (on PostgreSQL) |
| 1544 | atomically creates, links, reads, converges on, and deletes a Space | 02 (table), 06 (on PostgreSQL) |
| 1645 | refuses an authored commit that deletes the Meta Space | 02 (table), 06 (on PostgreSQL) |
| 1668 | keeps each Space Resource's own selection across a later default Map change | 02 (table), 06 (on PostgreSQL) |
| 1787 | reports every conflict and rolls back every refused aggregate | 02 (table), 06 (on PostgreSQL) |
| 1823 | answers a stale expected revision with the current aggregate | 02 (table), 06 (on PostgreSQL) |
| 1838 | refuses a commit that fails domain intake and stores nothing | 02 (table), 06 (on PostgreSQL) |
| 1851 | refuses a commit for a Space it does not store | 02 (table), 06 (on PostgreSQL) |
| 1863 | refuses a commit whose Space id differs from its snapshot id | 02 (table), 06 (on PostgreSQL) |
| 1884 | refuses an update whose snapshot names another stored Space at a matching revision | 02 (table), 06 (on PostgreSQL) |
| 1916 | places a single update's failed intake at its Space's position in the aggregate | 02 (table), 06 (on PostgreSQL) |
| 1949 | refuses a commit that names one Space more than once | 02 (table), 06 (on PostgreSQL) |
| 1976 | refuses a commit claiming a Resource another Space owns | 02 (table), 06 (on PostgreSQL) |
| 2001 | scopes Graph identities to their containing Space | 02 (table), 06 (on PostgreSQL) |
| 2029 | refuses an unreferenced ordinary Space even when its Graph identity is reused | 02 (table), 06 (on PostgreSQL) |
| 2044 | permits a Graph and Resource to share an identity | 02 (table), 06 (on PostgreSQL) |
| 2055 | refuses two Maps in one Space that own the same Graph identity | 02 (table), 06 (on PostgreSQL) |
| 2086 | keeps the Resources a commit names and drops the ones it omits | 02 (table), 06 (on PostgreSQL) |
| 2099 | drops every Resource when a commit omits them all | 02 (table), 06 (on PostgreSQL) |
| 2123 | returns a Space's Resources in ascending id order however they were supplied | 02 (table), 06 (on PostgreSQL) |
| 2151 | records an exported revision and carries it across later commits | 02 (table), 06 (on PostgreSQL) |
| 2166 | refuses to mark an exported revision above the storage ceiling | 02 (table), 06 (on PostgreSQL) |
| 2178 | stores and commits a revision above Number.MAX_SAFE_INTEGER as canonical decimal text | 02 (table), 06 (on PostgreSQL) |
| 2208 | refuses to store a revision above the 2^63-1 ceiling | 02 (table), 06 (on PostgreSQL) |
| 2227 | raises an identifiable invariant failure for a stored Space whose revision exceeds the 2^63-1 ceiling | 02 (table), 06 (on PostgreSQL) |
| 2243 | raises an identifiable invariant failure for a commit whose fast-path candidate has a non-canonical stored revision | 02 (table), 06 (on PostgreSQL) |
| 2262 | writes only the Resource a topology-preserving commit changed | 02 (table), 06 (on PostgreSQL) |
| 2295 | writes only the new and changed Resources on the complete-aggregate path | 02 (table), 06 (on PostgreSQL) |
| 2332 | writes no Resource for a commit at a stale revision | 02 (table), 06 (on PostgreSQL) |
| 2382 | moves an unchanged Resource between Spaces in one commit | 02 (table), 06 (on PostgreSQL) |
| 2397 | writes a moved Resource through the ownership check, which refuses it before its Space releases it | exempt: change order (accepted difference, #528) |
| 2444 | stores a * commit's whole snapshot over Resource rows recreated before its row lock | 02 (table), 06 (on PostgreSQL) |
| 2477 | stores an asset of any type and loads its bytes and media type unchanged | 02 (table), 06 (on PostgreSQL) |
| 2511 | holds a Markdown Resource decoded from its file, and its text, as the same value | 02 (table), 06 (on PostgreSQL) |
| 2545 | stores the same bytes once, keeping the first media type | 02 (table), 06 (on PostgreSQL) |
| 2557 | answers an asset it does not store as absent | 02 (table), 06 (on PostgreSQL) |
| 2564 | holds the asset of zero bytes already, under the type it always has | 02 (table), 06 (on PostgreSQL) |
| 2574 | keeps stored assets outside the aggregate its lifecycle doors replace | 02 (table), 06 (on PostgreSQL) |
| 2590 | keeps a stored asset across a fresh repository host | 02 (table), 06 (on PostgreSQL) |

## `test/integration/postgres-space-repository.test.ts`

| Line | Case | Ticket |
| --- | --- | --- |
| 287 | refuses a write of text that is not JSON into spaces.document | 07 |
| 317 | settles two overlapping truncations of Spaces stored without Meta as results | 07 |
| 375 | classifies initialization when a concurrent winner takes a shared Resource identity | 07 |
| 416 | conflicts when an authored commit wins after replacement reads its baseline | 07 |
| 475 | conflicts the loser when two replacements overlap on the Meta row lock | 07 |
| 535 | conflicts a replacement authorized against an identity a concurrent replacement retired | 07 |
| 604 | judges a complete-aggregate commit against an identity a concurrent replacement retired | 07 |
| 725 | rolls back an earlier row's relock placeholder when a later row in the same replacement conflicts | 07 |
| 765 | prevents direct deletion of the Meta Space while repository state names it | 07 |
| 778 | commits a topology-preserving edit without waiting for the repository singleton lock | 07 |
| 812 | refuses an unlocked single-Space write whose row moved after it read the revision | 07 |
| 855 | refuses a multi-Space write whose row moved after the conflict check read it | 07 |
| 947 | serializes concurrent topology commits so the loser observes the complete winner | 07 |

## `test/integration/postgres-aggregate-initialization.test.ts`

| Line | Case | Ticket |
| --- | --- | --- |
| 124 | preserves the successful proposal when another initializer already read an empty aggregate | 07 |
| 142 | does not replace a concurrent first aggregate using an absent expected Meta identity | 07 |
| 157 | reads a consistent uninitialized aggregate while another runtime initializes it | 07 |
| 169 | judges a complete-aggregate commit against the aggregate a concurrent initializer establishes | 07 |
| 194 | initializes without losing integrity after $boundary with $expected competing proposal | 07 |

## `test/integration/postgres-misconfiguration.test.ts`

| Line | Case | Ticket |
| --- | --- | --- |
| 69 | leaves the transactional aggregate read unclassified with the raw handshake refusal | 08 |
| 82 | leaves a direct read unclassified with the normalised refusal | 08 |
| 101 | gives up once a second attempt confirms the refusal | 08 |

## `test/integration/prisma-postgres.test.ts`

| Line | Case | Ticket |
| --- | --- | --- |
| 13 | writes and reads a typed space document with its resource | 05 |
| 49 | advances updatedAt when a space is updated | 05 |

## `test/unit/postgres-unreachable.test.ts`

| Line | Case | Ticket |
| --- | --- | --- |
| 69 | names the aggregate read unavailable, keeping the driver error on cause | 08 |
| 76 | names a commit unavailable | 08 |
| 94 | names establishment unavailable | 08 |
| 109 | names %s unavailable, keeping the refusal on the cause chain | 08 |
| 133 | reaches the database on the next read rather than repeating the first failure | 08 |
| 194 | leaves SQLSTATE %s unclassified inside and outside a transaction | 08 |
| 214 | names SQLSTATE %s unavailable inside and outside a transaction | 08 |
| 243 | answers a refused connection on a direct read 503 persistence-unavailable | 08 |
| 255 | answers a wrong password on a direct read 500 internal-error | 08 |

## `test/unit/postgres-aggregate-lock-key.test.ts`

| Line | Case | Ticket |
| --- | --- | --- |
| 16 | is the same key in the exclusive and the shared mode | 07 |

## `test/unit/prisma-postgres-env-path.test.ts`

| Line | Case | Ticket |
| --- | --- | --- |
| 29 | names the root .env from the bundled runtime and from the source alike | exempt: environment only (Q7) |
| 45 | prefers the nearest .env above the starting directory | exempt: environment only (Q7) |
| 55 | answers undefined rather than a path no file sits at | exempt: environment only (Q7) |
| 67 | starts from this module’s own directory when given no starting point | exempt: environment only (Q7) |

## `test/support/fast-path-races.ts`

| Line | Case | Ticket |
| --- | --- | --- |
| 294 | commits a Map-internal Edit under the shared aggregate lock only | 12 |
| 311 | serialises a Map-internal Edit that read first before a Graph deletion that reads after | 12 |
| 340 | serialises a Graph deletion that read first before a Map-internal Edit that reads after | 12 |
| 373 | keeps a replacement that recreates a Space at revision 0 from landing between a fast-path read and its write | 12 |
| 403 | keeps a Space deletion from passing at a revision a written but uncommitted fast path has moved | 12 |
| 436 | lets Map-internal Edits to different Spaces commit side by side where the store runs commits concurrently | 12 |

## `test/unit/sql-connection-failure.test.ts`

| Line | Case | Ticket |
| --- | --- | --- |
| 70 | recognises %s whatever its transient flag says | 08 |
| 80 | recognises the socket failure %s the driver normalised | 08 |
| 89 | leaves a host name that does not resolve unclassified when the driver normalised it | 08 |
| 98 | recognises SQLSTATE %s on a statement the driver normalised | 08 |
| 105 | names the set ticket 31 records | 08 |
| 126 | recognises SQLSTATE %s raised while connecting | 08 |
| 134 | leaves SQLSTATE %s raised while connecting unclassified | 08 |
| 144 | recognises the socket failure %s | 08 |
| 153 | leaves the error code %s unclassified | 08 |
| 162 | walks the cause chain to %s | 08 |
| 175 | terminates on a cyclic cause chain | 08 |
| 179 | leaves a defect, an unknown code and a code named only in prose unclassified | 08 |
| 207 | recognises %s | not in the PostgreSQL adapter (SQLite half; #528) |
| 219 | recognises the error the pinned runtime raises for a closed client | not in the PostgreSQL adapter (SQLite half; #528) |
| 231 | terminates on a cyclic cause chain | not in the PostgreSQL adapter (SQLite half; #528) |
| 235 | leaves unrelated plain errors unclassified | not in the PostgreSQL adapter (SQLite half; #528) |

## `test/unit/database-startup.test.ts`

| Line | Case | Ticket |
| --- | --- | --- |
| 73 | mints one complete Meta Space through the injected identity source | not in the PostgreSQL adapter (store-independent; #528 09 ports it once) |
| 121 | initializes an uninitialized repository from Default Content | not in the PostgreSQL adapter (store-independent; #528 09 ports it once) |
| 136 | answers the stored Meta identity without reseeding an initialized repository | not in the PostgreSQL adapter (store-independent; #528 09 ports it once) |
| 153 | fails explicitly on stored Spaces that no Meta identity names | not in the PostgreSQL adapter (store-independent; #528 09 ports it once) |
| 220 | establishes the Meta Space once the database comes back | not in the PostgreSQL adapter (store-independent; #528 09 ports it once) |
| 241 | backs off, up to a bound it then holds | not in the PostgreSQL adapter (store-independent; #528 09 ports it once) |
| 268 | keeps trying through forty unreachable attempts | not in the PostgreSQL adapter (store-independent; #528 09 ports it once) |
| 281 | stops at contradictory stored state that a second read confirms | not in the PostgreSQL adapter (store-independent; #528 09 ports it once) |
| 304 | keeps trying through one invariant failure the next read does not repeat | not in the PostgreSQL adapter (store-independent; #528 09 ports it once) |
| 325 | stops at a failure it cannot classify once a second attempt confirms it | not in the PostgreSQL adapter (store-independent; #528 09 ports it once) |
| 340 | keeps trying through one failure it cannot classify | not in the PostgreSQL adapter (store-independent; #528 09 ports it once) |
| 355 | counts unclassified and invariant failures together, and an outage resets them | not in the PostgreSQL adapter (store-independent; #528 09 ports it once) |
| 373 | counts invariant failures consecutively, so an outage between them resets | not in the PostgreSQL adapter (store-independent; #528 09 ports it once) |
| 396 | stops at once when Default Content is not a valid aggregate | not in the PostgreSQL adapter (store-independent; #528 09 ports it once) |
| 421 | survives a reporter that throws | not in the PostgreSQL adapter (store-independent; #528 09 ports it once) |
| 455 | gives up on a wrong password once a second attempt confirms it | 08 |
| 477 | keeps waiting out too many connections past the confirming limit | 08 |
