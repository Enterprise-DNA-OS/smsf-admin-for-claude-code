#!/usr/bin/env node
// smsf-admin-for-claude-code: the one CLI. The slash commands call this; so can you.
//
//   node scripts/smsf.mjs <command> [args] [--flags] [--json]
//   npm run smsf -- <command> ...
//
// Run with no arguments (or `help`) for the command list.
//
// This records what an Australian accounting practice keeps for the self managed super funds it
// administers: funds, trustees and members, balances year by year, contributions against the
// caps, pensions against the minimum, investments and their valuations, bank lines to code, the
// year's job on each fund from records request to lodgment, and the auditor's queries. It sends
// nothing and lodges nothing: letters, records requests and audit responses are drafted here, a
// person sends them, and the return is lodged from the practice's own tax software.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { parseCsv, pick } from './lib/csv.mjs';
import { table, isoDate, truncate, heading } from './lib/format.mjs';

// ---------------------------------------------------------------- settings

// A member with less than this much concessional room left is flagged before they go over.
const CAP_WARN = 5000;
// A job sitting in one stage this long is flagged as stuck.
const STUCK_DAYS = 21;
// Records requested and not in after this many days is chased.
const RECORDS_CHASE_DAYS = 30;
// An audit query open this long is chased.
const QUERY_CHASE_DAYS = 14;
// The investment strategy review is flagged this many days before it turns a year old.
const STRATEGY_WARN_DAYS = 30;
// The in-house asset limit, as a share of the fund's assets. SIS Act Part 8.
const IN_HOUSE_LIMIT_PCT = 5;

const STAGES = ['not-started', 'records-requested', 'records-in', 'in-progress', 'review', 'with-auditor', 'audit-queries', 'signed', 'lodged'];
const CONTRIBUTION_TYPES = ['employer-sg', 'salary-sacrifice', 'personal-deductible', 'personal-non-concessional', 'spouse', 'downsizer'];
const KINDS = ['contribution', 'pension', 'lump-sum', 'rollover-in', 'rollover-out', 'income', 'expense', 'purchase', 'sale', 'tax'];
const ASSET_CLASSES = ['cash', 'term-deposit', 'listed-shares', 'managed-fund', 'business-property', 'residential-property', 'unlisted-trust', 'loan', 'collectible', 'crypto', 'other'];

// ---------------------------------------------------------------- arguments

const BOOL_FLAGS = new Set(['json', 'help', 'all', 'dry-run', 'open', 'over', 'behind', 'in-house', 'related', 'insurance']);

function parseArgv(argv) {
  const args = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h') { flags.help = true; continue; }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      let name, value;
      if (eq > -1) { name = a.slice(2, eq); value = a.slice(eq + 1); }
      else {
        name = a.slice(2);
        const next = argv[i + 1];
        if (BOOL_FLAGS.has(name) || next === undefined || next.startsWith('--')) value = true;
        else value = argv[++i];
      }
      flags[name] = value;
    } else args.push(a);
  }
  return { args, flags };
}

class CliError extends Error {
  constructor(message, code = 1) { super(message); this.code = code; }
}

const n = (v) => Number(v ?? 0);
const str = (v) => (v === true || v === undefined || v === null ? '' : String(v));
const aud = (v) => (v === null || v === undefined || v === '' ? '' : `${n(v) < 0 ? '-' : ''}$${Math.abs(Math.round(n(v))).toLocaleString('en-AU')}`);
const pct = (v) => (v === null || v === undefined ? '' : `${n(v).toFixed(n(v) % 1 ? 1 : 0)}%`);

function today() {
  const d = new Date();
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const addDays = (date, days) => { const d = new Date(`${date}T00:00:00`); d.setDate(d.getDate() + days); return isoDate(d); };

function parseDate(v, what = 'date') {
  if (!v || v === true) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (s.toLowerCase() === 'today') return today();
  if (s.toLowerCase() === 'yesterday') return addDays(today(), -1);
  // Australian exports write DD/MM/YYYY.
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  throw new CliError(`"${v}" is not a ${what}. Use YYYY-MM-DD.`);
}

// "$12,500.00", "12500", "(1,200.00)" and "-1200" are all amounts. Brackets are negative.
function parseMoney(v, what = 'amount') {
  if (v === undefined || v === null || v === '' || v === true) return null;
  let s = String(v).trim();
  const neg = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[()$,\s-]/g, '').replace(/^AUD/i, '');
  const x = Number(s);
  if (!Number.isFinite(x)) throw new CliError(`"${v}" is not an ${what}.`);
  return Math.round((neg ? -x : x) * 100) / 100;
}

function parseFy(v) {
  if (!v || v === true) return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})$/);
  if (m) return s;
  m = s.match(/^(\d{4})$/); // "2026" means the year ending 30 June 2026, as the ATO writes it
  if (m) return `${Number(m[1]) - 1}-${m[1].slice(2)}`;
  m = s.match(/^(\d{4})\/(\d{2,4})$/);
  if (m) return `${m[1]}-${m[2].slice(-2)}`;
  throw new CliError(`"${v}" is not a financial year. Use 2026-27, or 2027 for the year ending 30 June 2027.`);
}

// ---------------------------------------------------------------- lookups

let db;
let JSON_OUT = false;
let CUR_FY;

const prevFy = (fy) => `${Number(fy.slice(0, 4)) - 1}-${fy.slice(2, 4)}`;

function ambiguous(what, rows, label) {
  return new CliError(`More than one ${what} matches. Be more specific:\n${rows.map((r) => `  ${label(r)}`).join('\n')}`);
}

async function findFund(ref) {
  if (!ref || ref === true) throw new CliError('Which fund? Give its code (HARR) or part of its name.');
  const rows = await db.query(`select f.*, s.code as manager from funds f left join staff s on s.id = f.manager_id
    where lower(f.code) = lower($1) or f.name ilike $2 or f.trustee_name ilike $2 order by f.code`, [ref, `%${ref}%`]);
  const exact = rows.filter((r) => r.code.toLowerCase() === String(ref).toLowerCase());
  if (exact.length === 1) return exact[0];
  if (rows.length === 1) return rows[0];
  if (!rows.length) throw new CliError(`No fund "${ref}". Run: smsf funds`);
  throw ambiguous('fund', rows, (r) => `${r.code}  ${r.name}`);
}

async function findMember(ref) {
  if (!ref || ref === true) throw new CliError('Which member? Give their name, or part of it.');
  const rows = await db.query(`select m.*, f.code as fund, f.name as fund_name from members m join funds f on f.id = m.fund_id
    where m.full_name ilike $1 or m.id::text = $2 order by m.full_name`, [`%${ref}%`, ref]);
  const exact = rows.filter((r) => r.full_name.toLowerCase() === String(ref).toLowerCase());
  if (exact.length === 1) return exact[0];
  if (rows.length === 1) return rows[0];
  if (!rows.length) throw new CliError(`No member "${ref}". Run: smsf members`);
  throw ambiguous('member', rows, (r) => `${r.full_name}  (${r.fund})`);
}

async function findPension(ref) {
  if (!ref || ref === true) throw new CliError('Which pension? Give its number (P-0001) or the member\'s name.');
  const s = String(ref).toUpperCase();
  const want = /^\d+$/.test(s) ? `P-${s.padStart(4, '0')}` : s;
  let rows = await db.query(`select p.*, m.full_name as member, f.code as fund from pensions p join members m on m.id = p.member_id join funds f on f.id = m.fund_id
    where upper(p.number) = $1 or m.full_name ilike $2 order by p.number`, [want, `%${ref}%`]);
  const exact = rows.filter((r) => r.number.toUpperCase() === want);
  if (exact.length === 1) return exact[0];
  const active = rows.filter((r) => r.status === 'active');
  if (active.length === 1) rows = active;
  if (rows.length === 1) return rows[0];
  if (!rows.length) throw new CliError(`No pension "${ref}". Run: smsf pensions`);
  throw ambiguous('pension', rows, (r) => `${r.number}  ${r.member} (${r.kind})`);
}

async function findTxn(ref) {
  if (!ref || ref === true) throw new CliError('Which transaction? Give the start of its id from `smsf uncoded`.');
  const rows = await db.query(`select t.*, f.code as fund from transactions t join funds f on f.id = t.fund_id where t.id::text like $1 order by t.txn_on`, [`${String(ref).toLowerCase()}%`]);
  if (rows.length === 1) return rows[0];
  if (!rows.length) throw new CliError(`No transaction "${ref}".`);
  throw ambiguous('transaction', rows, (r) => `${r.id.slice(0, 8)}  ${r.fund} ${isoDate(r.txn_on)} ${aud(r.amount)} ${r.description || ''}`);
}

async function findStaff(ref) {
  const rows = await db.query(`select * from staff where lower(code) = lower($1) or full_name ilike $2 order by code`, [ref, `%${ref}%`]);
  const exact = rows.filter((r) => r.code.toLowerCase() === String(ref).toLowerCase());
  if (exact.length === 1) return exact[0];
  if (rows.length === 1) return rows[0];
  if (!rows.length) throw new CliError(`No staff member "${ref}". Run: smsf staff`);
  throw ambiguous('staff member', rows, (r) => `${r.code}  ${r.full_name}`);
}

async function findJob(fundRef, fy) {
  const f = await findFund(fundRef);
  const year = fy || prevFy(CUR_FY);
  const [j] = await db.query(`select * from job_board where fund_id = $1 and fy = $2`, [f.id, year]);
  return { fund: f, job: j || null, fy: year };
}

function out(data, human) {
  if (JSON_OUT) console.log(JSON.stringify(data, null, 2));
  else console.log(typeof human === 'function' ? human(data) : human);
}

async function rulesNote() {
  const [r] = await db.query(`select rules_fy, rules_assumed from contribution_room where fy = $1 limit 1`, [CUR_FY]);
  return r?.rules_assumed ? `\n  No caps on file for ${CUR_FY}: using ${r.rules_fy}. Add this year's caps: smsf caps-add ${CUR_FY} --cc= --ncc= --tbc= --source=".."` : '';
}

// ---------------------------------------------------------------- overview

