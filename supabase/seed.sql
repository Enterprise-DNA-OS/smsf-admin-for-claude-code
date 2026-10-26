-- Demo data: Harbourside SMSF Partners, a fictional Sydney accounting practice that administers
-- eight self managed super funds. Four staff, the funds and their members, this year's and last
-- year's balances, pensions, contributions, investments, bank lines, the year's jobs and the
-- auditor's queries. Every name, ABN and number is made up. Dates are relative to today's
-- financial year (members keep the same age at 1 July whenever you run it), and every insert
-- skips what is already there, so running it twice is harmless.
--
-- Problems are planted on purpose so /attention and /compliance have something to say: a member
-- over the concessional cap whose carry-forward is locked by their balance, a contribution
-- accepted from a 77 year old, last year's pension minimum missed, a transition to retirement
-- pension paid over its 10% maximum, a member over their transfer balance cap, a fund with 7.5%
-- in in-house assets, a residential unit bought from a relative, an investment strategy two
-- years old, a job not with the auditor inside 45 days of lodgment, a contribution sitting
-- unallocated, a property not valued at 30 June, a return past its due date, a new pension with
-- nothing paid yet, and bank lines nobody has coded.

insert into staff (code, full_name, role, hourly_cost) values
  ('RB', 'Rob Bennett', 'Partner', 160),
  ('JT', 'Jess Tran', 'SMSF manager', 95),
  ('MK', 'Marco Kelly', 'Senior accountant', 70),
  ('AL', 'Aisha Lee', 'Accountant', 55)
on conflict (code) do nothing;

insert into funds (code, name, abn, trustee_type, trustee_name, established_on, manager_id, contact_name, contact_email, auditor, auditor_email, annual_fee, strategy_reviewed_on, strategy_considers_insurance) values
  ('HARR', 'Harrington Family Super Fund', '41 600 112 001', 'corporate', 'Harrington Super Pty Ltd', '2009-08-01', (select id from staff where code = 'JT'), 'Peter Harrington', 'peter@example.com', 'Coastal SMSF Audit', 'audit@coastal.example.com', 3300, current_date - 120, true),
  ('NGUY', 'Nguyen Super Fund', '41 600 112 002', 'individual', 'Linh and Tuan Nguyen', '2018-03-12', (select id from staff where code = 'AL'), 'Linh Nguyen', 'linh@example.com', 'Coastal SMSF Audit', 'audit@coastal.example.com', 2200, current_date - 200, true),
  ('OKEE', 'O''Keefe Superannuation Fund', '41 600 112 003', 'corporate', 'O''Keefe Nominees Pty Ltd', '2001-11-20', (select id from staff where code = 'MK'), 'Brian O''Keefe', 'brian@example.com', 'Coastal SMSF Audit', 'audit@coastal.example.com', 2900, current_date - 300, true),
  ('CHEN', 'Chen Family Superannuation Fund', '41 600 112 004', 'corporate', 'Chen Super Pty Ltd', '2012-05-02', (select id from staff where code = 'JT'), 'Wei Chen', 'wei@example.com', 'Northside Audit Partners', 'smsf@northside.example.com', 3800, current_date - 760, false),
  ('MORR', 'Morrison Retirement Fund', '41 600 112 005', 'individual', 'Dave and Karen Morrison', '2015-09-30', (select id from staff where code = 'MK'), 'Dave Morrison', 'dave@example.com', 'Northside Audit Partners', 'smsf@northside.example.com', 2600, current_date - 90, true),
  ('PATE', 'Patel Super Fund', '41 600 112 006', 'corporate', 'Patel Super Pty Ltd', '2019-02-14', (select id from staff where code = 'AL'), 'Raj Patel', 'raj@example.com', 'Coastal SMSF Audit', 'audit@coastal.example.com', 2400, current_date - 340, true),
  ('WILS', 'Wilson Family Super Fund', '41 600 112 007', 'corporate', 'Wilson Super Pty Ltd', '2010-06-01', (select id from staff where code = 'AL'), 'Sue Wilson', 'sue@example.com', 'Coastal SMSF Audit', 'audit@coastal.example.com', 2000, current_date - 30, true),
  ('BREN', 'Brennan Super Fund', '41 600 112 008', 'corporate', 'Brennan Super Pty Ltd', fy_start(fy_shift(cur_fy(), -1)) + 20, (select id from staff where code = 'JT'), 'Sean Brennan', 'sean@example.com', 'Northside Audit Partners', 'smsf@northside.example.com', 2750, current_date - 150, true)
