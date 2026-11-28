# Evidence

What produced `case-map.md` and `mutants.md`, kept as Markdown because `.gitignore` keeps runnable files under `.scratch/` untracked. To run a script, copy each into a file named as its heading says, all in one directory, and run it from the repository root.

## Unmutated run of every PostgreSQL test, at `32d316f3`

```text
     Summary [  52.925s] 403 tests run: 403 passed, 62 skipped
```

## Each mutant's run

Id, verdict, nextest summary line, and up to twelve failing tests.

```text
A01	KILLED	Summary [  60.421s] 403 tests run: 401 passed, 2 failed, 62 skipped	FAIL [   1.265s] host::postgres_concurrency given_overlapping_replacements::conflicts_a_replacement_authorized_against_an_identity_a_concurrent_replacement_retired | FAIL [  30.296s] host::postgres_concurrency given_overlapping_replacements::judges_a_complete_aggregate_commit_against_an_identity_a_concurrent_replacement_retired
A02	SURVIVED	Summary [  57.394s] 403 tests run: 403 passed, 62 skipped	
A03	KILLED	Summary [  53.242s] 403 tests run: 400 passed, 3 failed, 62 skipped	FAIL [   0.391s] host::postgres_concurrency given_overlapping_replacements::rolls_back_an_earlier_rows_relock_when_a_later_row_in_the_same_replacement_conflicts | FAIL [   0.399s] host::postgres_concurrency given_a_writer_outside_the_lock::refuses_a_multi_space_write_whose_row_moved_after_the_conflict_check_read_it | FAIL [   0.414s] host::postgres_concurrency given_overlapping_replacements::conflicts_when_an_authored_commit_wins_after_replacement_reads_its_baseline
A04	KILLED	Summary [  53.369s] 403 tests run: 402 passed, 1 failed, 62 skipped	FAIL [   0.376s] host::postgres_concurrency given_a_writer_outside_the_lock::conflicts_a_stale_single_space_edit_with_the_space_and_resources_of_one_stored_state
A05	SURVIVED	Summary [  53.093s] 403 tests run: 403 passed, 62 skipped	
A06	SURVIVED	Summary [  52.718s] 403 tests run: 403 passed, 62 skipped	
A07	KILLED	Summary [ 721.765s] 189/403 tests run: 177 passed, 4 failed, 8 timed out, 62 skipped	TIMEOUT [ 240.008s] host::postgres contract::commits::answers_a_stale_revision_on_the_aggregate_path_as_a_conflict | TIMEOUT [ 240.008s] host::postgres contract::commits::drops_every_resource_when_a_commit_omits_them_all | TIMEOUT [ 240.008s] host::postgres contract::commits::refuses_a_commit_claiming_a_resource_another_space_owns | TIMEOUT [ 240.008s] host::postgres contract::commits::refuses_a_commit_failing_domain_intake_storing_nothing | TIMEOUT [ 240.010s] host::postgres contract::commits::refuses_to_create_an_unreachable_space_by_removing_its_last_reference | TIMEOUT [ 240.011s] host::postgres contract::broken::refuses_an_update_when_stored_spaces_have_no_meta_identity | TIMEOUT [ 240.012s] host::postgres contract::commits::keeps_the_resources_a_commit_names_and_drops_the_rest | TIMEOUT [ 240.012s] host::postgres contract::commits::places_a_single_updates_failed_intake_at_its_position
A08	KILLED	Summary [ 655.132s] 244/403 tests run: 200 passed, 4 failed, 40 timed out, 62 skipped	TIMEOUT [  60.004s] host::postgres contract::assets::holds_a_markdown_resource_from_its_file_and_its_text_as_one_value | TIMEOUT [  60.004s] host::postgres contract::commits::keeps_the_resources_a_commit_names_and_drops_the_rest | TIMEOUT [  60.004s] host::postgres contract::commits::places_a_single_updates_failed_intake_at_its_position | TIMEOUT [  60.004s] host::postgres_concurrency given_a_writer_outside_the_lock::classifies_initialization_when_a_concurrent_winner_takes_a_shared_resource_identity | TIMEOUT [  60.005s] host::postgres contract::broken::replaces_an_invalid_aggregate | TIMEOUT [  60.005s] host::postgres contract::broken::replaces_an_invalid_space_document | TIMEOUT [  60.005s] host::postgres contract::commits::answers_a_stale_revision_on_the_aggregate_path_as_a_conflict | TIMEOUT [  60.005s] host::postgres contract::commits::atomically_creates_links_reads_converges_on_and_deletes_a_space | TIMEOUT [  60.005s] host::postgres contract::commits::refuses_a_commit_failing_domain_intake_storing_nothing | TIMEOUT [  60.005s] host::postgres contract::commits::stores_and_commits_a_revision_above_the_largest_safe_integer | TIMEOUT [  60.005s] host::postgres contract::lifecycle::persists_first_working_load_initialization_for_a_fresh_host | TIMEOUT [  60.005s] host::postgres given_a_row_changed_outside_the_decision::fails_a_created_space_whose_resource_jsonb_refuses_unclassified
A09	SURVIVED	Summary [  54.767s] 403 tests run: 403 passed, 62 skipped	
A10	KILLED	Summary [  52.626s] 403 tests run: 402 passed, 1 failed, 62 skipped	FAIL [   0.043s] host sql::tests::races::a_meta_row_moved_twice_is_unreachable
A11	KILLED	Summary [  60.136s] 403 tests run: 401 passed, 2 failed, 62 skipped	FAIL [   0.305s] host::postgres contract::broken::truncates_spaces_without_a_meta_identity_only_when_none_was_expected | FAIL [  30.307s] host::postgres_concurrency given_overlapping_replacements::settles_two_overlapping_truncations_of_spaces_stored_without_meta_as_results
A12	KILLED	Summary [  51.605s] 403 tests run: 401 passed, 2 failed, 62 skipped	FAIL [   0.037s] host sql::tests::statement_order::load_aggregate_and_both_lifecycle_doors_take_the_exclusive_lock | FAIL [   0.426s] host::postgres_concurrency given_the_lock_key::is_the_same_key_in_the_exclusive_and_the_shared_mode
A13	KILLED	Summary [  51.269s] 403 tests run: 401 passed, 2 failed, 62 skipped	FAIL [   0.037s] host sql::tests::statement_order::the_fast_path_takes_the_shared_lock_before_its_read_and_locks_the_row | FAIL [   0.370s] host::postgres_concurrency given_a_writer_outside_the_lock::conflicts_a_stale_single_space_edit_with_the_space_and_resources_of_one_stored_state
A14	KILLED	Summary [  51.871s] 403 tests run: 402 passed, 1 failed, 62 skipped	FAIL [   0.043s] host sql::tests::statement_order::the_unlocked_operations_take_no_aggregate_lock
A15	KILLED	Summary [  57.050s] 403 tests run: 401 passed, 2 failed, 62 skipped	FAIL [   0.037s] host sql::tests::statement_order::the_unlocked_operations_take_no_aggregate_lock | FAIL [  30.998s] infinity-cube::serve_postgres given_a_database_holding_the_aggregate_lock::stops_within_five_seconds_of_the_first_signal_while_a_request_and_an_operation_stall
A16	KILLED	Summary [ 159.521s] 403 tests run: 398 passed (9 slow), 2 failed, 3 timed out, 62 skipped	FAIL [  30.019s] infinity-cube::serve_postgres given_a_database_that_does_not_answer::announces_and_answers_503_from_a_trimmed_database_url_in_the_nearest_env | FAIL [  30.219s] infinity-cube::serve_postgres given_a_migrated_database_holding_nothing::announces_before_the_database_answers_and_initializes_it_once_it_does | TIMEOUT [  60.007s] host::postgres_outages given_a_server_that_refuses_this_client::names_a_server_starting_up_unavailable_inside_and_outside_a_transaction | TIMEOUT [  60.008s] host::postgres_outages given_a_server_that_refuses_connections::answers_a_refused_connection_on_a_direct_read_503_persistence_unavailable | TIMEOUT [  60.008s] host::postgres_outages given_a_server_that_refuses_this_client::names_too_many_clients_unavailable_inside_and_outside_a_transaction
A17	KILLED	Summary [  51.578s] 403 tests run: 402 passed, 1 failed, 62 skipped	FAIL [   0.051s] host sql::tests::closing::waits_for_an_operation_spawned_but_not_yet_started
A18	KILLED	Summary [  51.296s] 403 tests run: 387 passed, 16 failed, 62 skipped	FAIL [   0.008s] host sql::postgres::tests::classify_a_failure::keeps_the_sqlstate_with_the_words | FAIL [   0.009s] host::postgres_outages given_a_server_that_refuses_this_client::leaves_a_wrong_password_unclassified_inside_and_outside_a_transaction | FAIL [   0.009s] host::postgres_outages given_a_server_that_refuses_this_client::leaves_no_hba_entry_unclassified_inside_and_outside_a_transaction | FAIL [   0.012s] host::postgres_outages given_a_server_that_refuses_this_client::leaves_a_missing_database_unclassified_inside_and_outside_a_transaction | FAIL [   0.014s] host::postgres_outages given_start_up_over_a_server_that_refuses_this_client::gives_up_on_a_wrong_password_once_a_second_attempt_confirms_it | FAIL [   0.019s] host::postgres_outages given_a_server_that_refuses_this_client::answers_an_initialization_it_refuses_without_asking_again | FAIL [   0.039s] host::postgres_outages given_a_real_server_that_refuses_this_client::leaves_a_direct_read_unclassified_given_a_database_that_does_not_exist | FAIL [   0.039s] host::postgres_outages given_a_real_server_that_refuses_this_client::leaves_the_aggregate_read_unclassified_given_a_database_that_does_not_exist | FAIL [   0.188s] host::postgres_outages given_a_real_server_that_refuses_this_client::leaves_the_aggregate_read_unclassified_given_a_wrong_password | FAIL [   0.193s] host::postgres_outages given_a_real_server_that_refuses_this_client::leaves_a_direct_read_unclassified_given_a_wrong_password | FAIL [   0.242s] host::postgres_outages given_a_real_server_that_refuses_this_client::gives_up_once_a_second_attempt_confirms_the_refusal | FAIL [   0.253s] host::postgres given_where_its_tables_are::leaves_a_role_granted_nothing_on_the_tables_unclassified_naming_42501
A19	SURVIVED	Summary [  51.491s] 403 tests run: 403 passed, 62 skipped	
A20	KILLED	Summary [  63.672s] 403 tests run: 402 passed, 1 failed, 62 skipped	FAIL [   0.262s] host::postgres given_a_database_missing_a_table::fails_every_operation_as_broken_naming_the_table
A21	KILLED	Summary [  54.521s] 403 tests run: 400 passed, 3 failed, 62 skipped	FAIL [   0.070s] host sql::tests::races::a_replacement_meeting_a_moved_row_conflicts_with_the_identity_read_afresh | FAIL [   0.369s] host::postgres_concurrency given_overlapping_replacements::rolls_back_an_earlier_rows_relock_when_a_later_row_in_the_same_replacement_conflicts | FAIL [   0.378s] host::postgres_concurrency given_overlapping_replacements::conflicts_when_an_authored_commit_wins_after_replacement_reads_its_baseline
A22	SURVIVED	Summary [  52.046s] 403 tests run: 403 passed, 62 skipped	
A23	SURVIVED	Summary [  51.900s] 403 tests run: 403 passed, 62 skipped	
A24	SURVIVED	Summary [  51.405s] 403 tests run: 403 passed, 62 skipped	
```