async function stats() {
  const [r] = await db.query(`select
      (select count(*) from funds where status <> 'closed') as funds,
      (select count(*) from members where status = 'active') as members,
      (select coalesce(sum(total), 0) from fund_assets) as assets,
      (select count(*) from pensions where status = 'active') as pensions,
      (select coalesce(sum(left_to_pay), 0) from pension_status where fy = $1) as pension_left,
      (select count(*) from jobs where fy = $2) as jobs, (select count(*) from jobs where fy = $2 and stage = 'lodged') as lodged,
      (select count(*) from audit_queries where status = 'open') as open_queries,
      (select count(*) from transactions where kind = 'uncoded') as uncoded,
      (select coalesce(sum(fee), 0) from jobs where fy = $2) as fees`, [CUR_FY, prevFy(CUR_FY)]);
  const breaches = (await complianceRows()).reduce((s, x) => s + x.count, 0);
  const data = {
    fy: CUR_FY, jobs_fy: prevFy(CUR_FY), funds: n(r.funds), members: n(r.members), assets: n(r.assets), pensions: n(r.pensions), pension_minimum_left: n(r.pension_left),
    jobs: n(r.jobs), lodged: n(r.lodged), open_queries: n(r.open_queries), uncoded: n(r.uncoded), fees: n(r.fees), breaches,
  };
  out(data, (d) => [heading(`The practice, ${d.fy}`),
    `  ${d.funds} funds, ${d.members} members, ${aud(d.assets)} in assets`,
    `  ${d.pensions} pensions, ${aud(d.pension_minimum_left)} of this year's minimums still to pay`,
    `  ${d.jobs_fy} jobs: ${d.lodged} of ${d.jobs} lodged, ${d.open_queries} audit queries open, ${aud(d.fees)} in fees`,
    `  ${d.uncoded} bank lines to code`,
    `  ${d.breaches} compliance breaches (smsf compliance)`].join('\n'));
}

async function funds() {
  const rows = await db.query(`select f.code, f.name, f.trustee_type, s.code as manager, f.status, a.total, a.cash, a.in_house_pct,
      (select count(*) from members m where m.fund_id = f.id and m.status = 'active') as members,
      (select count(*) from pensions p join members m on m.id = p.member_id where m.fund_id = f.id and p.status = 'active') as pensions,
      j.stage, j.due_on
    from funds f left join staff s on s.id = f.manager_id left join fund_assets a on a.fund_id = f.id
    left join jobs j on j.fund_id = f.id and j.fy = $1 where f.status <> 'closed' order by f.code`, [prevFy(CUR_FY)]);
  out(rows, (d) => heading('Funds') + '\n' + table(d, [
    { key: 'code', label: 'Code' }, { key: 'name', label: 'Fund', width: 34 }, { key: 'manager', label: 'Mgr' },
    { key: 'members', label: 'Members', align: 'right' }, { key: 'pensions', label: 'Pensions', align: 'right' },
    { key: 'total', label: 'Assets', align: 'right', format: aud }, { key: 'in_house_pct', label: 'In-house', align: 'right', format: pct },
    { key: 'stage', label: `${prevFy(CUR_FY)} job` }, { key: 'due_on', label: 'Due', format: isoDate }]));
}

async function fundCard(args) {
  const f = await findFund(args[0]);
  const members = await db.query(`select member, age_now, retired, opening_balance, inflows, outflows, balance_now from member_balances where fund_id = $1 order by member`, [f.id]);
  const [assets] = await db.query(`select * from fund_assets where fund_id = $1`, [f.id]);
  const investments = await db.query(`select code, name, asset_class, market_value, valued_on, related_party, in_house from investments where fund_id = $1 and sold_on is null order by market_value desc`, [f.id]);
  const pensions = await db.query(`select number, member, kind, minimum, maximum, paid, left_to_pay from pension_status where fund_id = $1 and fy = $2 order by number`, [f.id, CUR_FY]);
  const jobs = await db.query(`select fy, stage, assigned, due_on, open_queries, fee, hours from job_board where fund_id = $1 order by fy desc`, [f.id]);
  const notes = await db.query(`select body, author, created_at from notes where fund_id = $1 order by created_at desc limit 5`, [f.id]);
  const data = { fund: f, members, assets, investments, pensions, jobs, notes };
  out(data, () => [heading(`${f.code} ${f.name}`),
    `  ${f.trustee_type === 'corporate' ? 'Corporate trustee' : 'Individual trustees'}: ${f.trustee_name || '?'}. ABN ${f.abn || '?'}. Established ${isoDate(f.established_on) || '?'}. Managed by ${f.manager || '?'}.`,
    `  Auditor ${f.auditor || 'not set'}. Investment strategy reviewed ${isoDate(f.strategy_reviewed_on) || 'never'}${f.strategy_considers_insurance ? '' : ', insurance not considered'}. Fee ${aud(f.annual_fee)} a year.`,
    '\n  Members\n' + table(members, [{ key: 'member', label: 'Member' }, { key: 'age_now', label: 'Age', align: 'right' }, { key: 'retired', label: 'Retired', format: (v) => (v ? 'yes' : 'no') },
      { key: 'opening_balance', label: '1 July', align: 'right', format: aud }, { key: 'inflows', label: 'In', align: 'right', format: aud }, { key: 'outflows', label: 'Out', align: 'right', format: aud }, { key: 'balance_now', label: 'Now', align: 'right', format: aud }]),
    `\n  Investments: ${aud(assets?.total)}, ${pct(assets?.in_house_pct)} in-house\n` + table(investments, [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Holding', width: 40 }, { key: 'asset_class', label: 'Class' },
      { key: 'market_value', label: 'Value', align: 'right', format: aud }, { key: 'valued_on', label: 'Valued', format: isoDate }, { key: 'in_house', label: 'Flags', format: (v, r) => [r.related_party ? 'related' : '', v ? 'in-house' : ''].filter(Boolean).join(', ') }]),
    pensions.length ? `\n  Pensions ${CUR_FY}\n` + pensionTable(pensions) : '',
    '\n  Jobs\n' + table(jobs, [{ key: 'fy', label: 'Year' }, { key: 'stage', label: 'Stage' }, { key: 'assigned', label: 'Who' }, { key: 'due_on', label: 'Due', format: isoDate },
      { key: 'open_queries', label: 'Queries', align: 'right' }, { key: 'hours', label: 'Hours', align: 'right' }, { key: 'fee', label: 'Fee', align: 'right', format: aud }]),
    notes.length ? '\n  Notes\n' + notes.map((x) => `  ${isoDate(x.created_at)}  ${x.author ? x.author + ': ' : ''}${x.body}`).join('\n') : '',
  ].filter(Boolean).join('\n'));
}

async function members(flags) {
  const f = flags.fund ? await findFund(flags.fund) : null;
  const rows = await db.query(`select b.*, (b.date_of_birth + interval '75 years')::date as turns_75_on, (b.date_of_birth + interval '65 years')::date as turns_65_on
    from member_balances b where b.status = 'active' ${f ? 'and b.fund_id = $1' : ''} order by b.fund, b.member`, f ? [f.id] : []);
  const data = rows.map((r) => ({ ...r, event: memberEvent(r) }));
  out(data, (d) => heading('Members') + '\n' + table(d, [{ key: 'fund', label: 'Fund' }, { key: 'member', label: 'Member' }, { key: 'age_now', label: 'Age', align: 'right' },
    { key: 'retired', label: 'Retired', format: (v) => (v ? 'yes' : 'no') }, { key: 'balance_now', label: 'Balance', align: 'right', format: aud },
    { key: 'transfer_balance', label: 'Transfer bal', align: 'right', format: (v, r) => (r.personal_tbc ? `${aud(v)} of ${aud(r.personal_tbc)}` : '') }, { key: 'event', label: 'This year' }]));
}

// Ages that change what a member can do: 65 (unrestricted access), 75 (contributions stop).
function memberEvent(r) {
  const start = `${CUR_FY.slice(0, 4)}-07-01`;
  const end = `${Number(CUR_FY.slice(0, 4)) + 1}-06-30`;
  const t75 = isoDate(r.turns_75_on);
  const t65 = isoDate(r.turns_65_on);
  if (t75 >= start && t75 <= end) return `turns 75 on ${t75}: voluntary contributions stop 28 days after that month ends`;
  if (t65 >= start && t65 <= end) return `turns 65 on ${t65}: benefits unrestricted`;
  return '';
}

async function memberCard(args) {
  const m = await findMember(args[0]);
  const [b] = await db.query(`select * from member_balances where member_id = $1`, [m.id]);
  const years = await db.query(`select fy, concessional, concessional_cap, carry_forward_available, carry_forward_usable, concessional_room, non_concessional, ncc_limit, ncc_room, tsb_prior from contribution_room where member_id = $1 order by fy desc`, [m.id]);
  const pensions = await db.query(`select number, kind, fy, opening_balance, minimum, maximum, paid, left_to_pay from pension_status where member_id = $1 order by fy desc, number`, [m.id]);
  const txns = await db.query(`select txn_on, kind, contribution_type, amount, description from transactions where member_id = $1 order by txn_on desc limit 12`, [m.id]);
  const data = { member: m, balance: b, contributions: years, pensions, transactions: txns };
  out(data, () => [heading(`${m.full_name}, ${m.fund} ${m.fund_name}`),
    `  Born ${isoDate(m.date_of_birth)}, age ${b.age_now}. ${m.retired ? 'Retired (condition of release met).' : 'Not retired.'} Balance ${aud(b.balance_now)} (1 July ${aud(b.opening_balance)}).`,
    b.personal_tbc ? `  Transfer balance ${aud(b.transfer_balance)} of a personal cap of ${aud(b.personal_tbc)}.` : '',
    '\n  Contributions against the caps\n' + contributionTable(years),
    pensions.length ? '\n  Pensions\n' + pensionTable(pensions, true) : '',
    '\n  Recent transactions\n' + table(txns, [{ key: 'txn_on', label: 'Date', format: isoDate }, { key: 'kind', label: 'Kind' }, { key: 'contribution_type', label: 'Type', format: (v) => v || '' },
      { key: 'amount', label: 'Amount', align: 'right', format: aud }, { key: 'description', label: 'Description', format: (v) => truncate(v, 50) }]),
  ].filter(Boolean).join('\n'));
}

// ---------------------------------------------------------------- contributions

function contributionTable(rows, withMember = false) {
  return table(rows, [
    ...(withMember ? [{ key: 'fund', label: 'Fund' }, { key: 'member', label: 'Member' }] : []),
    { key: 'fy', label: 'Year' },
    { key: 'concessional', label: 'Concessional', align: 'right', format: aud },
    { key: 'concessional_cap', label: 'Cap', align: 'right', format: (v, r) => `${aud(v)}${r.carry_forward_usable && n(r.carry_forward_available) ? ` +${aud(r.carry_forward_available)} c/f` : ''}` },
    { key: 'concessional_room', label: 'Room', align: 'right', format: (v) => (n(v) < 0 ? `OVER ${aud(-n(v))}` : aud(v)) },
    { key: 'non_concessional', label: 'Non-conc.', align: 'right', format: aud },
    { key: 'ncc_limit', label: 'NCC limit', align: 'right', format: aud },
    { key: 'ncc_room', label: 'NCC room', align: 'right', format: (v) => (n(v) < 0 ? `OVER ${aud(-n(v))}` : aud(v)) },
  ]);
}