on conflict (code) do nothing;

-- Ages at 1 July of the current financial year stay fixed: 68, 65, 46, 48, 77, 74 (75 later this
-- year), 63, 61, 62, 52, 50, 70, 69, 66.
insert into members (fund_id, full_name, date_of_birth, email, joined_on, retired) values
  ((select id from funds where code = 'HARR'), 'Peter Harrington', (fy_start(cur_fy()) - interval '68 years')::date - 100, 'peter@example.com', '2009-08-01', true),
  ((select id from funds where code = 'HARR'), 'Margaret Harrington', (fy_start(cur_fy()) - interval '65 years')::date - 40, 'margaret@example.com', '2009-08-01', true),
  ((select id from funds where code = 'NGUY'), 'Linh Nguyen', (fy_start(cur_fy()) - interval '46 years')::date - 70, 'linh@example.com', '2018-03-12', false),
  ((select id from funds where code = 'NGUY'), 'Tuan Nguyen', (fy_start(cur_fy()) - interval '48 years')::date - 200, 'tuan@example.com', '2018-03-12', false),
  ((select id from funds where code = 'OKEE'), 'Brian O''Keefe', (fy_start(cur_fy()) - interval '77 years')::date - 150, 'brian@example.com', '2001-11-20', true),
  ((select id from funds where code = 'OKEE'), 'Maureen O''Keefe', (fy_start(cur_fy()) + 300 - interval '75 years')::date, 'maureen@example.com', '2001-11-20', true),
  ((select id from funds where code = 'CHEN'), 'Wei Chen', (fy_start(cur_fy()) - interval '63 years')::date - 20, 'wei@example.com', '2012-05-02', true),
  ((select id from funds where code = 'CHEN'), 'Mei Chen', (fy_start(cur_fy()) - interval '61 years')::date - 80, 'mei@example.com', '2012-05-02', false),
  ((select id from funds where code = 'MORR'), 'Dave Morrison', (fy_start(cur_fy()) - interval '62 years')::date - 30, 'dave@example.com', '2015-09-30', false),
  ((select id from funds where code = 'PATE'), 'Raj Patel', (fy_start(cur_fy()) - interval '52 years')::date - 10, 'raj@example.com', '2019-02-14', false),
  ((select id from funds where code = 'PATE'), 'Priya Patel', (fy_start(cur_fy()) - interval '50 years')::date - 90, 'priya@example.com', '2019-02-14', false),
  ((select id from funds where code = 'WILS'), 'Graham Wilson', (fy_start(cur_fy()) - interval '70 years')::date - 60, 'graham@example.com', '2010-06-01', true),
  ((select id from funds where code = 'WILS'), 'Sue Wilson', (fy_start(cur_fy()) - interval '69 years')::date - 120, 'sue@example.com', '2010-06-01', true),
  ((select id from funds where code = 'BREN'), 'Sean Brennan', (fy_start(cur_fy()) - interval '66 years')::date - 45, 'sean@example.com', fy_start(fy_shift(cur_fy(), -1)) + 20, true)
on conflict (fund_id, full_name) do nothing;

-- ---------------------------------------------------------------- member figures by year

