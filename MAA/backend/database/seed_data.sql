-- MAA Banking System Seed Data
-- Initial data for development and testing

-- Insert branch data
INSERT INTO branches (name, location_code, address, phone_number, services, hours, specialties) VALUES
(
    'Brooklyn Branch',
    'Brooklyn',
    '{"street": "123 Brooklyn Ave", "city": "Brooklyn", "state": "NY", "zip": "11201"}'::jsonb,
    '(718) 555-0123',
    '["ATM", "Teller Services", "Personal Banking", "Business Banking", "Safe Deposit Boxes"]'::jsonb,
    '{"monday_friday": "9 AM - 5 PM", "saturday": "9 AM - 2 PM", "sunday": "Closed"}'::jsonb,
    '["Mortgage Lending", "Small Business Loans"]'::jsonb
),
(
    'Manhattan Branch',
    'Manhattan',
    '{"street": "456 Manhattan Blvd", "city": "New York", "state": "NY", "zip": "10001"}'::jsonb,
    '(212) 555-0456',
    '["ATM", "Teller Services", "Personal Banking", "Investment Services", "Private Banking"]'::jsonb,
    '{"monday_friday": "8 AM - 6 PM", "saturday": "9 AM - 3 PM", "sunday": "Closed"}'::jsonb,
    '["Investment Advisory", "Wealth Management", "Commercial Banking"]'::jsonb
),
(
    'Central New York Branch',
    'Downtown',
    '{"street": "789 Central Ave", "city": "New York", "state": "NY", "zip": "10010"}'::jsonb,
    '(212) 555-0789',
    '["ATM", "Teller Services", "Personal Banking", "Business Banking"]'::jsonb,
    '{"monday_friday": "9 AM - 5 PM", "saturday": "9 AM - 1 PM", "sunday": "Closed"}'::jsonb,
    '["Personal Loans", "Auto Loans", "Student Banking"]'::jsonb
);

-- Insert sample customer (Jack Rogers)
INSERT INTO customers (customer_id, first_name, last_name, email, phone_number, customer_start_date, years_as_customer, billing_address, communication_preferences, bank_profile) VALUES
(
    '123',
    'Jack',
    'Rogers',
    'jack.rogers@Big Bank.com',
    '+1-555-123-4567',
    '2020-03-15',
    5,
    '{"street": "456 Banking Blvd", "city": "New York", "state": "NY", "zip": "10001"}'::jsonb,
    '{"email": true, "sms": true, "push_notifications": false}'::jsonb,
    '{"primary_account_type": "checking", "preferred_banker": "Sarah Mitchell", "preferred_branch": "Manhattan", "service_interests": ["mortgages", "investment advice", "credit cards"], "credit_score": 750}'::jsonb
);

-- Get the customer ID for Jack Rogers to use in related tables
-- Insert bank accounts for Jack Rogers
INSERT INTO bank_accounts (customer_id, account_id, account_type, balance, status) 
SELECT 
    c.id,
    'CHK-001-4567890',
    'Everyday Checking',
    2500.75,
    'active'
FROM customers c WHERE c.customer_id = '123';

INSERT INTO bank_accounts (customer_id, account_id, account_type, balance, status) 
SELECT 
    c.id,
    'SAV-002-1234567',
    'Way2Save Savings',
    15000.00,
    'active'
FROM customers c WHERE c.customer_id = '123';

INSERT INTO bank_accounts (customer_id, account_id, account_type, balance, status) 
SELECT 
    c.id,
    'CC-003-9876543',
    'Cash Back Credit Card',
    -1200.50,
    'active'
FROM customers c WHERE c.customer_id = '123';

-- Insert historical appointments for Jack Rogers
INSERT INTO appointments (appointment_id, customer_id, branch_id, reason, appointment_date, appointment_time, status, banker_name) 
SELECT 
    'APT-001-2024',
    c.id,
    b.id,
    'Account Opening',
    '2024-08-15',
    '10:00:00',
    'completed',
    'Sarah Mitchell'
FROM customers c, branches b 
WHERE c.customer_id = '123' AND b.location_code = 'Brooklyn';

INSERT INTO appointments (appointment_id, customer_id, branch_id, reason, appointment_date, appointment_time, status, banker_name) 
SELECT 
    'APT-002-2024',
    c.id,
    b.id,
    'Loan Consultation',
    '2024-08-20',
    '14:30:00',
    'completed',
    'Michael Chen'
FROM customers c, branches b 
WHERE c.customer_id = '123' AND b.location_code = 'Manhattan';

-- Insert additional sample customers for testing
INSERT INTO customers (customer_id, first_name, last_name, email, phone_number, customer_start_date, years_as_customer, billing_address, communication_preferences, bank_profile) VALUES
(
    '456',
    'Sarah',
    'Johnson',
    'sarah.johnson@email.com',
    '+1-555-234-5678',
    '2018-06-20',
    7,
    '{"street": "789 Finance St", "city": "Brooklyn", "state": "NY", "zip": "11201"}'::jsonb,
    '{"email": true, "sms": false, "push_notifications": true}'::jsonb,
    '{"primary_account_type": "savings", "preferred_banker": "David Wilson", "preferred_branch": "Brooklyn", "service_interests": ["savings", "personal loans"], "credit_score": 680}'::jsonb
),
(
    '789',
    'Michael',
    'Brown',
    'michael.brown@email.com',
    '+1-555-345-6789',
    '2021-11-10',
    4,
    '{"street": "321 Investment Ave", "city": "New York", "state": "NY", "zip": "10010"}'::jsonb,
    '{"email": true, "sms": true, "push_notifications": true}'::jsonb,
    '{"primary_account_type": "checking", "preferred_banker": "Lisa Anderson", "preferred_branch": "Downtown", "service_interests": ["business banking", "investments"], "credit_score": 720}'::jsonb
);

-- Add bank accounts for additional customers
INSERT INTO bank_accounts (customer_id, account_id, account_type, balance, status) 
SELECT 
    c.id,
    'CHK-456-1111111',
    'Everyday Checking',
    1750.25,
    'active'
FROM customers c WHERE c.customer_id = '456';

INSERT INTO bank_accounts (customer_id, account_id, account_type, balance, status) 
SELECT 
    c.id,
    'SAV-456-2222222',
    'Platinum Savings',
    25000.00,
    'active'
FROM customers c WHERE c.customer_id = '456';

INSERT INTO bank_accounts (customer_id, account_id, account_type, balance, status) 
SELECT 
    c.id,
    'CHK-789-3333333',
    'Business Checking',
    5000.00,
    'active'
FROM customers c WHERE c.customer_id = '789';

INSERT INTO bank_accounts (customer_id, account_id, account_type, balance, status) 
SELECT 
    c.id,
    'INV-789-4444444',
    'Investment Account',
    50000.00,
    'active'
FROM customers c WHERE c.customer_id = '789';
