-- Persistent employee profiles and auditable payroll payment history.
-- Run this once in the Supabase SQL editor before deploying the matching API.

create table if not exists public.payroll_employees (
    employee_id text primary key,
    employee_name text not null,
    designation text not null,
    monthly_salary numeric(12, 2) not null default 0 check (monthly_salary >= 0),
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Seed the reusable roster from existing payroll records without changing them.
insert into public.payroll_employees (employee_id, employee_name, designation, monthly_salary)
select distinct on (employee_id)
    employee_id,
    employee_name,
    designation,
    coalesce(salary, 0)
from public.payroll
where employee_id is not null and btrim(employee_id) <> ''
order by employee_id, created_at desc nulls last
on conflict (employee_id) do nothing;

create table if not exists public.payroll_payments (
    id uuid primary key default gen_random_uuid(),
    payroll_id text not null,
    employee_id text not null,
    amount numeric(12, 2) not null check (amount > 0),
    payment_date date not null,
    payment_method text not null,
    reference text,
    notes text,
    created_at timestamptz not null default now()
);

create index if not exists payroll_payments_payroll_id_idx
    on public.payroll_payments (payroll_id, payment_date desc);

create index if not exists payroll_payments_employee_id_idx
    on public.payroll_payments (employee_id, payment_date desc);