insert into member_years (member_id, fy, opening_balance, tsb_prior, cc_carry_forward, ncc_available, personal_tbc, transfer_balance)
select m.id, v.fy, v.opening, v.tsb, v.cf, v.ncc, v.tbc, v.tb
from (values
  ('Peter Harrington', cur_fy(), 1180000, 1210000, 0, null::numeric, 1900000, 1050000),
  ('Peter Harrington', fy_shift(cur_fy(), -1), 1150000, 1170000, 0, null, 1900000, 1050000),
  ('Margaret Harrington', cur_fy(), 640000, 650000, 0, null, null, 0),
  ('Linh Nguyen', cur_fy(), 410000, 620000, 8000, null, null, 0),
  ('Tuan Nguyen', cur_fy(), 380000, 380000, 25000, null, null, 0),
  ('Brian O''Keefe', cur_fy(), 820000, 830000, 0, null, 1700000, 760000),
  ('Brian O''Keefe', fy_shift(cur_fy(), -1), 800000, 815000, 0, null, 1700000, 760000),
  ('Maureen O''Keefe', cur_fy(), 290000, 300000, 0, null, null, 0),
  ('Wei Chen', cur_fy(), 1450000, 1460000, 0, null, 1700000, 1745000),
  ('Wei Chen', fy_shift(cur_fy(), -1), 1400000, 1410000, 0, null, 1700000, 1745000),
  ('Mei Chen', cur_fy(), 210000, 215000, 0, null, null, 0),
  ('Dave Morrison', cur_fy(), 520000, 525000, 0, null, null, 0),
  ('Raj Patel', cur_fy(), 260000, 265000, 0, null, null, 0),
  ('Priya Patel', cur_fy(), 190000, 192000, 0, null, null, 0),
  ('Graham Wilson', cur_fy(), 540000, 545000, 0, null, 1600000, 610000),
  ('Sue Wilson', cur_fy(), 470000, 474000, 0, null, 1600000, 520000),
  ('Sean Brennan', cur_fy(), 980000, 990000, 0, null, 2000000, 975000),
  ('Sean Brennan', fy_shift(cur_fy(), -1), 975000, 0, 0, null, 2000000, 975000)
) as v(member, fy, opening, tsb, cf, ncc, tbc, tb)
join members m on m.full_name = v.member
on conflict (member_id, fy) do nothing;

-- ---------------------------------------------------------------- pensions

insert into pensions (number, member_id, kind, commenced_on) values
  ('P-0001', (select id from members where full_name = 'Peter Harrington'), 'account-based', '2014-07-01'),
  ('P-0002', (select id from members where full_name = 'Brian O''Keefe'), 'account-based', '2010-07-01'),
  ('P-0003', (select id from members where full_name = 'Wei Chen'), 'account-based', '2023-07-01'),
  ('P-0004', (select id from members where full_name = 'Dave Morrison'), 'ttr', '2024-07-01'),
  ('P-0005', (select id from members where full_name = 'Graham Wilson'), 'account-based', '2018-07-01'),
  ('P-0006', (select id from members where full_name = 'Sue Wilson'), 'account-based', '2018-07-01'),
  ('P-0007', (select id from members where full_name = 'Sean Brennan'), 'account-based', fy_end(fy_shift(cur_fy(), -1)) - 15)
on conflict (number) do nothing;

insert into pension_years (pension_id, fy, opening_balance)
select p.id, v.fy, v.balance
from (values
  ('P-0001', cur_fy(), 1180000), ('P-0001', fy_shift(cur_fy(), -1), 1150000),
  ('P-0002', cur_fy(), 820000), ('P-0002', fy_shift(cur_fy(), -1), 800000),
  ('P-0003', cur_fy(), 1450000), ('P-0003', fy_shift(cur_fy(), -1), 1400000),
  ('P-0004', cur_fy(), 400000),
  ('P-0005', cur_fy(), 520000),
  ('P-0006', cur_fy(), 450000),
  ('P-0007', cur_fy(), 980000), ('P-0007', fy_shift(cur_fy(), -1), 975000)
) as v(number, fy, balance)
join pensions p on p.number = v.number
on conflict (pension_id, fy) do nothing;

