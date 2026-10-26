-- SMSF Admin for Claude Code: the schema.
-- What an Australian accounting practice or SMSF specialist keeps for the self managed super
-- funds it administers: the funds and their trustees, members and their balances year by year,
-- contributions against the caps, pensions against the minimum (and the 10% maximum on a
-- transition to retirement pension), investments with their valuations and in-house flags, the
-- bank lines still to code, the year's job for each fund from records request to lodgment, the
-- auditor's queries, and the practice's staff and hours.
-- Plain Postgres. Runs the same on PGlite. Money is dollars and cents (numeric), dates are
-- calendar dates, a financial year is written '2026-27' and runs 1 July to 30 June.

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------- financial years

create or replace function fy_of(d date) returns text language sql immutable as $$
  select case when extract(month from d) >= 7
    then extract(year from d)::int::text || '-' || lpad(((extract(year from d)::int + 1) % 100)::text, 2, '0')
    else (extract(year from d)::int - 1)::text || '-' || lpad((extract(year from d)::int % 100)::text, 2, '0') end
$$;
create or replace function fy_start(fy text) returns date language sql immutable as $$ select make_date(left(fy, 4)::int, 7, 1) $$;
create or replace function fy_end(fy text) returns date language sql immutable as $$ select make_date(left(fy, 4)::int + 1, 6, 30) $$;
create or replace function fy_shift(fy text, years int) returns text language sql immutable as $$ select fy_of(make_date(left(fy, 4)::int + years, 7, 1)) $$;
-- Dollars as people read them: aud(37500) is '$37,500'.
create or replace function aud(v numeric) returns text language sql immutable as $$
  select case when v < 0 then '-' else '' end || '$' || to_char(abs(round(v)), 'FM999,999,999,990') $$;
create or replace function cur_fy() returns text language sql stable as $$ select fy_of(current_date) $$;
create or replace function age_on(dob date, d date) returns int language sql immutable as $$ select extract(year from age(d, dob))::int $$;

-- The caps and thresholds for each financial year. One row a year, entered from the ATO's key
-- superannuation rates and thresholds page. A year with no row falls back to the latest one on
-- file and every report says so, so add the new year's row each July.
create table if not exists rules_years (
  fy text primary key,
  concessional_cap numeric(14,2) not null,
  nonconcessional_cap numeric(14,2) not null,
  general_tbc numeric(14,2) not null,               -- general transfer balance cap; also the total super balance at which the NCC cap is nil
  carry_forward_tsb_limit numeric(14,2) not null default 500000,
  source text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into rules_years (fy, concessional_cap, nonconcessional_cap, general_tbc, source) values
  ('2024-25', 30000, 120000, 1900000, 'ATO key superannuation rates and thresholds, contributions caps and transfer balance cap'),
  ('2025-26', 30000, 120000, 2000000, 'ATO key superannuation rates and thresholds, contributions caps and transfer balance cap'),
  ('2026-27', 32500, 130000, 2100000, 'ATO key superannuation rates and thresholds, contributions caps and transfer balance cap')
on conflict (fy) do nothing;

-- Minimum annual payment percentage factors for account-based pensions, by age.
-- Superannuation Industry (Supervision) Regulations 1994, Schedule 7.
create table if not exists pension_factors (
  age_from int primary key,
  percent numeric(5,2) not null
);
insert into pension_factors (age_from, percent) values
  (0, 4), (65, 5), (75, 6), (80, 7), (85, 9), (90, 11), (95, 14)
on conflict (age_from) do nothing;

-- ---------------------------------------------------------------- the practice

create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                        -- initials, as on the job board: JT, MK
  full_name text not null,
  role text,
  hourly_cost numeric(10,2),                        -- what an hour of this person costs the practice
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists funds (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                        -- the practice's short code: HARR
  name text not null,
  abn text,
  trustee_type text not null default 'corporate' check (trustee_type in ('corporate', 'individual')),
  trustee_name text,
  established_on date,
  manager_id uuid references staff(id),
  status text not null default 'active' check (status in ('active', 'winding-up', 'closed')),
  contact_name text,
  contact_email text,
  auditor text,
  auditor_email text,
  annual_fee numeric(12,2),                         -- what the practice charges this fund a year
  strategy_reviewed_on date,                        -- when the trustees last reviewed the investment strategy
  strategy_considers_insurance boolean not null default false,
  external_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references funds(id) on delete cascade,
  full_name text not null,
  date_of_birth date not null,
  email text,
  joined_on date,
  retired boolean not null default false,           -- has met the retirement condition of release
  status text not null default 'active' check (status in ('active', 'exited')),
  external_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fund_id, full_name)
);