## A02 probe

A test written to check whether A02 is equivalent, added for the run to `crates/host/tests/postgres_concurrency.rs` › `given_overlapping_replacements` and deleted afterwards. It is the A01 killer `judges_a_complete_aggregate_commit_against_an_identity_a_concurrent_replacement_retired` with the probe pausing the commit at `Step::MetaRead`, after the identity read and before the relock, instead of an outside session holding the Meta row. It ran on a throwaway PostgreSQL 14.19 cluster, deleted afterwards, at `ec61218f`, whose `crates/` is `32d316f3`'s.

```rust
#[tokio::test]
#[ignore = "needs PostgreSQL: INFINITY_CUBE_POSTGRES_TEST_URL"]
async fn audit_probe_a02_replacement_committed_between_read_and_relock() {
    let database = Fresh::new().await;
    let linked_other = other_space().with(
        RACE_LINK_RESOURCE_ID,
        space_link(
            "To the race child",
            RACE_CHILD_SPACE_ID,
            RACE_CHILD_MAP_ID,
            RACE_CHILD_GRAPH_ID,
        ),
    );
    let race_child = Fixture {
        id: RACE_CHILD_SPACE_ID,
        document: mapped("Race child", RACE_CHILD_MAP_ID, RACE_CHILD_GRAPH_ID),
        resources: vec![],
    };
    let store = seeded(&database, SPACE_ID, &[repository_space()]).await;
    let (reached, release) = pause_once(&store, |step| matches!(step, Step::MetaRead));
    let racing = {
        let (linked_other, race_child) = (linked_other.clone(), race_child.clone());
        spawn(&store, |store| async move {
            store
                .commit(commit(vec![
                    update(&linked_other.titled("Retitled after race"), Revision::FIRST),
                    update(&race_child.titled("Retitled child"), Revision::FIRST),
                ]))
                .await
        })
    };
    let racing = rendezvous(&reached, racing).await;
    let mut blocker = Blocker::begin(&database).await;
    blocker
        .run(&retiring(
            OTHER_SPACE_ID,
            &[linked_other.clone(), race_child.clone()],
        ))
        .await;
    blocker.commit().await;
    release.notify_one();
    let answer = joined(racing).await;
    assert!(
        matches!(answer, Ok(CommitResult::Committed { .. })),
        "judged against the identity the replacement established: {answer:?}"
    );
    store.close().await;
}
```

