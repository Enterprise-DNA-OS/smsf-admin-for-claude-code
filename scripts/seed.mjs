#!/usr/bin/env node
// Loads supabase/seed.sql: Harbourside SMSF Partners, a fictional Sydney practice with eight
// funds, fourteen members, pensions, contributions, investments, bank lines, last year's jobs
// and the auditor's queries. Dates are relative to today's financial year and every insert
// skips what is already there, so re-running it is harmless.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDb, REPO_ROOT } from './lib/db.mjs';

export async function seed(db) {
  await db.exec(readFileSync(path.join(REPO_ROOT, 'supabase', 'seed.sql'), 'utf8'));
  const [c] = await db.query(`
    select (select count(*) from funds) as funds, (select count(*) from members) as members,
           (select count(*) from pensions) as pensions, (select count(*) from investments) as investments,
           (select count(*) from transactions) as transactions, (select count(*) from jobs) as jobs,
           (select count(*) from audit_queries) as queries, (select count(*) from staff) as staff`);
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Number(v)]));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const db = await getDb();
  try {
    const n = await seed(db);
    console.log(`seed: ${n.funds} funds, ${n.members} members, ${n.pensions} pensions, ${n.investments} investments, ${n.transactions} transactions, ${n.jobs} jobs, ${n.queries} audit queries, ${n.staff} staff`);
  } finally {
    await db.close();
  }
}