-- Pension payments. Monthly on the 15th-ish for Harrington and Wilson; Brian O'Keefe paid eight
-- of last year's instalments and stopped; Wei Chen paid last year's minimum in one go in June;
-- Dave Morrison drew a lump of his transition to retirement pension in July; Sean Brennan has
-- drawn nothing this year.
insert into transactions (fund_id, member_id, pension_id, txn_on, kind, amount, description, source, external_ref)
select m.fund_id, m.id, p.id, x.on_date, 'pension', x.amount, x.description, 'bank', x.ref
from (
  select 'P-0001' as number, fy_start(cur_fy()) + 14 + 30 * k as on_date, 4900 as amount, 'Pension payment' as description, 'demo-p1-cur-' || k as ref from generate_series(0, 11) k
  union all select 'P-0001', fy_start(fy_shift(cur_fy(), -1)) + 14 + 30 * k, 4800, 'Pension payment', 'demo-p1-prev-' || k from generate_series(0, 11) k
  union all select 'P-0002', fy_start(fy_shift(cur_fy(), -1)) + 30 + 30 * k, 5000, 'Pension payment', 'demo-p2-prev-' || k from generate_series(0, 7) k
  union all select 'P-0002', fy_start(cur_fy()) + 30 + 90 * k, 6000, 'Quarterly pension', 'demo-p2-cur-' || k from generate_series(0, 3) k
  union all select 'P-0003', fy_end(fy_shift(cur_fy(), -1)) - 10, 56000, 'Pension minimum for the year', 'demo-p3-prev'
  union all select 'P-0003', fy_start(cur_fy()) + 60 + 90 * k, 14500, 'Quarterly pension', 'demo-p3-cur-' || k from generate_series(0, 3) k
  union all select 'P-0004', least(fy_start(cur_fy()) + 20, current_date), 44000, 'TTR pension drawdown', 'demo-p4-cur'
  union all select 'P-0005', fy_start(cur_fy()) + 14 + 30 * k, 2200, 'Pension payment', 'demo-p5-cur-' || k from generate_series(0, 11) k
  union all select 'P-0006', fy_start(cur_fy()) + 14 + 30 * k, 1900, 'Pension payment', 'demo-p6-cur-' || k from generate_series(0, 11) k
) x
join pensions p on p.number = x.number
join members m on m.id = p.member_id
where x.on_date <= current_date
on conflict (fund_id, external_ref) where external_ref is not null do nothing;

-- ---------------------------------------------------------------- contributions

insert into transactions (fund_id, member_id, txn_on, kind, contribution_type, amount, description, source, external_ref)
select m.fund_id, m.id, x.on_date, 'contribution', x.ctype, x.amount, x.description, 'bank', x.ref
from (
  -- Linh Nguyen: SG and salary sacrifice past the cap; her carry-forward is locked because her
  -- total super balance is over $500,000.
  select 'Linh Nguyen' as member, fy_start(cur_fy()) + 28 + 30 * k as on_date, 'employer-sg' as ctype, 1500 as amount, 'Employer SG' as description, 'demo-c-linh-sg-' || k as ref from generate_series(0, 11) k
  union all select 'Linh Nguyen', least(fy_start(cur_fy()) + 10, current_date), 'salary-sacrifice', 33000, 'Salary sacrifice, bonus', 'demo-c-linh-ss'
  -- Tuan Nguyen: a big personal deductible contribution that fits because carry-forward is usable.
  union all select 'Tuan Nguyen', fy_start(cur_fy()) + 28 + 30 * k, 'employer-sg', 1167, 'Employer SG', 'demo-c-tuan-sg-' || k from generate_series(0, 11) k
  union all select 'Tuan Nguyen', least(fy_start(cur_fy()) + 15, current_date), 'personal-deductible', 30000, 'Personal contribution, notice of intent to claim to follow', 'demo-c-tuan-pd'
  -- Margaret Harrington: non-concessional inside her bring-forward room.
  union all select 'Margaret Harrington', least(fy_start(cur_fy()) + 25, current_date), 'personal-non-concessional', 150000, 'Proceeds of investment property sale', 'demo-c-marg-ncc'
  union all select 'Margaret Harrington', least(fy_start(cur_fy()) + 25, current_date), 'personal-deductible', 10000, 'Personal deductible contribution', 'demo-c-marg-pd'
  -- Brian O'Keefe is 77: a personal contribution the fund should not have accepted.
  union all select 'Brian O''Keefe', least(fy_start(cur_fy()) + 40, current_date), 'personal-non-concessional', 20000, 'Personal contribution', 'demo-c-brian-ncc'
  union all select 'Maureen O''Keefe', least(fy_start(cur_fy()) + 40, current_date), 'personal-non-concessional', 50000, 'Personal contribution before turning 75', 'demo-c-maur-ncc'
  union all select 'Mei Chen', fy_start(cur_fy()) + 28 + 30 * k, 'employer-sg', 900, 'Employer SG', 'demo-c-mei-sg-' || k from generate_series(0, 11) k
  union all select 'Dave Morrison', fy_start(cur_fy()) + 28 + 30 * k, 'employer-sg', 1000, 'Employer SG', 'demo-c-dave-sg-' || k from generate_series(0, 11) k
  union all select 'Raj Patel', fy_start(cur_fy()) + 28 + 30 * k, 'employer-sg', 750, 'Employer SG', 'demo-c-raj-sg-' || k from generate_series(0, 11) k
) x
join members m on m.full_name = x.member
where x.on_date <= current_date
on conflict (fund_id, external_ref) where external_ref is not null do nothing;