async function contributions(flags) {
  const f = flags.fund ? await findFund(flags.fund) : null;
  const fy = parseFy(flags.fy) || CUR_FY;
  const params = [fy];
  if (f) params.push(f.id);
  let rows = await db.query(`select * from contribution_room where fy = $1 ${f ? 'and fund_id = $2' : ''} order by concessional_room, fund, member`, params);
  if (flags.over) rows = rows.filter((r) => n(r.concessional_room) < CAP_WARN || n(r.ncc_room) < 0);
  out(rows, (d) => heading(`Contributions against the caps, ${fy}`) + '\n' + contributionTable(d, true) +
    '\n\n  Carry-forward counts only where the member\'s total super balance at the prior 30 June was under $500,000.');
  if (!JSON_OUT) { const note = await rulesNote(); if (note) console.log(note); }
}

async function contribute(args, flags) {
  const m = await findMember(args[0]);
  const amount = parseMoney(args[1]);
  if (!amount || amount <= 0) throw new CliError('How much? smsf contribute <member> <amount> --type=employer-sg');
  const type = str(flags.type);
  if (!CONTRIBUTION_TYPES.includes(type)) throw new CliError(`--type must be one of ${CONTRIBUTION_TYPES.join(', ')}`);
  const on = parseDate(flags.date) || today();
  const [t] = await db.query(`insert into transactions (fund_id, member_id, txn_on, kind, contribution_type, amount, description) values ($1,$2,$3,'contribution',$4,$5,$6) returning id`,
    [m.fund_id, m.id, on, type, amount, str(flags.desc) || null]);
  const [room] = await db.query(`select * from contribution_room where member_id = $1 and fy = fy_of($2::date)`, [m.id, on]);
  const data = { id: t.id, member: m.full_name, amount, type, on, concessional_room: n(room.concessional_room), ncc_room: n(room.ncc_room) };
  out(data, (d) => `  ${aud(d.amount)} ${d.type} for ${d.member} on ${d.on}. Concessional room now ${aud(d.concessional_room)}, non-concessional room ${aud(d.ncc_room)}.` +
    (d.concessional_room < 0 || d.ncc_room < 0 ? '\n  This takes the member over a cap. Check before the year ends.' : ''));
}

// ---------------------------------------------------------------- pensions

function pensionTable(rows, withYear = false) {
  return table(rows, [
    { key: 'number', label: 'Pension' }, ...(rows[0]?.fund !== undefined ? [{ key: 'fund', label: 'Fund' }] : []),
    ...(rows[0]?.member !== undefined ? [{ key: 'member', label: 'Member' }] : []), { key: 'kind', label: 'Kind' },
    ...(withYear ? [{ key: 'fy', label: 'Year' }] : []),
    { key: 'minimum', label: 'Minimum', align: 'right', format: aud }, { key: 'maximum', label: 'Max (TTR)', align: 'right', format: aud },
    { key: 'paid', label: 'Paid', align: 'right', format: aud },
    { key: 'left_to_pay', label: 'Left to pay', align: 'right', format: (v, r) => (r.maximum !== null && n(r.paid) > n(r.maximum) ? `OVER MAX ${aud(n(r.paid) - n(r.maximum))}` : aud(v)) },
  ]);
}

// How far through the financial year we are, and what a pension should have paid by now.
function behindPace(p) {
  const start = new Date(`${p.fy.slice(0, 4)}-07-01T00:00:00`);
  const end = new Date(`${Number(p.fy.slice(0, 4)) + 1}-06-30T00:00:00`);
  const now = new Date(`${today()}T00:00:00`);
  const frac = Math.min(1, Math.max(0, (now - start) / (end - start)));
  const expected = n(p.minimum) * frac;
  return n(p.minimum) > 0 && n(p.paid) < expected - n(p.minimum) / 12;
}

async function pensions(flags) {
  const fy = parseFy(flags.fy) || CUR_FY;
  const f = flags.fund ? await findFund(flags.fund) : null;
  let rows = await db.query(`select * from pension_status where fy = $1 ${f ? 'and fund_id = $2' : ''} order by left_to_pay desc, number`, f ? [fy, f.id] : [fy]);
  rows = rows.map((r) => ({ ...r, behind: fy === CUR_FY ? behindPace(r) : n(r.left_to_pay) > 0 }));
  if (flags.behind) rows = rows.filter((r) => r.behind || r.over_maximum);
  out(rows, (d) => heading(`Pensions, ${fy}: the minimum, the TTR maximum and what has been paid`) + '\n' + pensionTable(d) +
    `\n\n  ${fy === CUR_FY ? `${d.filter((x) => x.behind).length} behind pace. ` : ''}Minimum: Schedule 7 factor by age, pro-rated in the first year, nil if started on or after 1 June, rounded to the nearest $10.`);
}

async function pay(args, flags) {
  const p = await findPension(args[0]);
  const amount = parseMoney(args[1]);
  if (!amount || amount <= 0) throw new CliError('How much? smsf pay <pension> <amount> [--date]');
  const on = parseDate(flags.date) || today();
  const [m] = await db.query(`select fund_id from members where id = $1`, [p.member_id]);
  await db.query(`insert into transactions (fund_id, member_id, pension_id, txn_on, kind, amount, description) values ($1,$2,$3,$4,'pension',$5,$6)`,
    [m.fund_id, p.member_id, p.id, on, amount, str(flags.desc) || 'Pension payment']);
  const [s] = await db.query(`select * from pension_status where pension_id = $1 and fy = fy_of($2::date)`, [p.id, on]);
  const data = { pension: p.number, member: p.member, amount, on, paid: n(s?.paid), minimum: n(s?.minimum), left_to_pay: n(s?.left_to_pay), over_maximum: !!s?.over_maximum };
  out(data, (d) => `  ${aud(d.amount)} paid to ${d.member} (${d.pension}) on ${d.on}. ${aud(d.paid)} of the ${aud(d.minimum)} minimum paid; ${aud(d.left_to_pay)} left.` +
    (d.over_maximum ? '\n  This takes a transition to retirement pension over its 10% maximum.' : '') + (s ? '' : '\n  No balance on file for this pension this year: add it with smsf pension-year.'));
}

async function pensionNew(args, flags) {
  const m = await findMember(args[0]);
  const kind = str(flags.kind) || 'account-based';
  if (!['account-based', 'ttr'].includes(kind)) throw new CliError('--kind is account-based or ttr');
  const balance = parseMoney(flags.balance);
  if (balance === null) throw new CliError('What is the pension account balance on the day it starts? --balance=500000');
  const on = parseDate(flags.date) || today();
  const [{ next }] = await db.query(`select 'P-' || lpad((coalesce(max(substring(number from '[0-9]+$')::int), 0) + 1)::text, 4, '0') as next from pensions`);
  await db.exec('BEGIN');
  try {
    const [p] = await db.query(`insert into pensions (number, member_id, kind, commenced_on) values ($1,$2,$3,$4) returning id`, [next, m.id, kind, on]);
    await db.query(`insert into pension_years (pension_id, fy, opening_balance) values ($1, fy_of($2::date), $3)`, [p.id, on, balance]);
    await db.exec('COMMIT');
  } catch (e) { await db.exec('ROLLBACK'); throw e; }
  const [s] = await db.query(`select * from pension_status where number = $1`, [next]);
  out(s, (d) => `  ${d.number} started for ${d.member} on ${on}: ${kind}, ${aud(balance)}. Minimum this year ${aud(d.minimum)}${d.maximum ? `, maximum ${aud(d.maximum)}` : ''}.`);
}

async function pensionYear(args, flags) {
  const p = await findPension(args[0]);
  const fy = parseFy(flags.fy) || CUR_FY;
  const balance = parseMoney(args[1] ?? flags.balance);
  if (balance === null) throw new CliError('smsf pension-year <pension> <balance at 1 July> [--fy=2026-27]');
  await db.query(`insert into pension_years (pension_id, fy, opening_balance) values ($1,$2,$3) on conflict (pension_id, fy) do update set opening_balance = excluded.opening_balance`, [p.id, fy, balance]);
  const [s] = await db.query(`select * from pension_status where pension_id = $1 and fy = $2`, [p.id, fy]);
  out(s, (d) => `  ${d.number} ${d.member}, ${fy}: balance ${aud(balance)}, age ${d.age}, factor ${pct(d.percent)}, minimum ${aud(d.minimum)}.`);
}

// ---------------------------------------------------------------- investments

async function investments(flags) {
  const f = flags.fund ? await findFund(flags.fund) : null;
  const where = ['i.sold_on is null'];
  const params = [];
  if (f) { params.push(f.id); where.push(`i.fund_id = $${params.length}`); }
  if (flags['in-house']) where.push('i.in_house');
  if (flags.related) where.push('(i.related_party or i.acquired_from_related)');
  const rows = await db.query(`select f.code as fund, i.code, i.name, i.asset_class, i.units, i.cost, i.market_value, i.valued_on, i.valuation_basis, i.related_party, i.in_house, i.acquired_from_related
    from investments i join funds f on f.id = i.fund_id where ${where.join(' and ')} order by f.code, i.market_value desc`, params);
  const totals = await db.query(`select fund, total, cash, in_house_pct, oldest_valuation from fund_assets ${f ? 'where fund_id = $1' : ''} order by fund`, f ? [f.id] : []);
  out({ holdings: rows, funds: totals }, (d) => heading('Investments') + '\n' + table(d.holdings, [{ key: 'fund', label: 'Fund' }, { key: 'code', label: 'Code' }, { key: 'name', label: 'Holding', width: 44 },
    { key: 'asset_class', label: 'Class' }, { key: 'market_value', label: 'Value', align: 'right', format: aud }, { key: 'cost', label: 'Cost', align: 'right', format: aud },
    { key: 'valued_on', label: 'Valued', format: isoDate }, { key: 'in_house', label: 'Flags', format: (v, r) => [r.related_party ? 'related' : '', v ? 'in-house' : '', r.acquired_from_related ? 'bought from related' : ''].filter(Boolean).join(', ') }]) +
    '\n\n  By fund\n' + table(d.funds, [{ key: 'fund', label: 'Fund' }, { key: 'total', label: 'Total', align: 'right', format: aud }, { key: 'cash', label: 'Cash', align: 'right', format: aud },
      { key: 'in_house_pct', label: 'In-house', align: 'right', format: (v) => `${pct(v)}${n(v) > IN_HOUSE_LIMIT_PCT ? ' OVER 5%' : ''}` }, { key: 'oldest_valuation', label: 'Oldest price', format: isoDate }]));
}