Unmutated:

```text
PASS [   2.214s] host::postgres_concurrency given_overlapping_replacements::audit_probe_a02_replacement_committed_between_read_and_relock
```

With A02 applied:

```text
FAIL [   1.651s] host::postgres_concurrency given_overlapping_replacements::audit_probe_a02_replacement_committed_between_read_and_relock
judged against the identity the replacement established: Ok(AggregateRefused(CommitRefusal { refusals: [MetaSpaceMissing { meta: SpaceId(11111111-1111-4111-8111-111111111111) }], errors: [Aggregate(MetaSpaceMissing { meta: SpaceId(11111111-1111-4111-8111-111111111111) })] }))
```

## The ports test with every PostgreSQL file listed

A copy of `test/unit/repository-contract-rust-ports.test.ts` whose `POSTGRES.files` (`:820`) also lists `postgres_concurrency.rs`, `postgres_outages.rs`, `postgres_races.rs`, `postgres_url.rs`, `postgres_wire.rs`, `postgres_rows.rs`, `crates/host/src/sql/postgres/tests.rs` and `crates/cli/tests/serve_postgres.rs`, run with `pnpm exec vitest run <copy> -t "the Rust PostgreSQL repository"` and then deleted.

```text

 RUN  v2.1.9 <repository>

 ❯ test/unit/zz-audit-probe-ports.test.ts (72 tests | 2 failed | 42 skipped) 9ms
   × the Rust PostgreSQL repository > marks and exempts only cases and values the lists hold 5ms
     → expected [ …(31) ] to deeply equal []
   × the Rust PostgreSQL repository > exempts no case or value it ports 1ms
     → expected [ …(39) ] to deeply equal []

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  test/unit/zz-audit-probe-ports.test.ts > the Rust PostgreSQL repository > marks and exempts only cases and values the lists hold
AssertionError: expected [ …(31) ] to deeply equal []

- Expected
+ Received

- Array []
+ Array [
+   "initializes without losing integrity after $boundary with $expected competing proposal",
+   "initializes without losing integrity after $boundary with $expected competing proposal",
+   "initializes without losing integrity after $boundary with $expected competing proposal",
+   "names %s unavailable, keeping the refusal on the cause chain",
+   "names %s unavailable, keeping the refusal on the cause chain",
+   "names %s unavailable, keeping the refusal on the cause chain",
+   "names %s unavailable, keeping the refusal on the cause chain",
+   "walks the cause chain to %s",
+   "leaves SQLSTATE %s unclassified inside and outside a transaction",
+   "leaves SQLSTATE %s unclassified inside and outside a transaction",
+   "leaves SQLSTATE %s unclassified inside and outside a transaction",
+   "names SQLSTATE %s unavailable inside and outside a transaction",
+   "names SQLSTATE %s unavailable inside and outside a transaction",
+   "recognises SQLSTATE %s raised while connecting",
+   "recognises SQLSTATE %s raised while connecting",
+   "leaves SQLSTATE %s raised while connecting unclassified",
+   "leaves SQLSTATE %s raised while connecting unclassified",
+   "leaves SQLSTATE %s raised while connecting unclassified",
+   "walks the cause chain to %s",
+   "leaves the transactional aggregate read unclassified with the raw handshake refusal",
+   "leaves the transactional aggregate read unclassified with the raw handshake refusal",
+   "leaves a direct read unclassified with the normalised refusal",
+   "leaves a direct read unclassified with the normalised refusal",
+   "walks the cause chain to %s",
+   "walks the cause chain to %s",
+   "recognises %s whatever its transient flag says",
+   "recognises the socket failure %s the driver normalised",
+   "recognises SQLSTATE %s on a statement the driver normalised",
+   "recognises the socket failure %s",
+   "recognises the socket failure %s",
+   "leaves the error code %s unclassified",
+ ]

 ❯ test/unit/zz-audit-probe-ports.test.ts:963:32
    961| 
    962|   it('marks and exempts only cases and values the lists hold', () => {
    963|     expect(found.unknownMarks).toEqual([]);
       |                                ^
    964|     expect(found.unknownExemptions).toEqual([]);
    965|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  test/unit/zz-audit-probe-ports.test.ts > the Rust PostgreSQL repository > exempts no case or value it ports
AssertionError: expected [ …(39) ] to deeply equal []

- Expected
+ Received

- Array []
+ Array [
+   "refuses a write of text that is not JSON into spaces.document",
+   "settles two overlapping truncations of Spaces stored without Meta as results",
+   "classifies initialization when a concurrent winner takes a shared Resource identity",
+   "conflicts when an authored commit wins after replacement reads its baseline",
+   "conflicts the loser when two replacements overlap on the Meta row lock",
+   "conflicts a replacement authorized against an identity a concurrent replacement retired",
+   "judges a complete-aggregate commit against an identity a concurrent replacement retired",
+   "rolls back an earlier row's relock placeholder when a later row in the same replacement conflicts",
+   "prevents direct deletion of the Meta Space while repository state names it",
+   "commits a topology-preserving edit without waiting for the repository singleton lock",
+   "refuses an unlocked single-Space write whose row moved after it read the revision",
+   "refuses a multi-Space write whose row moved after the conflict check read it",
+   "serializes concurrent topology commits so the loser observes the complete winner",
+   "preserves the successful proposal when another initializer already read an empty aggregate",
+   "does not replace a concurrent first aggregate using an absent expected Meta identity",
+   "reads a consistent uninitialized aggregate while another runtime initializes it",
+   "judges a complete-aggregate commit against the aggregate a concurrent initializer establishes",
+   "gives up once a second attempt confirms the refusal",
+   "names the aggregate read unavailable, keeping the driver error on cause",
+   "names a commit unavailable",
+   "names establishment unavailable",
+   "reaches the database on the next read rather than repeating the first failure",
+   "answers a refused connection on a direct read 503 persistence-unavailable",
+   "answers a wrong password on a direct read 500 internal-error",
+   "is the same key in the exclusive and the shared mode",
+   "prefers the nearest .env above the starting directory",
+   "answers undefined rather than a path no file sits at",
+   "commits a Map-internal Edit under the shared aggregate lock only",
+   "serialises a Map-internal Edit that read first before a Graph deletion that reads after",
+   "serialises a Graph deletion that read first before a Map-internal Edit that reads after",
+   "keeps a replacement that recreates a Space at revision 0 from landing between a fast-path read and its write",
+   "keeps a Space deletion from passing at a revision a written but uncommitted fast path has moved",
+   "lets Map-internal Edits to different Spaces commit side by side where the store runs commits concurrently",
+   "leaves a host name that does not resolve unclassified when the driver normalised it",
+   "names the set ticket 31 records",
+   "terminates on a cyclic cause chain",
+   "leaves a defect, an unknown code and a code named only in prose unclassified",
+   "gives up on a wrong password once a second attempt confirms it",
+   "keeps waiting out too many connections past the confirming limit",
+ ]

 ❯ test/unit/zz-audit-probe-ports.test.ts:968:35
    966| 
    967|   it('exempts no case or value it ports', () => {
    968|     expect(found.exemptAndPorted).toEqual([]);
       |                                   ^
    969|   });
    970| 

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯

 Test Files  1 failed (1)
      Tests  2 failed | 28 passed | 42 skipped (72)
   Start at  14:39:50
   Duration  620ms (transform 74ms, setup 75ms, collect 322ms, tests 9ms, environment 0ms, prepare 45ms)
```