-- One row per member per financial year: the figures the caps are tested against.
create table if not exists member_years (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  fy text not null,
  opening_balance numeric(14,2) not null default 0, -- member balance in this fund at 1 July
  tsb_prior numeric(14,2),                          -- total super balance at the 30 June before, all funds (ATO online services)
  cc_carry_forward numeric(14,2) not null default 0, -- unused concessional cap amounts available, from ATO online services
  ncc_available numeric(14,2),                      -- set when the member is inside a bring-forward period: what is left of it
  personal_tbc numeric(14,2),                       -- the member's personal transfer balance cap
  transfer_balance numeric(14,2) not null default 0, -- credits to the transfer balance account less debits
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, fy)
);

create table if not exists pensions (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,                      -- P-0001
  member_id uuid not null references members(id) on delete cascade,
  kind text not null default 'account-based' check (kind in ('account-based', 'ttr')),
  commenced_on date not null,
  status text not null default 'active' check (status in ('active', 'commuted', 'ceased')),
  ceased_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The pension account balance at 1 July (or on the day it started, in its first year).
create table if not exists pension_years (
  id uuid primary key default gen_random_uuid(),
  pension_id uuid not null references pensions(id) on delete cascade,
  fy text not null,
  opening_balance numeric(14,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pension_id, fy)
);

create table if not exists investments (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references funds(id) on delete cascade,
  code text not null,                               -- ticker, account number or short name
  name text not null,
  asset_class text not null check (asset_class in ('cash', 'term-deposit', 'listed-shares', 'managed-fund', 'business-property',
    'residential-property', 'unlisted-trust', 'loan', 'collectible', 'crypto', 'other')),
  units numeric(18,4),
  cost numeric(14,2),
  market_value numeric(14,2) not null default 0,
  valued_on date,
  valuation_basis text,                             -- closing price, bank statement, independent valuation, trustee estimate
  related_party boolean not null default false,     -- held with or in a related party
  in_house boolean not null default false,          -- an in-house asset under SIS Act Part 8
  acquired_on date,
  acquired_from_related boolean not null default false,
  sold_on date,
  external_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fund_id, code)
);

-- Every money movement. Bank lines arrive as 'uncoded' and are coded to a kind (and a member,
-- a pension or an investment) by the person doing the job.
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references funds(id) on delete cascade,
  member_id uuid references members(id),
  pension_id uuid references pensions(id),
  investment_id uuid references investments(id),
  txn_on date not null,
  kind text not null check (kind in ('contribution', 'pension', 'lump-sum', 'rollover-in', 'rollover-out', 'income', 'expense',
    'purchase', 'sale', 'tax', 'uncoded')),
  contribution_type text check (contribution_type is null or contribution_type in ('employer-sg', 'salary-sacrifice',
    'personal-deductible', 'personal-non-concessional', 'spouse', 'downsizer')),
  amount numeric(14,2) not null check (amount >= 0),
  description text,
  source text not null default 'manual' check (source in ('manual', 'bank', 'import')),
  external_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists transactions_external on transactions (fund_id, external_ref) where external_ref is not null;

-- The year's work on one fund: records in, accounts, audit, lodgment.
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references funds(id) on delete cascade,
  fy text not null,
  stage text not null default 'not-started' check (stage in ('not-started', 'records-requested', 'records-in', 'in-progress',
    'review', 'with-auditor', 'audit-queries', 'signed', 'lodged')),
  stage_since date not null default current_date,
  assigned_id uuid references staff(id),
  due_on date,                                      -- lodgment due date from the practice's lodgment program
  records_requested_on date,
  records_in_on date,
  sent_to_auditor_on date,
  audit_signed_on date,
  lodged_on date,
  fee numeric(12,2),
  hours numeric(7,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fund_id, fy)
);

