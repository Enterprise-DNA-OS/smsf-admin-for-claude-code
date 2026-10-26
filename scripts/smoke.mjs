#!/usr/bin/env node
// End-to-end smoke test on a throwaway embedded database: migrate, seed, then every command
// that matters, asserting on the JSON. Passes on Windows and Linux. No network, no Postgres install.
// TEST_DATABASE_URL runs the same test against a real Postgres (CI does this).

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = mkdtempSync(path.join(tmpdir(), 'smsf-smoke-'));
const exportDir = path.join(dataDir, 'export');
const env = { ...process.env, DATA_DIR: dataDir };
delete env.DATABASE_URL;
if (process.env.TEST_DATABASE_URL) env.DATABASE_URL = process.env.TEST_DATABASE_URL;

let step = 0;
function run(label, args, { json = true, expectFail = false } = {}) {
  step++;
  const argv = [path.join(root, 'scripts', args[0]), ...args.slice(1), ...(json ? ['--json'] : [])];
  const res = spawnSync(process.execPath, argv, { cwd: root, env, encoding: 'utf8' });
  const ok = expectFail ? res.status !== 0 : res.status === 0;
  if (!ok) {
    console.error(`\nFAIL step ${step} (${label}): exit ${res.status}\n--- stdout\n${res.stdout}\n--- stderr\n${res.stderr}`);
    process.exit(1);
  }
  console.log(`  ok  ${String(step).padStart(2)}  ${label}`);
  if (!json || expectFail) return { stdout: res.stdout, stderr: res.stderr };
  try { return JSON.parse(res.stdout); } catch {
    console.error(`\nFAIL step ${step} (${label}): output is not JSON\n${res.stdout}\n${res.stderr}`);
    process.exit(1);
  }
}
function assert(cond, msg) { if (!cond) { console.error(`\nFAIL assertion: ${msg}`); process.exit(1); } }
const n = (v) => Number(v ?? 0);
const S = (...a) => ['smsf.mjs', ...a];
const rule = (rows, id) => rows.find((r) => r.id === id);