## `cases.mjs`

```js
// Independent case extraction: every it/test call in the given files, with
// its describe chain, written name and line. Prints JSON lines.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(process.cwd() + '/package.json');
const ts = require('typescript');

const text = (node, sf) => {
  if (!node) return '<none>';
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    let s = node.head.text;
    for (const span of node.templateSpans) s += '${' + span.expression.getText(sf) + '}' + span.literal.text;
    return s;
  }
  return '<expr:' + node.getText(sf).slice(0, 60) + '>';
};

const base = (expr) => {
  // it, it.each(...), it.skip, test.concurrent, it.each`...`
  while (true) {
    if (ts.isIdentifier(expr)) return expr.text;
    if (ts.isPropertyAccessExpression(expr)) { expr = expr.expression; continue; }
    if (ts.isCallExpression(expr)) { expr = expr.expression; continue; }
    if (ts.isTaggedTemplateExpression(expr)) { expr = expr.tag; continue; }
    return undefined;
  }
};
const isEach = (expr) => expr.getText().includes('.each');

for (const file of process.argv.slice(2)) {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const chain = [];
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const b = base(node.expression);
      if (b === 'describe' || b === 'it' || b === 'test') {
        const name = text(node.arguments[0], sf);
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        if (b === 'describe') {
          chain.push(name + (isEach(node.expression) ? ' [each]' : ''));
          node.arguments.forEach(visit);
          chain.pop();
          return;
        }
        console.log(JSON.stringify({ file, line, describes: [...chain], name, each: isEach(node.expression) }));
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}
```