-- A contribution the Wilson fund received and nobody allocated to a member.
insert into transactions (fund_id, txn_on, kind, contribution_type, amount, description, source, external_ref) values
  ((select id from funds where code = 'WILS'), fy_start(cur_fy()) - 70, 'contribution', 'employer-sg', 2350, 'SuperStream contribution, member not identified', 'bank', 'demo-c-wils-unalloc')
on conflict (fund_id, external_ref) where external_ref is not null do nothing;

-- ---------------------------------------------------------------- investments

insert into investments (fund_id, code, name, asset_class, units, cost, market_value, valued_on, valuation_basis, related_party, in_house, acquired_on, acquired_from_related)
select f.id, v.code, v.name, v.asset_class, v.units, v.cost, v.mv, v.valued_on, v.basis, v.related, v.in_house, v.acquired_on, v.from_related
from (values
  ('HARR', 'MBL-CMA', 'Macquarie Cash Management Account', 'cash', null::numeric, 182000, 182000, current_date - 1, 'Bank statement', false, false, '2009-08-10'::date, false),
  ('HARR', 'TD-4412', 'Term deposit, 12 months', 'term-deposit', null, 250000, 250000, current_date - 1, 'Bank statement', false, false, '2025-11-01', false),
  ('HARR', 'CBA', 'Commonwealth Bank of Australia', 'listed-shares', 2600, 182000, 418000, current_date - 1, 'ASX closing price', false, false, '2012-03-01', false),
  ('HARR', 'VAS', 'Vanguard Australian Shares ETF', 'listed-shares', 7400, 610000, 1010000, current_date - 1, 'ASX closing price', false, false, '2014-07-15', false),
  ('NGUY', 'ING-SAV', 'ING Business Optimiser', 'cash', null, 64000, 64000, current_date - 1, 'Bank statement', false, false, '2018-03-20', false),
  ('NGUY', 'VGS', 'Vanguard MSCI International Shares ETF', 'listed-shares', 3900, 420000, 560000, current_date - 1, 'ASX closing price', false, false, '2019-01-10', false),
  ('NGUY', 'MAG-GLB', 'Magellan Global Fund', 'managed-fund', 52000, 150000, 166000, current_date - 1, 'Manager unit price', false, false, '2020-05-01', false),
  ('OKEE', 'NAB-CASH', 'NAB Cash Maximiser', 'cash', null, 96000, 96000, current_date - 1, 'Bank statement', false, false, '2001-12-01', false),
  ('OKEE', 'TD-8820', 'Term deposit, 6 months', 'term-deposit', null, 300000, 300000, current_date - 1, 'Bank statement', false, false, '2026-04-01', false),
  ('OKEE', 'BHP', 'BHP Group', 'listed-shares', 9000, 260000, 410000, current_date - 1, 'ASX closing price', false, false, '2008-02-01', false),
  ('CHEN', 'WBC-CASH', 'Westpac Business Cash Reserve', 'cash', null, 150000, 150000, current_date - 1, 'Bank statement', false, false, '2012-05-10', false),
  ('CHEN', 'IVV', 'iShares S&P 500 ETF', 'listed-shares', 9500, 420000, 600000, current_date - 1, 'ASX closing price', false, false, '2016-08-01', false),
  ('CHEN', 'WAREHOUSE', '8 Foundry Rd, Silverwater (warehouse leased to Chen Trading Pty Ltd)', 'business-property', null, 520000, 730000, fy_end(fy_shift(cur_fy(), -1)), 'Independent valuation', true, false, '2014-02-01', true),
  ('CHEN', 'LOAN-CTPL', 'Loan to Chen Trading Pty Ltd', 'loan', null, 120000, 120000, fy_end(fy_shift(cur_fy(), -1)), 'Loan statement', true, true, '2023-09-01', false),
  ('MORR', 'CBA-CASH', 'CommBank Business Online Saver', 'cash', null, 60000, 60000, current_date - 1, 'Bank statement', false, false, '2015-10-01', false),
  ('MORR', 'UNIT-4', 'Unit 4/12 Beach Rd, Coogee (bought from Dave''s brother)', 'residential-property', null, 450000, 450000, fy_end(fy_shift(cur_fy(), -1)), 'Real estate agent appraisal', true, false, fy_start(fy_shift(cur_fy(), -1)) + 120, true),
  ('MORR', 'WES', 'Wesfarmers', 'listed-shares', 900, 52000, 70000, current_date - 1, 'ASX closing price', false, false, '2019-06-01', false),
  ('PATE', 'MQG-CMA', 'Macquarie Cash Management Account', 'cash', null, 98000, 98000, current_date - 1, 'Bank statement', false, false, '2019-02-20', false),
  ('PATE', 'VDHG', 'Vanguard Diversified High Growth ETF', 'listed-shares', 5200, 300000, 352000, current_date - 1, 'ASX closing price', false, false, '2019-03-01', false),
  ('WILS', 'ANZ-CASH', 'ANZ V2 Plus', 'cash', null, 140000, 140000, current_date - 1, 'Bank statement', false, false, '2010-06-15', false),
  ('WILS', 'VAS', 'Vanguard Australian Shares ETF', 'listed-shares', 7000, 620000, 870000, current_date - 1, 'ASX closing price', false, false, '2011-01-10', false),
  ('BREN', 'MQG-CMA', 'Macquarie Cash Management Account', 'cash', null, 80000, 80000, current_date - 1, 'Bank statement', false, false, fy_start(fy_shift(cur_fy(), -1)) + 30, false),
  ('BREN', 'SUITE-3', 'Suite 3, 40 Pitt St, Parramatta', 'business-property', null, 880000, 900000, fy_end(fy_shift(cur_fy(), -1)) - 400, 'Purchase contract', false, false, fy_start(fy_shift(cur_fy(), -1)) + 40, false)
) as v(fund, code, name, asset_class, units, cost, mv, valued_on, basis, related, in_house, acquired_on, from_related)
join funds f on f.code = v.fund
on conflict (fund_id, code) do nothing;