async function value(args, flags) {
  const f = await findFund(args[0]);
  const code = str(args[1]);
  const mv = parseMoney(args[2]);
  if (!code || mv === null) throw new CliError('smsf value <fund> <holding code> <market value> [--date] [--basis=".."]');
  const rows = await db.query(`select * from investments where fund_id = $1 and (lower(code) = lower($2) or name ilike $3)`, [f.id, code, `%${code}%`]);
  if (!rows.length) throw new CliError(`No holding "${code}" in ${f.code}. Run: smsf investments --fund=${f.code}`);
  if (rows.length > 1) throw ambiguous('holding', rows, (r) => `${r.code}  ${r.name}`);
  const on = parseDate(flags.date) || today();
  await db.query(`update investments set market_value = $2, valued_on = $3, valuation_basis = coalesce($4, valuation_basis) where id = $1`, [rows[0].id, mv, on, str(flags.basis) || null]);
  out({ fund: f.code, code: rows[0].code, market_value: mv, valued_on: on }, (d) => `  ${d.fund} ${d.code} valued at ${aud(d.market_value)} on ${d.valued_on}.`);
}

async function invest(args, flags) {
  const f = await findFund(args[0]);
  const code = str(args[1]);
  const cls = str(flags.class);
  if (!code || !flags.name) throw new CliError('smsf invest <fund> <code> --name=".." --class=listed-shares --value=10000 [--cost] [--units] [--related] [--in-house] [--from-related]');
  if (!ASSET_CLASSES.includes(cls)) throw new CliError(`--class must be one of ${ASSET_CLASSES.join(', ')}`);
  const mv = parseMoney(flags.value) ?? 0;
  await db.query(`insert into investments (fund_id, code, name, asset_class, units, cost, market_value, valued_on, valuation_basis, related_party, in_house, acquired_on, acquired_from_related)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [f.id, code, str(flags.name), cls, flags.units ? Number(flags.units) : null, parseMoney(flags.cost) ?? mv, mv, parseDate(flags.date) || today(),
    str(flags.basis) || null, !!flags.related, !!flags['in-house'], parseDate(flags.acquired) || parseDate(flags.date) || today(), !!flags['from-related']]);
  const [a] = await db.query(`select * from fund_assets where fund_id = $1`, [f.id]);
  out({ fund: f.code, code, in_house_pct: n(a.in_house_pct) }, (d) => `  Added ${code} to ${f.code}. In-house assets now ${pct(d.in_house_pct)} of the fund.` + (d.in_house_pct > IN_HOUSE_LIMIT_PCT ? ' That is over the 5% limit.' : ''));
}

// ---------------------------------------------------------------- bank lines

async function uncoded(flags) {
  const f = flags.fund ? await findFund(flags.fund) : null;
  const rows = await db.query(`select t.id, f.code as fund, t.txn_on, t.amount, t.description from transactions t join funds f on f.id = t.fund_id
    where t.kind = 'uncoded' ${f ? 'and t.fund_id = $1' : ''} order by t.txn_on`, f ? [f.id] : []);
  const data = rows.map((r) => ({ ...r, ref: r.id.slice(0, 8) }));
  out(data, (d) => heading('Bank lines to code') + '\n' + table(d, [{ key: 'ref', label: 'Ref' }, { key: 'fund', label: 'Fund' }, { key: 'txn_on', label: 'Date', format: isoDate },
    { key: 'amount', label: 'Amount', align: 'right', format: aud }, { key: 'description', label: 'Bank narrative' }]) +
    '\n\n  Code one: smsf code <ref> --kind=contribution --member="Raj Patel" --type=employer-sg');
}

async function code(args, flags) {
  const t = await findTxn(args[0]);
  const kind = str(flags.kind);
  if (!KINDS.includes(kind)) throw new CliError(`--kind must be one of ${KINDS.join(', ')}`);
  let memberId = null, pensionId = null, investmentId = null, ctype = null;
  if (flags.member) {
    const m = await findMember(flags.member);
    if (m.fund_id !== t.fund_id) throw new CliError(`${m.full_name} is not a member of ${t.fund}.`);
    memberId = m.id;
  }
  if (kind === 'contribution') {
    ctype = str(flags.type);
    if (!CONTRIBUTION_TYPES.includes(ctype)) throw new CliError(`A contribution needs --type, one of ${CONTRIBUTION_TYPES.join(', ')}`);
    if (!memberId) throw new CliError('A contribution needs the member it is for: --member="..". Contributions must be allocated within 28 days after the end of the month.');
  }
  if (kind === 'pension') {
    const p = await findPension(flags.pension || flags.member);
    pensionId = p.id; memberId = p.member_id;
  }
  if (flags.holding) {
    const [i] = await db.query(`select id from investments where fund_id = $1 and lower(code) = lower($2)`, [t.fund_id, str(flags.holding)]);
    if (!i) throw new CliError(`No holding "${flags.holding}" in ${t.fund}.`);
    investmentId = i.id;
  }
  await db.query(`update transactions set kind = $2, contribution_type = $3, member_id = $4, pension_id = $5, investment_id = $6, description = coalesce($7, description) where id = $1`,
    [t.id, kind, ctype, memberId, pensionId, investmentId, str(flags.desc) || null]);
  out({ id: t.id, kind, contribution_type: ctype }, () => `  ${t.fund} ${isoDate(t.txn_on)} ${aud(t.amount)} coded as ${kind}${ctype ? ` (${ctype})` : ''}.`);
}

async function addTxn(args, flags) {
  const f = await findFund(args[0]);
  const kind = str(args[1]);
  const amount = parseMoney(args[2]);
  if (![...KINDS, 'uncoded'].includes(kind) || !amount) throw new CliError(`smsf add <fund> <${KINDS.join('|')}> <amount> [--date] [--member] [--holding] [--desc]`);
  if (kind === 'contribution' || kind === 'pension') throw new CliError(`Use smsf ${kind === 'contribution' ? 'contribute' : 'pay'} for that, so the caps and minimums are checked.`);
  const m = flags.member ? await findMember(flags.member) : null;
  const [i] = flags.holding ? await db.query(`select id from investments where fund_id = $1 and lower(code) = lower($2)`, [f.id, str(flags.holding)]) : [null];
  const on = parseDate(flags.date) || today();
  await db.query(`insert into transactions (fund_id, member_id, investment_id, txn_on, kind, amount, description) values ($1,$2,$3,$4,$5,$6,$7)`,
    [f.id, m?.id || null, i?.id || null, on, kind, amount, str(flags.desc) || null]);
  out({ fund: f.code, kind, amount, on }, (d) => `  ${d.fund}: ${d.kind} ${aud(d.amount)} on ${d.on}.`);
}

// ---------------------------------------------------------------- the year's jobs

async function jobs(flags) {
  const fy = parseFy(flags.fy) || prevFy(CUR_FY);
  const where = ['fy = $1'];
  const params = [fy];
  if (flags.stage) { params.push(str(flags.stage)); where.push(`stage = $${params.length}`); }
  if (flags.who) { params.push(str(flags.who).toUpperCase()); where.push(`upper(assigned) = $${params.length}`); }
  const rows = await db.query(`select * from job_board where ${where.join(' and ')} order by array_position($${params.length + 1}::text[], stage), due_on`, [...params, STAGES]);
  const byStage = STAGES.map((s) => ({ stage: s, count: rows.filter((r) => r.stage === s).length })).filter((x) => x.count);
  out(rows, (d) => heading(`Jobs for ${fy}`) + '\n' + table(d, [{ key: 'fund', label: 'Fund' }, { key: 'name', label: 'Fund name', width: 30 }, { key: 'stage', label: 'Stage' },
    { key: 'days_in_stage', label: 'Days there', align: 'right' }, { key: 'assigned', label: 'Who' }, { key: 'due_on', label: 'Lodgment due', format: isoDate },
    { key: 'days_to_due', label: 'Days left', align: 'right', format: (v, r) => (r.stage === 'lodged' ? 'lodged' : n(v) < 0 ? `${-n(v)} LATE` : v) },
    { key: 'open_queries', label: 'Queries', align: 'right' }]) + '\n\n  ' + byStage.map((x) => `${x.stage} ${x.count}`).join(' | '));
}

async function job(args, flags) {
  const { fund, job: j, fy } = await findJob(args[0], parseFy(flags.fy));
  const changes = {};
  if (flags.stage) {
    const s = str(flags.stage);
    if (!STAGES.includes(s)) throw new CliError(`--stage must be one of ${STAGES.join(', ')}`);
    changes.stage = s;
  }
  if (flags.hours) changes.hours = flags.hours;
  if (flags.due) changes.due_on = parseDate(flags.due);
  if (flags.fee) changes.fee = parseMoney(flags.fee);
  if (flags.assign) changes.assigned_id = (await findStaff(str(flags.assign))).id;
  if (!Object.keys(changes).length) {
    if (!j) throw new CliError(`No ${fy} job for ${fund.code}. Open one: smsf job ${fund.code} --fy=${fy} --stage=not-started --due=YYYY-MM-DD`);
    const queries = await db.query(`select number, raised_on, waiting_on, status, question, answered_on from audit_queries where job_id = $1 order by number`, [j.job_id]);
    return out({ job: j, queries }, (d) => [heading(`${fund.code} ${fund.name}: ${fy}`),
      `  Stage ${j.stage} for ${j.days_in_stage} days. ${j.assigned || 'Nobody'} has it. Lodgment due ${isoDate(j.due_on) || 'not set'}${j.days_to_due !== null && j.stage !== 'lodged' ? ` (${n(j.days_to_due) < 0 ? `${-n(j.days_to_due)} days late` : `${j.days_to_due} days`})` : ''}.`,
      `  Records requested ${isoDate(j.records_requested_on) || '-'}, in ${isoDate(j.records_in_on) || '-'}. To auditor ${isoDate(j.sent_to_auditor_on) || '-'}, signed ${isoDate(j.audit_signed_on) || '-'}, lodged ${isoDate(j.lodged_on) || '-'}.`,
      `  ${n(j.hours)} hours, fee ${aud(j.fee)}, margin ${aud(j.margin)}.`,
      d.queries.length ? '\n  Audit queries\n' + table(d.queries, [{ key: 'number', label: 'Query' }, { key: 'raised_on', label: 'Raised', format: isoDate }, { key: 'status', label: 'Status' },
        { key: 'waiting_on', label: 'Waiting on' }, { key: 'question', label: 'Question', format: (v) => truncate(v, 70) }]) : ''].filter(Boolean).join('\n'));
  }
  // Moving stage stamps the matching date, so the board and the audit trail agree.
  const stamp = { 'records-requested': 'records_requested_on', 'records-in': 'records_in_on', 'with-auditor': 'sent_to_auditor_on', signed: 'audit_signed_on', lodged: 'lodged_on' };
  if (!j) {
    await db.query(`insert into jobs (fund_id, fy, stage, due_on, fee, assigned_id) values ($1,$2,$3,$4,$5,$6)`,
      [fund.id, fy, changes.stage || 'not-started', changes.due_on || null, changes.fee ?? fund.annual_fee, changes.assigned_id || fund.manager_id]);
  } else {
    const sets = [];
    const params = [j.job_id];
    const add = (sql, v) => { params.push(v); sets.push(sql.replace('?', `$${params.length}`)); };
    if (changes.stage && changes.stage !== j.stage) {
      add('stage = ?', changes.stage); sets.push('stage_since = current_date');
      if (stamp[changes.stage]) sets.push(`${stamp[changes.stage]} = coalesce(${stamp[changes.stage]}, current_date)`);
    }
    if (changes.hours) {
      const h = String(changes.hours);
      const v = Number(h.replace(/^\+/, ''));
      if (!Number.isFinite(v)) throw new CliError('--hours is a number, or +2 to add two hours.');
      add(h.startsWith('+') ? 'hours = hours + ?' : 'hours = ?', v);
    }
    if (changes.due_on) add('due_on = ?', changes.due_on);
    if (changes.fee !== undefined) add('fee = ?', changes.fee);
    if (changes.assigned_id) add('assigned_id = ?', changes.assigned_id);
    if (sets.length) await db.query(`update jobs set ${sets.join(', ')} where id = $1`, params);
  }
  const [after] = await db.query(`select * from job_board where fund_id = $1 and fy = $2`, [fund.id, fy]);
  out(after, (d) => `  ${d.fund} ${fy}: ${d.stage}, ${d.assigned || 'unassigned'}, due ${isoDate(d.due_on) || 'not set'}, ${n(d.hours)} hours.`);
}

async function queries(flags) {
  const rows = await db.query(`select q.number, b.fund, b.fy, q.raised_on, current_date - q.raised_on as days_open, q.waiting_on, q.status, q.question, q.answer, b.assigned
    from audit_queries q join job_board b on b.job_id = q.job_id ${flags.all ? '' : "where q.status = 'open'"} order by q.status desc, q.raised_on`);
  out(rows, (d) => heading(flags.all ? 'Audit queries' : 'Open audit queries, oldest first') + '\n' + table(d, [{ key: 'number', label: 'Query' }, { key: 'fund', label: 'Fund' },
    { key: 'days_open', label: 'Days', align: 'right', format: (v, r) => (r.status === 'open' ? v : '') }, { key: 'waiting_on', label: 'Waiting on' }, { key: 'assigned', label: 'Who' },
    { key: 'question', label: 'Question', format: (v) => truncate(v, 80) }]));
}

async function query(args, flags) {
  const { fund, job: j } = await findJob(args[0], parseFy(flags.fy));
  const q = args.slice(1).join(' ').trim();
  if (!j) throw new CliError(`No job for ${fund.code} that year.`);
  if (!q) throw new CliError('What did the auditor ask? smsf query <fund> "question" [--waiting=trustee]');
  const [{ next }] = await db.query(`select 'Q-' || lpad((coalesce(max(substring(number from '[0-9]+$')::int), 0) + 1)::text, 4, '0') as next from audit_queries`);
  const waiting = str(flags.waiting) || 'practice';
  await db.query(`insert into audit_queries (job_id, number, question, waiting_on) values ($1,$2,$3,$4)`, [j.job_id, next, q, waiting]);
  if (j.stage === 'with-auditor') await db.query(`update jobs set stage = 'audit-queries', stage_since = current_date where id = $1`, [j.job_id]);
  out({ number: next, fund: fund.code }, (d) => `  ${d.number} logged on ${d.fund}, waiting on the ${waiting}.`);
}

async function answer(args) {
  const ref = String(args[0] || '').toUpperCase();
  const text = args.slice(1).join(' ').trim();
  if (!ref || !text) throw new CliError('smsf answer <Q-0001> "the answer sent to the auditor"');
  const want = /^\d+$/.test(ref) ? `Q-${ref.padStart(4, '0')}` : ref;
  const [q] = await db.query(`update audit_queries set answer = $2, answered_on = current_date, status = 'answered' where upper(number) = $1 returning job_id, number`, [want, text]);
  if (!q) throw new CliError(`No audit query "${args[0]}". Run: smsf queries`);
  const [{ open }] = await db.query(`select count(*) as open from audit_queries where job_id = $1 and status = 'open'`, [q.job_id]);
  if (n(open) === 0) await db.query(`update jobs set stage = 'with-auditor', stage_since = current_date where id = $1 and stage = 'audit-queries'`, [q.job_id]);
  out({ number: q.number, open_left: n(open) }, (d) => `  ${d.number} answered. ${d.open_left ? `${d.open_left} still open on this job.` : 'No queries left: the job goes back to the auditor.'}`);
}

async function profitability(flags) {
  const fy = parseFy(flags.fy) || prevFy(CUR_FY);
  const rows = await db.query(`select fund, name, assigned, stage, fee, hours, cost, margin, case when hours > 0 then round(fee / hours, 0) end as fee_per_hour from job_board where fy = $1 order by margin`, [fy]);
  const tot = rows.reduce((s, r) => ({ fee: s.fee + n(r.fee), cost: s.cost + n(r.cost), hours: s.hours + n(r.hours) }), { fee: 0, cost: 0, hours: 0 });
  out({ fy, jobs: rows, totals: tot }, (d) => heading(`Fee against time, ${fy}: worst first`) + '\n' + table(d.jobs, [{ key: 'fund', label: 'Fund' }, { key: 'name', label: 'Fund name', width: 32 },
    { key: 'assigned', label: 'Who' }, { key: 'stage', label: 'Stage' }, { key: 'hours', label: 'Hours', align: 'right' }, { key: 'fee', label: 'Fee', align: 'right', format: aud },
    { key: 'cost', label: 'Cost', align: 'right', format: aud }, { key: 'margin', label: 'Margin', align: 'right', format: aud }, { key: 'fee_per_hour', label: 'Fee/hour', align: 'right', format: aud }]) +
    `\n\n  ${d.totals.hours} hours, ${aud(d.totals.fee)} in fees, ${aud(d.totals.fee - d.totals.cost)} margin. Cost is hours at each person's hourly cost (smsf staff).`);
}

async function staff() {
  const rows = await db.query(`select s.code, s.full_name, s.role, s.hourly_cost,
      (select count(*) from funds f where f.manager_id = s.id) as funds,
      (select count(*) from jobs j where j.assigned_id = s.id and j.stage <> 'lodged') as open_jobs,
      (select coalesce(sum(j.hours), 0) from jobs j where j.assigned_id = s.id) as hours
    from staff s where s.active order by s.code`);
  out(rows, (d) => heading('Staff') + '\n' + table(d, [{ key: 'code', label: 'Code' }, { key: 'full_name', label: 'Name' }, { key: 'role', label: 'Role' },
    { key: 'hourly_cost', label: 'Cost/hour', align: 'right', format: aud }, { key: 'funds', label: 'Funds', align: 'right' }, { key: 'open_jobs', label: 'Open jobs', align: 'right' }, { key: 'hours', label: 'Hours', align: 'right' }]));
}

// ---------------------------------------------------------------- caps

async function caps() {
  const rows = await db.query(`select * from rules_years order by fy desc`);
  const factors = await db.query(`select age_from, percent from pension_factors order by age_from`);
  out({ years: rows, pension_factors: factors }, (d) => heading('Caps and thresholds on file') + '\n' + table(d.years, [{ key: 'fy', label: 'Year' },
    { key: 'concessional_cap', label: 'Concessional', align: 'right', format: aud }, { key: 'nonconcessional_cap', label: 'Non-concessional', align: 'right', format: aud },
    { key: 'general_tbc', label: 'Transfer balance cap', align: 'right', format: aud }, { key: 'carry_forward_tsb_limit', label: 'Carry-forward TSB', align: 'right', format: aud }]) +
    '\n\n  Pension minimum factors (SIS Regulations Schedule 7)\n' + table(d.pension_factors, [{ key: 'age_from', label: 'From age', align: 'right' }, { key: 'percent', label: 'Minimum', align: 'right', format: pct }]) +
    (d.years.some((y) => y.fy === CUR_FY) ? '' : `\n\n  No row for ${CUR_FY}. Add it from the ATO's key superannuation rates and thresholds page.`));
}

async function capsAdd(args, flags) {
  const fy = parseFy(args[0]);
  const cc = parseMoney(flags.cc), ncc = parseMoney(flags.ncc), tbc = parseMoney(flags.tbc);
  if (!fy || cc === null || ncc === null || tbc === null || !flags.source) throw new CliError('smsf caps-add 2027-28 --cc=32500 --ncc=130000 --tbc=2100000 --source="ATO key super rates, checked <date>"');
  await db.query(`insert into rules_years (fy, concessional_cap, nonconcessional_cap, general_tbc, source) values ($1,$2,$3,$4,$5)
    on conflict (fy) do update set concessional_cap = excluded.concessional_cap, nonconcessional_cap = excluded.nonconcessional_cap, general_tbc = excluded.general_tbc, source = excluded.source`, [fy, cc, ncc, tbc, str(flags.source)]);
  out({ fy, cc, ncc, tbc }, (d) => `  Caps for ${d.fy}: concessional ${aud(d.cc)}, non-concessional ${aud(d.ncc)}, transfer balance cap ${aud(d.tbc)}.`);
}

// ---------------------------------------------------------------- compliance

const RULES = [
  { id: 'R1', rule: 'Concessional contributions inside the cap', source: 'ITAA 1997 Division 291; caps from the ATO key superannuation rates and thresholds' },
  { id: 'R2', rule: 'Non-concessional contributions inside the cap', source: 'ITAA 1997 Division 292; bring-forward tiers from the ATO key rates' },
  { id: 'R3', rule: 'Contributions accepted only within the age rules', source: 'SIS Regulations 1994, reg 7.04' },
  { id: 'R4', rule: 'Pension minimum paid for every finished year', source: 'SIS Regulations 1994, reg 1.06(9A) and Schedule 7' },
  { id: 'R5', rule: 'Transition to retirement pension under 10%', source: 'SIS Regulations 1994, reg 6.01 (transition to retirement income stream)' },
  { id: 'R6', rule: 'Transfer balance inside the personal cap', source: 'ITAA 1997 Division 294' },
  { id: 'R7', rule: 'In-house assets no more than 5%', source: 'SIS Act 1993, Part 8 (sections 82 to 84)' },
  { id: 'R8', rule: 'No assets bought from related parties outside the exceptions', source: 'SIS Act 1993, section 66' },
  { id: 'R9', rule: 'Investment strategy reviewed in the last year, insurance considered', source: 'SIS Regulations 1994, reg 4.09' },
  { id: 'R10', rule: 'Auditor appointed 45 days before the return is due', source: 'SIS Act 1993, section 35C(1)' },
  { id: 'R11', rule: 'Contributions allocated within 28 days of month end', source: 'SIS Regulations 1994, reg 7.08(2)' },
  { id: 'R12', rule: 'Assets valued at market value at 30 June', source: 'SIS Regulations 1994, reg 8.02B' },
  { id: 'R13', rule: 'Annual return lodged by its due date', source: 'ATO SMSF annual return lodgment due dates (your lodgment program)' },
];

async function complianceRows() {
  const r1 = await db.query(`select fund, member as item, fy || ': ' || aud(concessional) || ' concessional, over by ' || aud(-concessional_room) as detail from contribution_room where concessional_room < 0 order by fy desc`);
  const r2 = await db.query(`select fund, member as item, fy || ': ' || aud(non_concessional) || ' non-concessional, limit ' || aud(ncc_limit) as detail from contribution_room where ncc_room < 0 order by fy desc`);
  const r3 = await db.query(`select f.code as fund, m.full_name as item, t.contribution_type || ' ' || aud(t.amount) || ' on ' || t.txn_on || ', age ' || age_on(m.date_of_birth, t.txn_on) as detail
    from transactions t join members m on m.id = t.member_id join funds f on f.id = t.fund_id
    where t.kind = 'contribution' and t.contribution_type not in ('employer-sg', 'downsizer')
      and t.txn_on > (date_trunc('month', m.date_of_birth + interval '75 years') + interval '1 month' - interval '1 day')::date + 28`);
  const r4 = await db.query(`select fund, number || ' ' || member as item, fy || ': paid ' || aud(paid) || ' of a ' || aud(minimum) || ' minimum' as detail from pension_status where fy < $1 and paid < minimum`, [CUR_FY]);
  const r5 = await db.query(`select fund, number || ' ' || member as item, fy || ': paid ' || aud(paid) || ', maximum ' || aud(maximum) as detail from pension_status where over_maximum`);
  const r6 = await db.query(`select fund, member as item, 'transfer balance ' || aud(transfer_balance) || ', personal cap ' || aud(personal_tbc) as detail from member_balances where personal_tbc is not null and transfer_balance > personal_tbc`);
  const r7 = await db.query(`select fund, name as item, round(in_house_pct, 1) || '% in-house (' || aud(in_house) || ' of ' || aud(total) || ')' as detail from fund_assets where in_house_pct > ${IN_HOUSE_LIMIT_PCT}`);
  const r8 = await db.query(`select f.code as fund, i.code as item, i.name || ', ' || i.asset_class as detail from investments i join funds f on f.id = i.fund_id
    where i.acquired_from_related and i.sold_on is null and i.asset_class not in ('listed-shares', 'business-property', 'managed-fund')`);
  const r9 = await db.query(`select code as fund, name as item, case when strategy_reviewed_on is null then 'never reviewed' when strategy_reviewed_on < current_date - 365 then 'last reviewed ' || strategy_reviewed_on else 'insurance not considered' end as detail
    from funds where status = 'active' and (strategy_reviewed_on is null or strategy_reviewed_on < current_date - 365 or not strategy_considers_insurance)`);
  const r10 = await db.query(`select fund, fy as item, stage || ', return due ' || due_on as detail from job_board where stage not in ('with-auditor', 'audit-queries', 'signed', 'lodged') and due_on is not null and due_on - 45 < current_date`);
  const r11 = await db.query(`select f.code as fund, t.txn_on::text as item, aud(t.amount) || ' ' || coalesce(t.description, '') as detail from transactions t join funds f on f.id = t.fund_id
    where t.kind = 'contribution' and t.member_id is null and current_date > (date_trunc('month', t.txn_on) + interval '1 month' - interval '1 day')::date + 28`);
  const r12 = await db.query(`select b.fund, i.code as item, b.fy || ' accounts: valued ' || coalesce(i.valued_on::text, 'never') || ', not at ' || fy_end(b.fy) as detail
    from job_board b join investments i on i.fund_id = b.fund_id
    where b.stage <> 'lodged' and (i.sold_on is null or i.sold_on > fy_end(b.fy)) and coalesce(i.acquired_on, fy_end(b.fy)) <= fy_end(b.fy) and (i.valued_on is null or i.valued_on < fy_end(b.fy))`);
  const r13 = await db.query(`select fund, fy as item, 'due ' || due_on || ', ' || stage as detail from job_board where stage <> 'lodged' and due_on < current_date`);
  const found = { R1: r1, R2: r2, R3: r3, R4: r4, R5: r5, R6: r6, R7: r7, R8: r8, R9: r9, R10: r10, R11: r11, R12: r12, R13: r13 };
  return RULES.map((x) => ({ ...x, count: found[x.id].length, items: found[x.id] }));
}

async function compliance() {
  const rows = await complianceRows();
  out(rows, (d) => heading('Compliance: the records against the rules in docs/compliance.md') + '\n' + table(d, [{ key: 'id', label: 'Rule' }, { key: 'rule', label: 'Check' }, { key: 'count', label: 'Breaches', align: 'right' },
    { key: 'items', label: 'Worst example', format: (v) => (v.length ? truncate(`${v[0].fund} ${v[0].item}: ${v[0].detail}`, 70) : 'clean') }]) +
    '\n\n  A records check, not advice. The trustees, the practice and the auditor make the calls. Sources are in docs/compliance.md.');
}

// ---------------------------------------------------------------- attention

async function attention() {
  const list = [];
  const push = (area, fund, what, action) => list.push({ area, fund, what, action });
  const actions = {
    R1: 'Tell the member; consider whether to release the excess or leave it taxed', R2: 'Tell the member; the release election is theirs', R3: 'Return the contribution within 30 days of finding it',
    R4: 'Pension rules not met for that year: talk to the auditor about the income stream and the tax on it', R5: 'Treat the excess as a lump sum only if allowed; tell the auditor', R6: 'Commute the excess and report it to the ATO',
    R7: 'Plan to bring in-house assets under 5% by the end of the next year', R8: 'Stop and get advice: this is a contravention the auditor must report', R9: 'Have the trustees review and minute the strategy',
    R10: 'Engage the auditor this week', R11: 'Find the member it belongs to and allocate it', R12: 'Get a 30 June value for the accounts', R13: 'Lodge it, or ask the ATO for more time',
  };
  for (const c of await complianceRows()) for (const i of c.items) push('compliance', i.fund, `${c.id} ${c.rule}: ${i.item}, ${i.detail}`, actions[c.id]);
  const ps = await db.query(`select * from pension_status where fy = $1 and status = 'active'`, [CUR_FY]);
  for (const p of ps) {
    if (n(p.minimum) > 0 && n(p.paid) === 0) push('pensions', p.fund, `${p.number} ${p.member}: nothing paid yet this year, minimum ${aud(p.minimum)}`, 'Set up the payments');
    else if (behindPace(p)) push('pensions', p.fund, `${p.number} ${p.member}: ${aud(p.paid)} of ${aud(p.minimum)} paid, behind pace`, 'Remind the trustee before June');
    else if (n(p.left_to_pay) > 0 && n(p.days_left) <= 60) push('pensions', p.fund, `${p.number} ${p.member}: ${aud(p.left_to_pay)} left with ${p.days_left} days to 30 June`, 'Pay before 30 June');
  }
  for (const c of await db.query(`select fund, member, concessional_room from contribution_room where fy = $1 and concessional_room >= 0 and concessional_room < ${CAP_WARN}`, [CUR_FY]))
    push('contributions', c.fund, `${c.member}: ${aud(c.concessional_room)} of concessional room left`, 'Warn the member before the next contribution');
  for (const m of await db.query(`select fund, member, (date_of_birth + interval '75 years')::date as on75 from member_balances
      where status = 'active' and (date_of_birth + interval '75 years')::date between greatest(current_date, fy_start($1)) and fy_end($1)`, [CUR_FY]))
    push('contributions', m.fund, `${m.member} turns 75 on ${isoDate(m.on75)}`, 'Any voluntary contribution must land within 28 days of the end of that month');
  for (const j of await db.query(`select fund, fy, records_requested_on from job_board where stage = 'records-requested' and records_requested_on < current_date - ${RECORDS_CHASE_DAYS}`))
    push('jobs', j.fund, `${j.fy} records requested ${isoDate(j.records_requested_on)} and not in`, 'Chase the trustee (/draft-records-request)');
  for (const j of await db.query(`select fund, fy, stage, days_in_stage from job_board where stage not in ('lodged', 'not-started', 'records-requested', 'with-auditor') and days_in_stage > ${STUCK_DAYS}`))
    push('jobs', j.fund, `${j.fy} job in ${j.stage} for ${j.days_in_stage} days`, 'Find what is holding it and move it');
  for (const q of await db.query(`select q.number, b.fund, q.waiting_on, current_date - q.raised_on as days from audit_queries q join job_board b on b.job_id = q.job_id where q.status = 'open' and q.raised_on < current_date - ${QUERY_CHASE_DAYS}`))
    push('audit', q.fund, `${q.number} open ${q.days} days, waiting on the ${q.waiting_on}`, q.waiting_on === 'trustee' ? 'Chase the trustee' : 'Answer it (/draft-audit-response)');
  for (const u of await db.query(`select f.code as fund, count(*) as lines, sum(t.amount) as total from transactions t join funds f on f.id = t.fund_id where t.kind = 'uncoded' group by f.code order by f.code`))
    push('bank', u.fund, `${u.lines} bank lines not coded (${aud(u.total)})`, 'Code them (/bank)');
  for (const f of await db.query(`select code, strategy_reviewed_on from funds where status = 'active' and strategy_reviewed_on between current_date - 365 and current_date - 365 + ${STRATEGY_WARN_DAYS}`))
    push('trustees', f.code, `Investment strategy a year old on ${addDays(isoDate(f.strategy_reviewed_on), 365)}`, 'Book the review with the trustees');
  const note = await rulesNote();
  if (note) push('caps', null, `No caps on file for ${CUR_FY}`, 'Add them: smsf caps-add');
  out(list, (d) => heading('Needs attention, worst first') + '\n' + table(d, [{ key: 'area', label: 'Area' }, { key: 'fund', label: 'Fund', format: (v) => v || '' },
    { key: 'what', label: 'What', format: (v) => truncate(v, 84) }, { key: 'action', label: 'Action', format: (v) => truncate(v, 60) }]));
}

// The June checklist: what has to happen before 30 June so nothing is missed for the year.
async function eofy() {
  const pensionsLeft = await db.query(`select fund, number, member, kind, minimum, maximum, paid, left_to_pay from pension_status where fy = $1 and (left_to_pay > 0 or over_maximum) order by left_to_pay desc`, [CUR_FY]);
  const over = await db.query(`select fund, member, concessional_room, ncc_room from contribution_room where fy = $1 and (concessional_room < 0 or ncc_room < 0)`, [CUR_FY]);
  const room = await db.query(`select fund, member, concessional_room, carry_forward_usable from contribution_room where fy = $1 and concessional_room > 0 and carry_forward_usable and carry_forward_available > 0 order by concessional_room desc`, [CUR_FY]);
  const noi = await db.query(`select f.code as fund, m.full_name as member, sum(t.amount) as amount from transactions t join members m on m.id = t.member_id join funds f on f.id = t.fund_id
    where t.kind = 'contribution' and t.contribution_type = 'personal-deductible' and fy_of(t.txn_on) = $1 group by f.code, m.full_name order by f.code`, [CUR_FY]);
  const strategy = await db.query(`select code as fund, strategy_reviewed_on from funds where status = 'active' and (strategy_reviewed_on is null or strategy_reviewed_on < fy_end($1) - 365) order by code`, [CUR_FY]);
  const data = { fy: CUR_FY, pensions_left: pensionsLeft, over_cap: over, carry_forward_room: room, notice_of_intent: noi, strategy_reviews: strategy };
  out(data, (d) => [heading(`Before 30 June ${Number(d.fy.slice(0, 4)) + 1}`),
    `\n  1. Pension minimums still to pay (${d.pensions_left.length})\n` + pensionTable(d.pensions_left),
    `\n  2. Members over a cap (${d.over_cap.length})\n` + table(d.over_cap, [{ key: 'fund', label: 'Fund' }, { key: 'member', label: 'Member' }, { key: 'concessional_room', label: 'Concessional room', align: 'right', format: aud }, { key: 'ncc_room', label: 'NCC room', align: 'right', format: aud }]),
    `\n  3. Members who can still use carry-forward room (${d.carry_forward_room.length})\n` + table(d.carry_forward_room, [{ key: 'fund', label: 'Fund' }, { key: 'member', label: 'Member' }, { key: 'concessional_room', label: 'Room incl. carry-forward', align: 'right', format: aud }]),
    `\n  4. Personal deductible contributions needing a notice of intent (${d.notice_of_intent.length})\n` + table(d.notice_of_intent, [{ key: 'fund', label: 'Fund' }, { key: 'member', label: 'Member' }, { key: 'amount', label: 'Amount', align: 'right', format: aud }]),
    `\n  5. Investment strategies to review before year end (${d.strategy_reviews.length})\n` + table(d.strategy_reviews, [{ key: 'fund', label: 'Fund' }, { key: 'strategy_reviewed_on', label: 'Last reviewed', format: (v) => isoDate(v) || 'never' }]),
  ].join('\n'));
}

// ---------------------------------------------------------------- import from Simple Fund 360

// Simple Fund 360 reports saved as CSV (Excel export, then Save As CSV). Three files bring a fund
// across: the member list with balances, the investment summary, and the transaction listing.
// Column names vary between report layouts, so each field accepts the common headings. Rows
// match on fund code and member name, holding code, or the transaction's own reference, so
// running it twice changes nothing.
async function importCmd(args, flags) {
  const source = str(args[0]).toLowerCase();
  const kind = str(args[1]).toLowerCase();
  const file = args[2];
  const usage = 'smsf import bgl <members|investments|transactions> <file.csv> [--fund=CODE] [--fy=2025-26] [--dry-run]';
  if (!['bgl', 'sf360', 'simple-fund-360'].includes(source) || !['members', 'investments', 'transactions'].includes(kind) || !file) throw new CliError(usage);
  const rows = parseCsv(readFileSync(path.resolve(file), 'utf8'));
  const fallback = flags.fund ? await findFund(flags.fund) : null;
  const fy = parseFy(flags.fy) || CUR_FY;
  const problems = [];
  const summary = { kind, rows: rows.length, created: 0, updated: 0, unchanged: 0, problems };
  const fundFor = async (r, line) => {
    const ref = pick(r, 'Fund Code', 'Fund', 'Fund Name', 'Entity', 'Entity Code') || fallback?.code;
    if (!ref) { problems.push(`row ${line}: no fund (add --fund=CODE)`); return null; }
    const f = await findFund(ref).catch(() => null);
    if (!f) problems.push(`row ${line}: fund ${ref} not in the system (add it first)`);
    return f;
  };
  const dry = !!flags['dry-run'];
  if (!dry) await db.exec('BEGIN');
  try {
    for (const [i, r] of rows.entries()) {
      const line = i + 2;
      const f = await fundFor(r, line);
      if (!f) continue;
      if (kind === 'members') {
        const name = pick(r, 'Member Name', 'Member', 'Name', 'Full Name');
        const dob = parseDate(pick(r, 'Date of Birth', 'DOB', 'Birth Date'));
        if (!name || !dob) { problems.push(`row ${line}: no member name or date of birth`); continue; }
        const bal = parseMoney(pick(r, 'Opening Balance', 'Balance', 'Member Balance', 'Closing Balance', 'Total Balance')) ?? 0;
        const tsb = parseMoney(pick(r, 'Total Super Balance', 'TSB'));
        if (dry) { summary.created++; continue; }
        const [old] = await db.query(`select id from members where fund_id = $1 and lower(full_name) = lower($2)`, [f.id, name]);
        const [m] = await db.query(`insert into members (fund_id, full_name, date_of_birth, email, external_ref) values ($1,$2,$3,$4,'bgl')
          on conflict (fund_id, full_name) do update set date_of_birth = excluded.date_of_birth returning id`, [f.id, name, dob, pick(r, 'Email', 'Email Address') || null]);
        await db.query(`insert into member_years (member_id, fy, opening_balance, tsb_prior) values ($1,$2,$3,$4)
          on conflict (member_id, fy) do update set opening_balance = excluded.opening_balance, tsb_prior = coalesce(excluded.tsb_prior, member_years.tsb_prior)`, [m.id, fy, bal, tsb]);
        if (old) summary.updated++; else summary.created++;
      } else if (kind === 'investments') {
        const code = pick(r, 'Investment Code', 'Code', 'Security Code', 'ASX Code', 'Account Code');
        const name = pick(r, 'Investment Name', 'Investment', 'Description', 'Security Name', 'Name') || code;
        if (!code) { problems.push(`row ${line}: no investment code`); continue; }
        const cls = classify(pick(r, 'Investment Type', 'Asset Class', 'Type', 'Category'), name);
        const mv = parseMoney(pick(r, 'Market Value', 'Value', 'Current Value', 'Closing Market Value')) ?? 0;
        if (dry) { summary.created++; continue; }
        const [old] = await db.query(`select market_value from investments where fund_id = $1 and code = $2`, [f.id, code]);
        if (old && n(old.market_value) === mv) { summary.unchanged++; continue; }
        await db.query(`insert into investments (fund_id, code, name, asset_class, units, cost, market_value, valued_on, valuation_basis, external_ref) values ($1,$2,$3,$4,$5,$6,$7,$8,'Simple Fund 360 investment summary','bgl')
          on conflict (fund_id, code) do update set market_value = excluded.market_value, valued_on = excluded.valued_on, units = coalesce(excluded.units, investments.units)`,
          [f.id, code, name, cls, parseMoney(pick(r, 'Units', 'Quantity', 'Holding')), parseMoney(pick(r, 'Cost', 'Cost Base', 'Book Cost')), mv,
            parseDate(pick(r, 'Price Date', 'Valuation Date', 'As At', 'Date')) || `${Number(fy.slice(0, 4))}-06-30`]);
        if (old) summary.updated++; else summary.created++;
      } else {
        const on = parseDate(pick(r, 'Date', 'Transaction Date', 'Txn Date'));
        const amt = parseMoney(pick(r, 'Amount', 'Net Amount', 'Value', 'Debit', 'Credit'));
        if (!on || amt === null) { problems.push(`row ${line}: no date or amount`); continue; }
        const desc = pick(r, 'Description', 'Narration', 'Narrative', 'Details', 'Memo');
        const account = pick(r, 'Account', 'Account Name', 'Account Code', 'Ledger Account');
        const memberName = pick(r, 'Member', 'Member Name');
        const ref = pick(r, 'Reference', 'Transaction ID', 'Ref', 'ID') || `bgl-${on}-${amt}-${(desc || account).slice(0, 40)}`;
        const { kind: k, type } = classifyTxn(account, desc);
        if (dry) { summary.created++; continue; }
        const m = memberName ? (await db.query(`select id from members where fund_id = $1 and full_name ilike $2`, [f.id, memberName]))[0] : null;
        const [ins] = await db.query(`insert into transactions (fund_id, member_id, txn_on, kind, contribution_type, amount, description, source, external_ref) values ($1,$2,$3,$4,$5,$6,$7,'import',$8)
          on conflict (fund_id, external_ref) where external_ref is not null do nothing returning id`, [f.id, m?.id || null, on, k, type, Math.abs(amt), desc || account || null, ref]);
        if (ins) summary.created++; else summary.unchanged++;
      }
    }
    if (!dry) await db.exec('COMMIT');
  } catch (e) { if (!dry) await db.exec('ROLLBACK'); throw e; }
  out(summary, (s) => [`  ${dry ? 'Dry run: would import' : 'Imported'} ${s.created + s.updated + s.unchanged} ${s.kind} rows of ${s.rows}.${dry ? '' : ` ${s.created} new, ${s.updated} updated, ${s.unchanged} unchanged.`}`,
    problems.length ? '  Not imported:\n' + problems.map((x) => `    - ${x}`).join('\n') : '',
    dry ? '' : '  Put the totals next to the same Simple Fund 360 report before you rely on them.'].filter(Boolean).join('\n'));
}

function classify(type, name) {
  const s = `${type} ${name}`.toLowerCase();
  if (/term deposit|\btd\b/.test(s)) return 'term-deposit';
  if (/cash|bank|saver|cma/.test(s)) return 'cash';
  if (/managed fund|unit trust|wholesale/.test(s)) return 'managed-fund';
  if (/residential/.test(s)) return 'residential-property';
  if (/property|real estate|building|warehouse/.test(s)) return 'business-property';
  if (/loan/.test(s)) return 'loan';
  if (/crypto|bitcoin/.test(s)) return 'crypto';
  if (/collectible|art|wine/.test(s)) return 'collectible';
  if (/share|listed|etf|equit|asx/.test(s)) return 'listed-shares';
  return 'other';
}

// The ledger account says what a line is. Anything it cannot place stays uncoded for a person.
function classifyTxn(account, desc) {
  const s = `${account} ${desc}`.toLowerCase();
  if (/contribution/.test(s)) {
    const type = /non.?concessional|personal after/.test(s) ? 'personal-non-concessional' : /salary sacrifice/.test(s) ? 'salary-sacrifice' : /personal/.test(s) ? 'personal-deductible'
      : /spouse/.test(s) ? 'spouse' : /downsizer/.test(s) ? 'downsizer' : 'employer-sg';
    return { kind: 'contribution', type };
  }
  if (/pension/.test(s)) return { kind: 'pension', type: null };
  if (/lump sum/.test(s)) return { kind: 'lump-sum', type: null };
  if (/rollover in|transfer in/.test(s)) return { kind: 'rollover-in', type: null };
  if (/rollover out|transfer out/.test(s)) return { kind: 'rollover-out', type: null };
  if (/dividend|distribution|interest|rent/.test(s)) return { kind: 'income', type: null };
  if (/income tax|tax paid|payg/.test(s)) return { kind: 'tax', type: null };
  if (/fee|levy|expense|insurance premium/.test(s)) return { kind: 'expense', type: null };
  return { kind: 'uncoded', type: null };
}

// ---------------------------------------------------------------- export and notes

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.join(';') : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function exportCmd(flags) {
  const dir = path.resolve(REPO_ROOT, str(flags.out) || 'exports');
  mkdirSync(dir, { recursive: true });
  const tables = ['rules_years', 'staff', 'funds', 'members', 'member_years', 'pensions', 'pension_years', 'investments', 'transactions', 'jobs', 'audit_queries', 'notes'];
  const counts = {};
  for (const t of tables) {
    const rows = await db.query(`select * from ${t} order by created_at`);
    const cols = rows.length ? Object.keys(rows[0]) : [];
    writeFileSync(path.join(dir, `${t}.csv`), [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n');
    counts[t] = rows.length;
  }
  out({ dir, counts }, () => `  Exported ${tables.length} tables to ${path.relative(REPO_ROOT, dir) || dir}: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
}

async function log(args, flags) {
  const f = await findFund(args[0]);
  const body = args.slice(1).join(' ').trim();
  if (!body) throw new CliError('What happened? smsf log <fund> "note text"');
  await db.query(`insert into notes (fund_id, body, author) values ($1,$2,$3)`, [f.id, body, str(flags.by) || null]);
  out({ fund: f.code, body }, () => `  Noted on ${f.code}.`);
}

async function fundNew(args, flags) {
  const code = str(args[0]).toUpperCase();
  const name = args.slice(1).join(' ').trim() || str(flags.name);
  if (!/^[A-Z0-9-]{2,12}$/.test(code) || !name) throw new CliError('smsf fund-new <CODE> "Fund name" [--trustee=".."] [--individual] [--manager=JT] [--fee=2500] [--auditor=".."] [--established=YYYY-MM-DD]');
  const mgr = flags.manager ? await findStaff(str(flags.manager)) : null;
  await db.query(`insert into funds (code, name, trustee_type, trustee_name, manager_id, annual_fee, auditor, established_on, abn) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [code, name, flags.individual ? 'individual' : 'corporate', str(flags.trustee) || null, mgr?.id || null, parseMoney(flags.fee), str(flags.auditor) || null, parseDate(flags.established), str(flags.abn) || null]);
  out({ code, name }, (d) => `  ${d.code} ${d.name} added. Next: its members (smsf member-new, or import bgl members).`);
}

async function memberNew(args, flags) {
  const f = await findFund(args[0]);
  const name = args.slice(1).join(' ').trim();
  const dob = parseDate(flags.dob, 'date of birth');
  if (!name || !dob) throw new CliError('smsf member-new <fund> "Full Name" --dob=YYYY-MM-DD [--balance=1 July balance] [--tsb=total super balance last 30 June] [--retired]');
  const [m] = await db.query(`insert into members (fund_id, full_name, date_of_birth, retired, email) values ($1,$2,$3,$4,$5) returning id`, [f.id, name, dob, !!flags.retired, str(flags.email) || null]);
  if (flags.balance || flags.tsb) await db.query(`insert into member_years (member_id, fy, opening_balance, tsb_prior) values ($1,$2,$3,$4)`, [m.id, CUR_FY, parseMoney(flags.balance) ?? 0, parseMoney(flags.tsb)]);
  out({ fund: f.code, member: name }, (d) => `  ${d.member} added to ${d.fund}.`);
}

async function memberYear(args, flags) {
  const m = await findMember(args[0]);
  const fy = parseFy(flags.fy) || CUR_FY;
  const cols = { balance: 'opening_balance', tsb: 'tsb_prior', 'carry-forward': 'cc_carry_forward', 'ncc-left': 'ncc_available', tbc: 'personal_tbc', 'transfer-balance': 'transfer_balance' };
  const given = Object.entries(cols).filter(([k]) => flags[k] !== undefined);
  if (!given.length) throw new CliError('smsf member-year <member> [--fy] [--balance] [--tsb] [--carry-forward] [--ncc-left] [--tbc] [--transfer-balance]');
  await db.query(`insert into member_years (member_id, fy) values ($1,$2) on conflict (member_id, fy) do nothing`, [m.id, fy]);
  const params = [m.id, fy];
  const sets = given.map(([k, c]) => { params.push(parseMoney(flags[k])); return `${c} = $${params.length}`; });
  await db.query(`update member_years set ${sets.join(', ')} where member_id = $1 and fy = $2`, params);
  const [r] = await db.query(`select * from contribution_room where member_id = $1 and fy = $2`, [m.id, fy]);
  out(r, (d) => `  ${m.full_name}, ${fy}: concessional room ${aud(d.concessional_room)}, non-concessional room ${aud(d.ncc_room)}.`);
}

async function strategy(args, flags) {
  const f = await findFund(args[0]);
  const on = parseDate(flags.date) || today();
  await db.query(`update funds set strategy_reviewed_on = $2, strategy_considers_insurance = $3 where id = $1`, [f.id, on, !!flags.insurance]);
  out({ fund: f.code, reviewed_on: on, insurance: !!flags.insurance }, (d) => `  ${d.fund} investment strategy reviewed ${d.reviewed_on}${d.insurance ? ', insurance considered' : ', insurance NOT considered: add --insurance once the minute says it was'}.`);
}

// ---------------------------------------------------------------- dispatch table

const HELP = `smsf: the SMSF administration CLI. Add --json to any read for machine output.

  Overview       stats | attention | compliance | eofy | profitability [--fy] | staff | caps
  Funds          funds | fund <fund> | fund-new <CODE> "name" [--trustee] [--individual] [--manager] [--fee] [--auditor] | strategy <fund> [--date] [--insurance] | log <fund> "note" [--by=JT]
  Members        members [--fund] | member <name> | member-new <fund> "name" --dob [--balance] [--tsb] [--retired]
                 member-year <member> [--fy] [--balance] [--tsb] [--carry-forward] [--ncc-left] [--tbc] [--transfer-balance]
  Contributions  contributions [--fund] [--fy] [--over] | contribute <member> <amount> --type=${CONTRIBUTION_TYPES.join('|')} [--date] [--desc]
  Pensions       pensions [--fund] [--fy] [--behind] | pay <pension> <amount> [--date] | pension-new <member> --balance=500000 [--kind=account-based|ttr] [--date]
                 pension-year <pension> <balance at 1 July> [--fy]
  Investments    investments [--fund] [--in-house] [--related] | value <fund> <code> <market value> [--date] [--basis]
                 invest <fund> <code> --name=".." --class=${ASSET_CLASSES.join('|')} --value= [--cost] [--units] [--related] [--in-house] [--from-related]
  Bank lines     uncoded [--fund] | code <ref> --kind=${KINDS.join('|')} [--member] [--type] [--pension] [--holding] | add <fund> <kind> <amount> [--date] [--desc]
  Jobs           jobs [--fy] [--stage] [--who] | job <fund> [--fy] [--stage=${STAGES.join('|')}] [--hours=+2] [--due] [--fee] [--assign]
                 queries [--all] | query <fund> "question" [--waiting=trustee|practice] | answer <Q-0001> "answer"
  Caps           caps-add <fy> --cc --ncc --tbc --source=".."
  Data           import bgl <members|investments|transactions> <file.csv> [--fund] [--fy] [--dry-run] | export [--out=dir]`;

const COMMANDS = {
  stats: () => stats(), attention: () => attention(), compliance: () => compliance(), eofy: () => eofy(), profitability: (a, f) => profitability(f), staff: () => staff(), caps: () => caps(),
  funds: () => funds(), fund: (a) => fundCard(a), 'fund-new': (a, f) => fundNew(a, f), 'member-new': (a, f) => memberNew(a, f), 'member-year': (a, f) => memberYear(a, f), strategy: (a, f) => strategy(a, f), log: (a, f) => log(a, f),
  members: (a, f) => members(f), member: (a) => memberCard(a),
  contributions: (a, f) => contributions(f), contribute: (a, f) => contribute(a, f),
  pensions: (a, f) => pensions(f), pay: (a, f) => pay(a, f), 'pension-new': (a, f) => pensionNew(a, f), 'pension-year': (a, f) => pensionYear(a, f),
  investments: (a, f) => investments(f), value: (a, f) => value(a, f), invest: (a, f) => invest(a, f),
  uncoded: (a, f) => uncoded(f), code: (a, f) => code(a, f), add: (a, f) => addTxn(a, f),
  jobs: (a, f) => jobs(f), job: (a, f) => job(a, f), queries: (a, f) => queries(f), query: (a, f) => query(a, f), answer: (a) => answer(a),
  'caps-add': (a, f) => capsAdd(a, f), import: (a, f) => importCmd(a, f), export: (a, f) => exportCmd(f),
};

const { args, flags } = parseArgv(process.argv.slice(2));
JSON_OUT = !!flags.json;
const cmd = args.shift();
if (!cmd || cmd === 'help' || flags.help || !COMMANDS[cmd]) {
  console.log(HELP);
  process.exit(cmd && cmd !== 'help' && !COMMANDS[cmd] ? 1 : 0);
}
db = await getDb();
try {
  [{ fy: CUR_FY }] = await db.query(`select fy_of(current_date) as fy`);
  await COMMANDS[cmd](args, flags);
} catch (e) {
  if (e instanceof CliError) { console.error(e.message); process.exitCode = e.code; }
  else { console.error(e.stack || e.message); process.exitCode = 2; }
} finally {
  await db.close();
}