## `map.mjs`

```js
// Map each TypeScript case to the Rust tests marking it, across every Rust file.
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const [casesFile] = process.argv.slice(2);
const cases = readFileSync(casesFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));

const files = execSync("git ls-files 'crates/**/*.rs' 'packages/desktop/**/*.rs'", { encoding: 'utf8' })
  .trim()
  .split('\n');
const marks = [];
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const m = line.match(/^\s*\/\/ Case: (.*)$/u);
    if (!m) return;
    let fnLine = i + 1;
    for (let j = i + 1; j < lines.length; j++) {
      const fm = lines[j].match(/\bfn ([a-z0-9_]+)/u) ?? lines[j].match(/^\s*([a-z0-9_]+)\s*(=>|,|\{|\()/u);
      if (fm) { fnLine = j + 1; marks.push({ file, line: fnLine, name: m[1], fn: fm[1] }); return; }
    }
    marks.push({ file, line: i + 1, name: m[1], fn: '?' });
  });
}

const pg = (f) =>
  /crates\/host\/tests\/postgres/u.test(f) ||
  f.includes('serve_postgres') ||
  f.includes('/sql/postgres/') ||
  f.includes('repository_contract/');

const nameOf = (c) =>
  c.file === 'test/support/repository-contract.ts' ? c.name.replace(/^\$\{name\} /u, '').replace(/\$\{[^}]+\}/gu, '*') : c.name;

const out = cases.map((c) => {
  const name = nameOf(c);
  const hits = marks.filter((m) => m.name === name || m.name.startsWith(name + ' ('));
  return {
    file: c.file,
    line: c.line,
    describe: c.describes.join(' > '),
    name,
    each: c.each || c.describes.some((d) => d.endsWith('[each]')),
    pg: hits.filter((h) => pg(h.file)).map((h) => `${h.file}:${h.line} ${h.fn}${h.name === name ? '' : ' ' + h.name.slice(name.length + 1)}`),
    other: hits.filter((h) => !pg(h.file)).map((h) => `${h.file}:${h.line}`),
  };
});
console.log(JSON.stringify(out, null, 1));
const used = new Set(out.flatMap((o) => o.pg.map((p) => p.split(' ')[0])));
const unknown = marks.filter((m) => pg(m.file) && !used.has(`${m.file}:${m.line}`));
console.error('PG marks naming no case in the list:');
for (const m of unknown) console.error(`  ${m.file}:${m.line} ${m.name}`);
```

## `render.mjs`