-- ---------------------------------------------------------------- other money and bank lines

insert into transactions (fund_id, investment_id, txn_on, kind, amount, description, source, external_ref)
select f.id, (select id from investments i where i.fund_id = f.id and i.code = v.inv), least(v.on_date, current_date), v.kind, v.amount, v.description, v.source, v.ref
from (values
  ('HARR', 'CBA', fy_start(cur_fy()) + 60, 'income', 6110, 'CBA final dividend', 'bank', 'demo-i-harr-cba'),
  ('HARR', 'VAS', fy_start(cur_fy()) + 15, 'income', 17020, 'VAS distribution', 'bank', 'demo-i-harr-vas'),
  ('HARR', null, fy_start(cur_fy()) + 70, 'expense', 3300, 'Harbourside SMSF Partners: accounting and administration fee', 'bank', 'demo-e-harr-fee'),
  ('CHEN', 'WAREHOUSE', fy_start(cur_fy()) + 5, 'income', 4800, 'Rent from Chen Trading Pty Ltd, July', 'bank', 'demo-i-chen-rent-1'),
  ('CHEN', 'WAREHOUSE', fy_start(cur_fy()) + 36, 'income', 4800, 'Rent from Chen Trading Pty Ltd, August', 'bank', 'demo-i-chen-rent-2'),
  ('MORR', 'UNIT-4', fy_start(cur_fy()) + 20, 'income', 2600, 'Rent, Unit 4/12 Beach Rd', 'bank', 'demo-i-morr-rent'),
  ('WILS', null, fy_start(cur_fy()) + 50, 'expense', 259, 'ATO supervisory levy', 'bank', 'demo-e-wils-levy'),
  ('PATE', null, fy_start(cur_fy()) + 12, 'uncoded', 750, 'DIRECT CREDIT 4471 CLEARING HOUSE', 'bank', 'demo-u-pate-1'),
  ('PATE', null, fy_start(cur_fy()) + 33, 'uncoded', 1840, 'DIRECT CREDIT VDHG DST', 'bank', 'demo-u-pate-2'),
  ('PATE', null, fy_start(cur_fy()) + 41, 'uncoded', 5000, 'TRANSFER FROM R PATEL', 'bank', 'demo-u-pate-3'),
  ('BREN', null, fy_start(cur_fy()) + 18, 'uncoded', 6250, 'DEPOSIT PITT ST PROPERTY MGMT', 'bank', 'demo-u-bren-1')
) as v(fund, inv, on_date, kind, amount, description, source, ref)
join funds f on f.code = v.fund
on conflict (fund_id, external_ref) where external_ref is not null do nothing;