console.log(`smoke: ${env.DATABASE_URL ? 'Postgres' : 'embedded database in ' + dataDir}`);
try {
  run('migrate', ['migrate.mjs'], { json: false });
  run('migrate again (idempotent)', ['migrate.mjs'], { json: false });
  run('seed', ['seed.mjs'], { json: false });
  run('seed again (idempotent)', ['seed.mjs'], { json: false });

  // ---- the overview
  const stats = run('stats', S('stats'));
  assert(stats.funds === 8 && stats.members === 14 && stats.pensions === 7, `eight funds, fourteen members, seven pensions (${JSON.stringify(stats)})`);
  assert(stats.lodged === 1 && stats.jobs === 8 && stats.open_queries === 3 && stats.uncoded === 4, `job counts ${JSON.stringify(stats)}`);
  const funds = run('funds', S('funds'));
  assert(funds.length === 8 && n(funds.find((f) => f.code === 'CHEN').in_house_pct) === 7.5, 'CHEN is 7.5% in-house');
  const card = run('fund by name', S('fund', 'chen family'));
  assert(card.fund.code === 'CHEN' && card.members.length === 2 && card.investments.length === 4, 'fuzzy fund lookup and the fund card');
  run('ambiguous fund lists and exits 1', S('fund', 'Super Fund'), { json: false, expectFail: true });
  const members = run('members', S('members'));
  assert(members.find((m) => m.member === "Maureen O'Keefe").event.startsWith('turns 75'), 'Maureen turns 75 this year');
  const linh = run('member', S('member', 'linh'));
  assert(linh.member.full_name === 'Linh Nguyen' && n(linh.contributions[0].concessional_room) < 0, 'Linh is over the concessional cap');

  // ---- contributions and caps
  const cr = run('contributions', S('contributions'));
  const tuan = cr.find((r) => r.member === 'Tuan Nguyen');
  assert(tuan.carry_forward_usable && n(tuan.concessional_room) > 0 && n(tuan.concessional) > n(tuan.concessional_cap), 'Tuan is past the cap but inside it with carry-forward');
  const linhRow = cr.find((r) => r.member === 'Linh Nguyen');
  assert(!linhRow.carry_forward_usable && n(linhRow.carry_forward_available) === 8000, 'Linh has carry-forward she cannot use (balance over $500,000)');
  assert(n(cr.find((r) => r.member === 'Margaret Harrington').ncc_limit) === 3 * n(cr[0].concessional_cap) * 4, 'Margaret has the three-year bring-forward (3 x 4 x the concessional cap)');
  const over = run('contributions --over', S('contributions', '--over'));
  assert(over.some((r) => r.member === 'Linh Nguyen') && !over.some((r) => r.member === 'Peter Harrington'), '--over keeps only those near or over a cap');
  const c1 = run('contribute', S('contribute', 'Raj Patel', '2,000', '--type=employer-sg'));
  assert(n(c1.amount) === 2000 && n(c1.concessional_room) < 32500, 'contribution recorded and room recomputed');
  run('contribute rejects a bad type', S('contribute', 'Raj Patel', '100', '--type=gift'), { json: false, expectFail: true });

  // ---- pensions
  const ps = run('pensions', S('pensions'));
  const p4 = ps.find((p) => p.number === 'P-0004');
  assert(p4.over_maximum && n(p4.maximum) === 40000, 'Morrison TTR over its 10% maximum');
  const p7 = ps.find((p) => p.number === 'P-0007');
  assert(n(p7.minimum) === 49000 && n(p7.paid) === 0, 'Brennan: full minimum this year, nothing paid');
  assert(n(ps.find((p) => p.number === 'P-0001').minimum) === 59000, 'Harrington minimum 5% of $1,180,000');
  const prev = run('pensions last year', S('pensions', '--fy', String(Number(stats.fy.slice(0, 4)))));
  assert(n(prev.find((p) => p.number === 'P-0007').minimum) === 0, 'a pension started in June has no minimum that year');
  assert(n(prev.find((p) => p.number === 'P-0002').left_to_pay) === 8000, "O'Keefe short $8,000 last year");
  const paid = run('pay', S('pay', 'P-0007', '5000'));
  assert(n(paid.paid) === 5000 && n(paid.left_to_pay) === 44000, 'pension payment recorded');
  const pn = run('pension-new', S('pension-new', 'Margaret Harrington', '--balance=600000', '--date', `${stats.fy.slice(0, 4)}-07-01`));
  assert(pn.number === 'P-0008' && n(pn.minimum) === 30000, 'new pension at 65: 5% of $600,000');
  run('pension by member name', S('pay', 'margaret', '2500'));

  // ---- investments and bank lines
  const inv = run('investments --in-house', S('investments', '--in-house'));
  assert(inv.holdings.length === 1 && inv.holdings[0].code === 'LOAN-CTPL', 'one in-house asset');
  run('value', S('value', 'BREN', 'SUITE-3', '910000', '--date', `${Number(stats.fy.slice(0, 4))}-06-30`, '--basis=Independent valuation'));
  const unc = run('uncoded', S('uncoded'));
  assert(unc.length === 4, 'four bank lines to code');
  const raj = unc.find((u) => /CLEARING HOUSE/.test(u.description));
  run('code a bank line as a contribution', S('code', raj.ref, '--kind=contribution', '--member=Raj Patel', '--type=employer-sg'));
  run('a contribution needs a member', S('code', unc.find((u) => /R PATEL/.test(u.description)).ref, '--kind=contribution', '--type=personal-non-concessional'), { json: false, expectFail: true });
  assert(run('uncoded after', S('uncoded')).length === 3, 'one line coded');
  run('add income', S('add', 'BREN', 'income', '6250', '--holding=SUITE-3', '--desc=Rent'));

  // ---- compliance and attention
  const comp = run('compliance', S('compliance'));
  for (const id of ['R1', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R11', 'R13']) assert(rule(comp, id).count >= 1, `${id} finds its planted breach`);
  assert(rule(comp, 'R12').count === 0, 'R12 clears once the property has a 30 June value');
  assert(rule(comp, 'R2').count === 0, 'nobody over the non-concessional cap');
  assert(rule(comp, 'R3').items[0].item === "Brian O'Keefe", 'R3 is the 77 year old');
  assert(!rule(comp, 'R8').items.some((i) => i.item === 'WAREHOUSE'), 'business property bought from a related party is allowed');
  const att = run('attention', S('attention'));
  assert(att[0].area === 'compliance' && att.some((a) => a.area === 'pensions') && att.some((a) => a.area === 'audit') && att.some((a) => a.area === 'jobs'), 'attention covers compliance, pensions, audit and jobs');
  const eofy = run('eofy', S('eofy'));
  assert(eofy.notice_of_intent.length === 2 && eofy.carry_forward_room.some((r) => r.member === 'Tuan Nguyen'), 'June checklist: notices of intent and carry-forward room');

  // ---- jobs and the audit
  const jobs = run('jobs', S('jobs'));
  assert(jobs.length === 8 && jobs.find((j) => j.fund === 'CHEN').days_to_due < 0, 'CHEN return is late');
  const pate = run('job moves stage and stamps the date', S('job', 'PATE', '--stage=records-in', '--hours=+1.5'));
  assert(pate.stage === 'records-in' && n(pate.hours) === 3.5 && pate.records_in_on, 'records in, hours added');
  run('job to auditor', S('job', 'PATE', '--stage=with-auditor'));
  assert(rule(run('compliance after', S('compliance')), 'R10').count === 0, 'R10 clears once the job is with the auditor');
  const q = run('query', S('query', 'PATE', 'Provide the 30 June bank statement', '--waiting=trustee'));
  assert(q.number === 'Q-0005', 'query numbered');
  assert(run('job card', S('job', 'PATE')).job.stage === 'audit-queries', 'a query moves the job to audit-queries');
  const a = run('answer', S('answer', 'Q-0005', 'Statement attached'));
  assert(a.open_left === 0 && run('job card again', S('job', 'PATE')).job.stage === 'with-auditor', 'answering the last query sends it back to the auditor');
  run('open next year\'s job', S('job', 'HARR', '--fy', stats.fy, '--stage=not-started', '--due=2028-05-15'));
  const prof = run('profitability', S('profitability'));
  assert(prof.jobs[0].fund === 'CHEN' && n(prof.jobs[0].margin) < 0, 'CHEN loses money');
  assert(run('staff', S('staff')).length === 4, 'four staff');
  const caps = run('caps', S('caps'));
  assert(caps.years.length >= 3 && caps.pension_factors.length === 7, 'caps and factors on file');
  run('caps-add', S('caps-add', '2030-31', '--cc=35000', '--ncc=140000', '--tbc=2300000', '--source=test'));
  run('strategy review', S('strategy', 'CHEN', '--insurance'));
  assert(rule(run('compliance after review', S('compliance')), 'R9').count === 0, 'R9 clears after the review');
  run('log', S('log', 'CHEN', 'Trustee meeting booked', '--by=JT'));

  // ---- set up a fund from Simple Fund 360 exports
  run('fund-new', S('fund-new', 'KELL', 'Kelleher Super Fund', '--manager=MK', '--fee=2400'));
  const fy = stats.fy;
  run('import members dry run', S('import', 'bgl', 'members', 'examples/sf360-members.csv', '--fy', fy, '--dry-run'));
  assert(run('fund before import', S('fund', 'KELL')).members.length === 0, 'dry run writes nothing');
  const im = run('import members', S('import', 'bgl', 'members', 'examples/sf360-members.csv', '--fy', fy));
  assert(im.created === 2 && !im.problems.length, 'two members');
  const ii = run('import investments', S('import', 'bgl', 'investments', 'examples/sf360-investments.csv', '--fy', fy));
  assert(ii.created === 3, 'three holdings');
  const it = run('import transactions', S('import', 'bgl', 'transactions', 'examples/sf360-transactions.csv', '--fy', fy));
  assert(it.created === 4, 'four transactions');
  const again = run('import transactions twice', S('import', 'bgl', 'transactions', 'examples/sf360-transactions.csv', '--fy', fy));
  assert(again.created === 0 && again.unchanged === 4, 'running it twice changes nothing');
  const kell = run('imported fund', S('fund', 'KELL'));
  assert(kell.members.length === 2 && n(kell.assets.total) === 964000, 'imported fund totals');
  assert(run('uncoded incl. imported', S('uncoded', '--fund=KELL')).length === 1, 'an unknown bank line stays uncoded');
  run('member-new', S('member-new', 'KELL', 'Test Member', '--dob=1990-01-01', '--balance=1000'));
  run('member-year', S('member-year', 'Test Member', '--tsb=1000', '--carry-forward=5000'));

  // ---- views, documents, export
  run('view', ['view.mjs'], { json: false });
  assert(existsSync(path.join(root, 'views', 'week.html')), 'views rendered');
  run('docs', ['docs.mjs'], { json: false });
  for (const d of ['member-statement', 'pension-letter', 'fund-summary', 'audit-pack']) assert(readdirSync(path.join(root, 'docs-out', d)).length > 0, `${d} rendered`);
  const ex = run('export', S('export', '--out', exportDir));
  assert(ex.counts.funds === 9 && existsSync(path.join(exportDir, 'transactions.csv')), 'export');
  run('help', S('help'), { json: false });
  run('unknown command exits 1', S('nope'), { json: false, expectFail: true });
} finally {
  if (!process.env.TEST_DATABASE_URL) rmSync(dataDir, { recursive: true, force: true });
}
console.log(`\nPASS: ${step} steps`);