```js
// Render the independent case map as Markdown from map.json and the hand verdicts below.
import { readFileSync } from 'node:fs';

const map = JSON.parse(readFileSync(process.argv[2], 'utf8'));

const SERVE = 'crates/cli/tests/serve_postgres.rs';
// Hand verdicts for rows the marks alone do not settle, keyed by `file:line`.
const OVERLAY = {
  'test/support/repository-contract.ts:2397': ['exempt', 'Accepted difference (ADR 0176, Storage ST-20): a commit\'s answer does not depend on change order. **True**: `write_changes` deletes, then row-locks, then drops every Resource before writing any (`crates/host/src/sql.rs:730-797`), so the receiving-first move commits; `commits_a_move_whichever_space_it_lists_first` (`crates/host/tests/repository_contract/commits.rs`) holds it on PostgreSQL through the table.'],
  'test/integration/postgres-rows-across-runtimes.test.ts:21': ['exempt', 'Not a store case: the TypeScript half of the cross-runtime row check (ticket 10), whose Rust half is `crates/host/tests/postgres_rows.rs`. **True**, but the ports test does not list the file (ticket 01).'],
  'test/integration/postgres-rows-across-runtimes.test.ts:30': ['exempt', 'As above: it reads the rows `crates/host/tests/postgres_rows.rs` › `writes_the_rows_checked_in` writes. **True**.'],
  'test/integration/postgres-rows-across-runtimes.test.ts:36': ['exempt', 'As above. **True**.'],
  'test/integration/database-http-runtime.test.ts:102': ['ported, unmarked', `${SERVE}:373 \`given_a_migrated_database_holding_nothing::initializes_it_from_default_content_and_serves_it\` (no \`// Case:\` line; ticket 02)`],
  'test/integration/database-http-runtime.test.ts:135': ['ported, unmarked', `${SERVE}:402 \`given_a_migrated_database_holding_nothing::announces_before_the_database_answers_and_initializes_it_once_it_does\`, a real outage in place of the injected one (no \`// Case:\` line; ticket 02)`],
  'test/integration/database-http-runtime.test.ts:179': ['ported, unmarked', `${SERVE}:663 \`given_an_unmigrated_database::gives_up_after_two_confirmed_invariant_failures_and_keeps_serving\` (no \`// Case:\` line; ticket 02)`],
  'test/unit/vite-hono-host.test.ts:974': ['ported, unmarked', `${SERVE}:156 \`given_a_database_that_does_not_answer::announces_and_answers_503_from_a_trimmed_database_url_in_the_nearest_env\` (no \`// Case:\` line; ticket 02)`],
  'test/unit/prisma-foundation.test.ts:45': ['exempt', 'Prisma Next\'s migration config with a blank `DATABASE_URL`: migration is rust-host 16 (Q13), and `serve` refuses a blank URL (settled, `crates/host/tests/postgres_url.rs:128`). **True**; the ports test still calls it pending on 09 (ticket 01).'],
  'test/unit/prisma-foundation.test.ts:53': ['ported, unmarked', '`crates/host/tests/postgres_url.rs:74` `given_the_environment::trims_the_value` (no `// Case:` line; ticket 02)'],
  'test/unit/prisma-foundation.test.ts:63': ['exempt', 'Settled difference (rust-host 16 Agent Brief, ADR 0177): Rust refuses a blank `DATABASE_URL` where TypeScript builds a client on the driver\'s defaults; `refuses_an_unset_or_blank_database_url_before_taking_a_port` (`' + SERVE + ':114`). **True**, but recorded only as "pending 09" (ticket 01).'],
  'test/unit/prisma-foundation.test.ts:73': ['exempt', 'Owned elsewhere: rust-host 16, migration history. **True**: no Rust migrator exists yet (`infinity-cube migrate` is not built, Storage operations table).'],
  'test/unit/prisma-foundation.test.ts:99': ['exempt', 'Owned elsewhere: rust-host 16. **True**, as above.'],
  'test/unit/prisma-postgres-env-path.test.ts:29': ['exempt', 'Accepted difference Q7: the search starts at the current directory. **True**: `crates/cli/src/serve.rs:102-105`.'],
  'test/unit/prisma-postgres-env-path.test.ts:67': ['exempt', 'Accepted difference Q7, as above. **True**.'],
  'test/e2e/postgres-persistence.spec.ts:71': ['ported, by CI configuration', '`.github/workflows/ci.yml:266` runs this spec against `infinity-cube serve --store postgres`; no Rust file can carry its mark, and the ports test still calls it pending on 10 (ticket 01).'],
  'test/integration/database-cli-targets.test.ts:112': ['exempt', 'Owned elsewhere: rust-host 17 and 26 (the CLI\'s import and export against a store, spec "Not in scope"). **True**: `crates/cli/src/` has no `import` or `export` verb.'],
};
for (const line of [175, 220, 251, 291, 349, 400, 422]) {
  OVERLAY[`test/integration/infinity-cube-cli.test.ts:${line}`] = OVERLAY['test/integration/database-cli-targets.test.ts:112'];
}

// Rows outside the PostgreSQL map: other stores' describe blocks, store-independent cases run with fakes.
const outside = (c) =>
  (c.file === 'test/unit/sql-connection-failure.test.ts' && c.describe.startsWith('sqliteSqlStore')) ||
  (c.file === 'test/unit/database-startup.test.ts' && !c.describe.includes('PostgreSQL')) ||
  (c.file === 'test/unit/vite-hono-host.test.ts' && c.describe !== 'Database HTTP runtime') ||
  (c.file === 'test/e2e/postgres-persistence.spec.ts' && c.name.startsWith('<expr'));