create table if not exists audit_queries (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  number text not null unique,                      -- Q-0001
  raised_on date not null default current_date,
  question text not null,
  waiting_on text not null default 'practice' check (waiting_on in ('practice', 'trustee')),
  answer text,
  answered_on date,
  status text not null default 'open' check (status in ('open', 'answered')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid references funds(id) on delete cascade,
  member_id uuid references members(id) on delete cascade,
  body text not null,
  author text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['rules_years', 'staff', 'funds', 'members', 'member_years', 'pensions', 'pension_years', 'investments',
    'transactions', 'jobs', 'audit_queries', 'notes'] loop
    execute format('drop trigger if exists %I_touch on %I', t, t);
    execute format('create trigger %I_touch before update on %I for each row execute function touch_updated_at()', t, t);
  end loop;
end $$;

create index if not exists members_fund on members (fund_id);
create index if not exists transactions_fund_day on transactions (fund_id, txn_on);
create index if not exists transactions_member on transactions (member_id, kind);
create index if not exists transactions_pension on transactions (pension_id);
create index if not exists investments_fund on investments (fund_id);

-- ---------------------------------------------------------------- views

-- Every member and every year they have figures or contributions in, against that year's caps.
-- Concessional: employer, salary sacrifice and personal deductible. Non-concessional: personal
-- after-tax and spouse. Downsizer counts towards neither. Carry-forward is usable only when the
-- total super balance at the prior 30 June was under the limit. The NCC limit follows the
-- bring-forward tiers worked from the year's cap and the general transfer balance cap.
create or replace view contribution_room as
select x.*,
  x.concessional_cap + case when x.carry_forward_usable then x.carry_forward_available else 0 end - x.concessional as concessional_room,
  x.ncc_limit - x.non_concessional as ncc_room
from (
  select m.id as member_id, f.id as fund_id, f.code as fund, m.full_name as member, g.fy,
    age_on(m.date_of_birth, fy_start(g.fy)) as age_at_1_july,
    r.fy as rules_fy, (r.fy <> g.fy) as rules_assumed,
    coalesce(c.concessional, 0) as concessional, r.concessional_cap,
    coalesce(my.cc_carry_forward, 0) as carry_forward_available,
    (my.tsb_prior is not null and my.tsb_prior < r.carry_forward_tsb_limit) as carry_forward_usable,
    coalesce(c.non_concessional, 0) as non_concessional, coalesce(c.downsizer, 0) as downsizer,
    my.tsb_prior, (my.ncc_available is not null) as in_bring_forward,
    case when my.ncc_available is not null then my.ncc_available
         when coalesce(my.tsb_prior, 0) >= r.general_tbc then 0
         when age_on(m.date_of_birth, fy_start(g.fy)) >= 75 then r.nonconcessional_cap
         when coalesce(my.tsb_prior, 0) < r.general_tbc - 2 * r.nonconcessional_cap then 3 * r.nonconcessional_cap
         when coalesce(my.tsb_prior, 0) < r.general_tbc - r.nonconcessional_cap then 2 * r.nonconcessional_cap
         else r.nonconcessional_cap end as ncc_limit
  from (select member_id, fy from member_years
        union select member_id, fy_of(txn_on) from transactions where member_id is not null and kind = 'contribution') g
  join members m on m.id = g.member_id
  join funds f on f.id = m.fund_id
  left join member_years my on my.member_id = g.member_id and my.fy = g.fy
  join lateral (select * from rules_years r where r.fy <= g.fy order by r.fy desc limit 1) r on true
  left join lateral (
    select sum(t.amount) filter (where t.contribution_type in ('employer-sg', 'salary-sacrifice', 'personal-deductible')) as concessional,
           sum(t.amount) filter (where t.contribution_type in ('personal-non-concessional', 'spouse')) as non_concessional,
           sum(t.amount) filter (where t.contribution_type = 'downsizer') as downsizer
    from transactions t where t.member_id = g.member_id and t.kind = 'contribution' and fy_of(t.txn_on) = g.fy) c on true
) x;

-- Every pension in every year it has a balance: the minimum (Schedule 7 factor, pro-rated in
-- the first year, nil if it started on or after 1 June, rounded to the nearest $10), the 10%
-- maximum for a transition to retirement pension, and what has been paid.
create or replace view pension_status as
select y.*,
  greatest(y.minimum - y.paid, 0) as left_to_pay,
  (y.maximum is not null and y.paid > y.maximum) as over_maximum,
  case when y.minimum = 0 then 100 else round(100 * y.paid / y.minimum) end as pct_paid
from (
  select p.id as pension_id, p.number, p.kind, p.commenced_on, p.status, m.id as member_id, m.full_name as member,
    f.id as fund_id, f.code as fund, py.fy, py.opening_balance,
    age_on(m.date_of_birth, greatest(p.commenced_on, fy_start(py.fy))) as age,
    pf.percent,
    case when p.commenced_on > fy_start(py.fy)
      then round((fy_end(py.fy) - p.commenced_on + 1)::numeric / (fy_end(py.fy) - fy_start(py.fy) + 1), 4) else 1 end as pro_rata,
    case when p.commenced_on >= make_date(left(py.fy, 4)::int + 1, 6, 1) then 0
      else round(py.opening_balance * pf.percent / 100
        * case when p.commenced_on > fy_start(py.fy) then (fy_end(py.fy) - p.commenced_on + 1)::numeric / (fy_end(py.fy) - fy_start(py.fy) + 1) else 1 end
        / 10) * 10 end as minimum,
    case when p.kind = 'ttr' then round(py.opening_balance * 0.10, 2) end as maximum,
    coalesce((select sum(t.amount) from transactions t where t.pension_id = p.id and t.kind = 'pension' and fy_of(t.txn_on) = py.fy), 0) as paid,
    (select max(t.txn_on) from transactions t where t.pension_id = p.id and t.kind = 'pension' and fy_of(t.txn_on) = py.fy) as last_paid_on,
    fy_end(py.fy) - current_date as days_left
  from pension_years py
  join pensions p on p.id = py.pension_id
  join members m on m.id = p.member_id
  join funds f on f.id = m.fund_id
  join lateral (select percent from pension_factors where age_from <= age_on(m.date_of_birth, greatest(p.commenced_on, fy_start(py.fy))) order by age_from desc limit 1) pf on true
) y;

-- Each member's balance so far this year: the 1 July figure plus what came in, less what went
-- out. Earnings and tax are allocated when the year's accounts are done.
create or replace view member_balances as
select m.id as member_id, m.full_name as member, f.id as fund_id, f.code as fund, m.date_of_birth,
  age_on(m.date_of_birth, current_date) as age_now, m.retired, m.status,
  coalesce(my.opening_balance, 0) as opening_balance,
  coalesce(sum(t.amount) filter (where t.kind in ('contribution', 'rollover-in')), 0) as inflows,
  coalesce(sum(t.amount) filter (where t.kind in ('pension', 'lump-sum', 'rollover-out')), 0) as outflows,
  coalesce(my.opening_balance, 0)
    + coalesce(sum(t.amount) filter (where t.kind in ('contribution', 'rollover-in')), 0)
    - coalesce(sum(t.amount) filter (where t.kind in ('pension', 'lump-sum', 'rollover-out')), 0) as balance_now,
  my.personal_tbc, coalesce(my.transfer_balance, 0) as transfer_balance
from members m
join funds f on f.id = m.fund_id
left join member_years my on my.member_id = m.id and my.fy = fy_of(current_date)
left join transactions t on t.member_id = m.id and fy_of(t.txn_on) = fy_of(current_date)
group by m.id, f.id, my.opening_balance, my.personal_tbc, my.transfer_balance;

-- Each fund's investments: total, cash, in-house share, related-party holdings, stale prices.
create or replace view fund_assets as
select f.id as fund_id, f.code as fund, f.name,
  coalesce(sum(i.market_value), 0) as total,
  coalesce(sum(i.market_value) filter (where i.asset_class in ('cash', 'term-deposit')), 0) as cash,
  coalesce(sum(i.market_value) filter (where i.in_house), 0) as in_house,
  case when coalesce(sum(i.market_value), 0) = 0 then 0
    else round(100 * coalesce(sum(i.market_value) filter (where i.in_house), 0) / sum(i.market_value), 2) end as in_house_pct,
  count(i.id) as holdings,
  min(i.valued_on) as oldest_valuation
from funds f
left join investments i on i.fund_id = f.id and i.sold_on is null
where f.status <> 'closed'
group by f.id;

-- The job board: every fund's job for a year, how long it has sat in its stage, the lodgment
-- date, open audit queries, and the fee against the hours.
create or replace view job_board as
select j.id as job_id, f.id as fund_id, f.code as fund, f.name, j.fy, j.stage, j.stage_since, current_date - j.stage_since as days_in_stage,
  s.code as assigned, j.due_on, j.due_on - current_date as days_to_due,
  j.records_requested_on, j.records_in_on, j.sent_to_auditor_on, j.audit_signed_on, j.lodged_on,
  (select count(*) from audit_queries q where q.job_id = j.id and q.status = 'open') as open_queries,
  j.fee, j.hours, round(j.hours * coalesce(s.hourly_cost, 0), 2) as cost,
  j.fee - round(j.hours * coalesce(s.hourly_cost, 0), 2) as margin
from jobs j
join funds f on f.id = j.fund_id
left join staff s on s.id = j.assigned_id;
