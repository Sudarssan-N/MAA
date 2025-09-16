-- MAA Banking System Database Schema
-- PostgreSQL Database Schema for Multi-modal AI Assistant (MAA) appointment booking system

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Customers table - Core customer information
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id VARCHAR(50) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone_number VARCHAR(20),
    customer_start_date DATE,
    years_as_customer INTEGER DEFAULT 0,
    billing_address JSONB, -- Flexible address structure
    communication_preferences JSONB DEFAULT '{"email": true, "sms": true, "push_notifications": false}'::jsonb,
    bank_profile JSONB, -- Banking preferences and profile data
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on customer_id for fast lookups
CREATE INDEX idx_customers_customer_id ON customers(customer_id);
CREATE INDEX idx_customers_email ON customers(email);

-- Bank accounts table - Customer account information
CREATE TABLE bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    account_id VARCHAR(50) UNIQUE NOT NULL,
    account_type VARCHAR(50) NOT NULL, -- checking, savings, credit_card, etc.
    balance DECIMAL(12,2) DEFAULT 0.00,
    status VARCHAR(20) DEFAULT 'active', -- active, inactive, closed
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for bank accounts
CREATE INDEX idx_bank_accounts_customer_id ON bank_accounts(customer_id);
CREATE INDEX idx_bank_accounts_account_id ON bank_accounts(account_id);
CREATE INDEX idx_bank_accounts_status ON bank_accounts(status);

-- Branches table - Bank branch information
CREATE TABLE branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    location_code VARCHAR(20) UNIQUE NOT NULL, -- Brooklyn, Manhattan, Downtown
    address JSONB, -- Flexible address structure
    phone_number VARCHAR(20),
    services JSONB, -- Array of services offered
    hours JSONB, -- Operating hours structure
    specialties JSONB, -- Array of specialties
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on location_code for fast lookups
CREATE INDEX idx_branches_location_code ON branches(location_code);

-- Appointments table - Core appointment scheduling
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id VARCHAR(50) UNIQUE NOT NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id),
    reason VARCHAR(200) NOT NULL, -- Account Opening, Loan Consultation, etc.
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    status VARCHAR(20) DEFAULT 'scheduled', -- scheduled, completed, cancelled, rescheduled
    banker_name VARCHAR(100),
    banker_id VARCHAR(50),
    notes TEXT, -- Additional appointment notes
    metadata JSONB, -- Flexible appointment metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for appointments
CREATE INDEX idx_appointments_appointment_id ON appointments(appointment_id);
CREATE INDEX idx_appointments_customer_id ON appointments(customer_id);
CREATE INDEX idx_appointments_branch_id ON appointments(branch_id);
CREATE INDEX idx_appointments_date ON appointments(appointment_date);
CREATE INDEX idx_appointments_status ON appointments(status);
CREATE INDEX idx_appointments_datetime ON appointments(appointment_date, appointment_time);

-- Sessions table - Chat session management
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(100) UNIQUE NOT NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    user_id VARCHAR(100), -- External user identifier
    chat_history JSONB DEFAULT '[]'::jsonb, -- Array of chat messages
    guided_flow JSONB, -- Flow state information
    referral_state JSONB, -- Referral information
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours')
);

-- Create indexes for sessions
CREATE INDEX idx_sessions_session_id ON sessions(session_id);
CREATE INDEX idx_sessions_customer_id ON sessions(customer_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- Interaction reports table - For analytics and reporting
CREATE TABLE interaction_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id),
    session_id VARCHAR(100),
    report_type VARCHAR(50) NOT NULL, -- sentiment, interaction, etc.
    report_data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for interaction reports
CREATE INDEX idx_interaction_reports_customer_id ON interaction_reports(customer_id);
CREATE INDEX idx_interaction_reports_session_id ON interaction_reports(session_id);
CREATE INDEX idx_interaction_reports_type ON interaction_reports(report_type);
CREATE INDEX idx_interaction_reports_created_at ON interaction_reports(created_at);

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to automatically update updated_at
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bank_accounts_updated_at BEFORE UPDATE ON bank_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_branches_updated_at BEFORE UPDATE ON branches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON appointments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create views for common queries
CREATE VIEW customer_summary AS
SELECT 
    c.id,
    c.customer_id,
    c.first_name,
    c.last_name,
    c.email,
    c.phone_number,
    c.years_as_customer,
    COUNT(ba.id) as total_accounts,
    SUM(CASE WHEN ba.status = 'active' THEN 1 ELSE 0 END) as active_accounts,
    COUNT(a.id) as total_appointments,
    MAX(a.appointment_date) as last_appointment_date
FROM customers c
LEFT JOIN bank_accounts ba ON c.id = ba.customer_id
LEFT JOIN appointments a ON c.id = a.customer_id
GROUP BY c.id, c.customer_id, c.first_name, c.last_name, c.email, c.phone_number, c.years_as_customer;

-- Create view for appointment scheduling
CREATE VIEW appointment_schedule AS
SELECT 
    a.appointment_id,
    a.appointment_date,
    a.appointment_time,
    a.reason,
    a.status,
    c.first_name || ' ' || c.last_name as customer_name,
    c.email as customer_email,
    c.phone_number as customer_phone,
    b.name as branch_name,
    b.location_code as branch_location,
    a.banker_name,
    a.created_at
FROM appointments a
JOIN customers c ON a.customer_id = c.id
JOIN branches b ON a.branch_id = b.id;