// Marks that carry no value where the TypeScript case runs once per value.
const valueless = (c) => c.each && c.pg.length > 0 && c.pg.every((p) => !p.includes(' ('));

const esc = (s) => s.replaceAll('|', '\\|');
const rows = [];
const tally = {};
let section = '';
for (const c of map) {
  if (outside(c)) continue;
  const key = `${c.file}:${c.line}`;
  let verdict;
  let evidence;
  if (OVERLAY[key]) [verdict, evidence] = OVERLAY[key];
  else if (c.pg.length > 0) {
    verdict = valueless(c) ? 'ported (one test per value, values unmarked)' : 'ported';
    evidence = c.pg.map((p) => '`' + p.split(' ')[0] + '` `' + p.split(' ')[1] + '`' + (p.split(' ').length > 2 ? ' ' + p.split(' ').slice(2).join(' ') : '')).join('<br>');
  } else {
    verdict = 'missing';
    evidence = '';
  }
  tally[verdict] = (tally[verdict] ?? 0) + 1;
  if (c.file !== section) {
    section = c.file;
    rows.push(`\n### \`${c.file}\`\n\n| Line | Case | Verdict | Rust test or reason |\n| --- | --- | --- | --- |`);
  }
  rows.push(`| ${c.line} | ${esc(c.name)} | ${verdict} | ${esc(evidence)} |`);
}
console.log(rows.join('\n'));
console.error(JSON.stringify(tally));
```

## `mutate.py`

```python
"""Apply each fresh hand mutant in turn, run every PostgreSQL test, restore.

Usage: python3 -I mutate.py [id ...]
Each result goes to mutants/<id>.log and a line in mutants/results.tsv.
"""
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True).stdout.strip())
HERE = pathlib.Path(__file__).resolve().parent
PG = "crates/host/src/sql/postgres.rs"
SQL = "crates/host/src/sql.rs"

MUTANTS = {
    "A01": (PG, "WHERE singleton_id = 1 AND meta_space_id = $1::uuid FOR UPDATE\",",
            "WHERE singleton_id = 1 AND meta_space_id = $1::uuid\","),
    "A02": (PG, "WHERE singleton_id = 1 AND meta_space_id = $1::uuid FOR UPDATE\",",
            "WHERE singleton_id = 1 AND $1::uuid IS NOT NULL FOR UPDATE\","),
    "A03": (PG, "WHERE id = convert_from($1, 'UTF8')::uuid FOR UPDATE\",",
            "WHERE id = convert_from($1, 'UTF8')::uuid\","),
    "A04": (PG, "sqlx::query(\"SELECT 1 FROM spaces WHERE id = $1::uuid FOR UPDATE\")",
            "sqlx::query(\"SELECT 1 FROM spaces WHERE id = $1::uuid AND false\")"),
    "A05": (PG, "sqlx::query(\"SELECT 1 FROM spaces WHERE id = $1::uuid FOR UPDATE\")",
            "sqlx::query(\"SELECT 1 FROM spaces WHERE id = $1::uuid FOR SHARE\")"),
    "A06": (PG, "FROM spaces ORDER BY id\",\n        )",
            "FROM spaces ORDER BY id DESC\",\n        )"),
    "A07": (PG, "\"SELECT pg_advisory_xact_lock_shared($1, $2)::text\"",
            "\"SELECT pg_advisory_lock_shared($1, $2)::text\""),
    "A08": (PG, "LockMode::Exclusive => \"SELECT pg_advisory_xact_lock($1, $2)::text\"",
            "LockMode::Exclusive => \"SELECT pg_advisory_lock($1, $2)::text\""),
    "A09": (PG, "ON CONFLICT (id) DO UPDATE SET document = excluded.document, \\",
            "ON CONFLICT (id) DO UPDATE SET document = excluded.document, space_id = excluded.space_id, \\"),
    "A10": (SQL, "for attempt in 0..2 {", "for attempt in 0..3 {"),
    "A11": (SQL, "if meta_space_id.is_none() && rows.is_empty() {",
            "if meta_space_id.is_none() || rows.is_empty() {"),
    "A12": (SQL, "let mut transaction = self.begin_locked(LockMode::Exclusive, false).await?;",
            "let mut transaction = self.begin_locked(LockMode::Shared, false).await?;"),
    "A13": (SQL, """        self.store
            .hold_space(&mut transaction, space_id.as_str())
            .await?;
        let current = one_space::<S>(&mut transaction, space_id).await?;""",
            """        let current = one_space::<S>(&mut transaction, space_id).await?;
        self.store
            .hold_space(&mut transaction, space_id.as_str())
            .await?;"""),
    "A14": (SQL, """                let mut transaction = shared.begin(Access::Write).await?;
                let held = S::set_exported_revision(""",
            """                let mut transaction = shared.begin_locked(LockMode::Exclusive, true).await?;
                let held = S::set_exported_revision("""),
    "A15": (SQL, """            let mut transaction = shared.begin(Access::Read).await?;
            let rows = S::spaces(&mut transaction).await?;""",
            """            let mut transaction = shared.begin_locked(LockMode::Shared, false).await?;
            let rows = S::spaces(&mut transaction).await?;"""),
    "A16": (PG, "acquire_timeout: Duration::from_secs(2),", "acquire_timeout: Duration::from_secs(30),"),
    "A17": (SQL, """        let _alone = self.gate.write().await;
        self.shared.store.close().await;""",
            """        self.shared.store.close().await;"""),
    "A18": (PG, "Some(code) => format!(\"{error} (SQLSTATE {code})\"),", "Some(_) => error.to_string(),"),
    "A19": (PG, "Access::Write | Access::Locked { .. } => \"BEGIN ISOLATION LEVEL READ COMMITTED\",",
            "Access::Write => \"BEGIN ISOLATION LEVEL SERIALIZABLE\",\n            Access::Locked { .. } => \"BEGIN ISOLATION LEVEL READ COMMITTED\","),
    "A20": (SQL, """        let mut transaction = self.store.begin(access).await?;
        every_table::<S>(&mut transaction).await?;
        Ok(transaction)""",
            """        let transaction = self.store.begin(access).await?;
        Ok(transaction)"""),
    "A21": (SQL, """            if current.as_ref() != Some(&row.revision) {
                transaction.rollback().await?;
                return Ok(ReplaceResult::Conflict {""",
            """            if current.is_none() {
                transaction.rollback().await?;
                return Ok(ReplaceResult::Conflict {"""),
    "A22": (SQL, """            Err(Landing::Refused(message)) => {
                transaction.rollback().await?;""",
            """            Err(Landing::Refused(message)) => {
                transaction.commit().await?;"""),
    "A23": (PG, "Access::Read => \"BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY\",",
            "Access::Read => \"BEGIN ISOLATION LEVEL REPEATABLE READ\","),
    "A24": (SQL, "AggregateLoad::Uninitialized => Err(Failure::Database(error)),",
            "AggregateLoad::Uninitialized => Err(Failure::Answered(RepositoryError::Unavailable(error.to_string()))),"),
}