-- ---------------------------------------------------------------- last year's jobs

insert into jobs (fund_id, fy, stage, stage_since, assigned_id, due_on, records_requested_on, records_in_on, sent_to_auditor_on, audit_signed_on, lodged_on, fee, hours)
select f.id, fy_shift(cur_fy(), -1), v.stage, v.since, (select id from staff s where s.code = v.who), v.due_on, v.req, v.rin, v.sent, v.signed, v.lodged, v.fee, v.hours
from (values
  ('HARR', 'lodged', current_date - 20, 'JT', current_date + 200, current_date - 110, current_date - 95, current_date - 60, current_date - 30, current_date - 20, 3300, 14),
  ('NGUY', 'in-progress', current_date - 10, 'AL', current_date + 200, current_date - 70, current_date - 14, null::date, null::date, null::date, 2200, 6),
  ('OKEE', 'review', current_date - 5, 'MK', current_date + 200, current_date - 80, current_date - 40, null, null, null, 2900, 9),
  ('CHEN', 'audit-queries', current_date - 35, 'JT', current_date - 10, current_date - 120, current_date - 100, current_date - 50, null, null, 3800, 42),
  ('MORR', 'with-auditor', current_date - 12, 'MK', current_date + 200, current_date - 90, current_date - 60, current_date - 12, null, null, 2600, 10),
  ('PATE', 'records-requested', current_date - 75, 'AL', current_date + 30, current_date - 75, null, null, null, null, 2400, 2),
  ('WILS', 'signed', current_date - 3, 'AL', current_date + 200, current_date - 100, current_date - 85, current_date - 40, current_date - 3, null, 2000, 7),
  ('BREN', 'not-started', current_date - 60, 'JT', current_date + 120, null, null, null, null, null, 2750, 0)
) as v(fund, stage, since, who, due_on, req, rin, sent, signed, lodged, fee, hours)
join funds f on f.code = v.fund
on conflict (fund_id, fy) do nothing;

insert into audit_queries (job_id, number, raised_on, question, waiting_on, answer, answered_on, status)
select j.id, v.number, v.raised, v.question, v.waiting, v.answer, v.answered, v.status
from (values
  ('CHEN', 'Q-0001', current_date - 40, 'Provide the signed loan agreement with Chen Trading Pty Ltd and the repayment schedule; confirm whether repayments were made at arm''s length terms.', 'trustee', null, null::date, 'open'),
  ('CHEN', 'Q-0002', current_date - 20, 'Provide evidence the warehouse at 8 Foundry Rd is at market value at 30 June, and the lease to Chen Trading Pty Ltd is on commercial terms.', 'practice', null, null, 'open'),
  ('MORR', 'Q-0003', current_date - 6, 'Confirm who sold Unit 4/12 Beach Rd to the fund and how the price was set.', 'practice', null, null, 'open'),
  ('WILS', 'Q-0004', current_date - 25, 'Provide the actuarial certificate or confirm the fund used the segregated method.', 'practice', 'Segregated method: both members fully in pension phase all year. Bank statements attached.', current_date - 20, 'answered')
) as v(fund, number, raised, question, waiting, answer, answered, status)
join funds f on f.code = v.fund
join jobs j on j.fund_id = f.id and j.fy = fy_shift(cur_fy(), -1)
on conflict (number) do nothing;

insert into notes (fund_id, body, author, created_at)
select f.id, v.body, v.author, now() - (v.days || ' days')::interval
from (values
  ('PATE', 'Records request sent to Raj. Chased by phone, said bank statements are with his bookkeeper.', 'AL', 40),
  ('CHEN', 'Wei says the loan to Chen Trading will be repaid by Christmas. No agreement on file yet.', 'JT', 30),
  ('MORR', 'Dave asked about drawing more from his TTR pension for a renovation. Told him the 10% limit applies.', 'MK', 90)
) as v(fund, body, author, days)
join funds f on f.code = v.fund
where not exists (select 1 from notes n where n.fund_id = f.id and n.body = v.body);