def run(mid):
    path, old, new = MUTANTS[mid]
    target = ROOT / path
    text = target.read_text()
    if text.count(old) != 1:
        return f"{mid}\tNOT-APPLIED\tmatched {text.count(old)} times"
    target.write_text(text.replace(old, new))
    try:
        out = subprocess.run(["sh", str(HERE / "run-pg.sh"), str(HERE / "mutants" / f"{mid}.log")],
                             capture_output=True, text=True).stdout
    finally:
        subprocess.run(["git", "checkout", "--", path], cwd=ROOT, check=True)
    lines = out.strip().splitlines()
    status = lines[0] if lines else "?"
    failing = [l for l in lines[1:] if not l.startswith("Summary") and "Summary" not in l]
    summary = next((l.strip() for l in lines if "Summary" in l), "no summary")
    if status == "exit 0":
        verdict = "SURVIVED"
    elif "Summary" not in out:
        verdict = "UNVIABLE"
    else:
        verdict = "KILLED"
    return f"{mid}\t{verdict}\t{summary}\t{' | '.join(failing[:12])}"


if __name__ == "__main__":
    ids = sys.argv[1:] or list(MUTANTS)
    (HERE / "mutants").mkdir(exist_ok=True)
    with open(HERE / "mutants" / "results.tsv", "a") as results:
        for mid in ids:
            line = run(mid)
            print(line, flush=True)
            results.write(line + "\n")
            results.flush()
```

## `run-pg.sh`

```sh
#!/bin/sh
# Run every PostgreSQL test (and the unit tests of the mutated files) once.
# Usage: run-pg.sh <log>
cd "$(git rev-parse --show-toplevel)" || exit 9
export CARGO_PROFILE_DEV_DEBUG=0 CARGO_PROFILE_TEST_DEBUG=0 CARGO_INCREMENTAL=0
export INFINITY_CUBE_POSTGRES_TEST_URL=${INFINITY_CUBE_POSTGRES_TEST_URL:?set it to a server whose role may create databases and roles}
cargo nextest run --build-jobs 2 --locked -p host -p infinity-cube --lib \
  --test postgres --test postgres_concurrency --test postgres_outages --test postgres_properties \
  --test postgres_races --test postgres_rows --test postgres_url --test postgres_wire --test serve_postgres \
  --run-ignored all --test-threads 4 --no-fail-fast --config-file "$(dirname "$0")/nextest.toml" \
  -E 'binary(/^postgres/) | binary(=serve_postgres) | (package(host) & kind(lib) & (test(/^sql::(tests|postgres)::/) | test(/^commit::/)))' \
  > "$1" 2>&1
echo "exit $?"
grep -E "^\s+(FAIL|TIMEOUT|SIGSEGV|SIGABRT) " "$1" | sed 's/^ *//' | sort -u | head -40
grep -E "Summary" "$1"
```

## `nextest.toml`

```toml
[profile.default]
slow-timeout = { period = "30s", terminate-after = 2 }
```
