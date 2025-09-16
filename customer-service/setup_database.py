#!/usr/bin/env python3
"""
Database Setup Script for MAA Banking System
Creates schema and populates with dummy data
"""

import psycopg2
import psycopg2.extras
import os
from datetime import datetime, date, timedelta

def connect_to_db():
    """Connect to the AppointmentStore database"""
    try:
        conn = psycopg2.connect(
            host='localhost',
            database='AppointmentStore',
            user='postgres',
            password='0000',
            cursor_factory=psycopg2.extras.RealDictCursor
        )
        conn.autocommit = True
        return conn
    except Exception as e:
        print(f"❌ Failed to connect to database: {e}")
        return None

def create_schema(conn):
    """Create all database tables and indexes"""
    cursor = conn.cursor()
    
    print("🏗️ Creating database schema...")
    
    # Enable UUID extension
    cursor.execute('CREATE EXTENSION IF NOT EXISTS "pgcrypto"')
    
    # Drop tables if they exist (for clean setup)
    tables_to_drop = [
        'interaction_reports',
        'sessions', 
        'appointments',
        'bank_accounts',
        'customers',
        'branches'
    ]
    
    for table in tables_to_drop:
        cursor.execute(f'DROP TABLE IF EXISTS {table} CASCADE')
    
    # Create branches table
    cursor.execute("""
        CREATE TABLE branches (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(100) NOT NULL,
            location_code VARCHAR(20) UNIQUE NOT NULL,
            address JSONB,
            phone_number VARCHAR(20),
            services JSONB,
            hours JSONB,
            specialties JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Create customers table
    cursor.execute("""
        CREATE TABLE customers (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            customer_id VARCHAR(50) UNIQUE NOT NULL,
            first_name VARCHAR(100) NOT NULL,
            last_name VARCHAR(100) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            phone_number VARCHAR(20),
            customer_start_date DATE,
            years_as_customer INTEGER DEFAULT 0,
            billing_address JSONB,
            communication_preferences JSONB DEFAULT '{"email": true, "sms": true, "push_notifications": false}'::jsonb,
            bank_profile JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Create bank_accounts table
    cursor.execute("""
        CREATE TABLE bank_accounts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
            account_id VARCHAR(50) UNIQUE NOT NULL,
            account_type VARCHAR(50) NOT NULL,
            balance DECIMAL(12,2) DEFAULT 0.00,
            status VARCHAR(20) DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Create appointments table
    cursor.execute("""
        CREATE TABLE appointments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            appointment_id VARCHAR(50) UNIQUE NOT NULL,
            customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
            branch_id UUID REFERENCES branches(id),
            reason VARCHAR(200) NOT NULL,
            appointment_date DATE NOT NULL,
            appointment_time TIME NOT NULL,
            status VARCHAR(20) DEFAULT 'scheduled',
            banker_name VARCHAR(100),
            banker_id VARCHAR(50),
            notes TEXT,
            metadata JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Create sessions table
    cursor.execute("""
        CREATE TABLE sessions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id VARCHAR(100) UNIQUE NOT NULL,
            customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
            user_id VARCHAR(100),
            chat_history JSONB DEFAULT '[]'::jsonb,
            guided_flow JSONB,
            referral_state JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours')
        )
    """)
    
    # Create interaction_reports table
    cursor.execute("""
        CREATE TABLE interaction_reports (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            customer_id UUID REFERENCES customers(id),
            session_id VARCHAR(100),
            report_type VARCHAR(50) NOT NULL,
            report_data JSONB NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Create indexes
    indexes = [
        "CREATE INDEX idx_customers_customer_id ON customers(customer_id)",
        "CREATE INDEX idx_customers_email ON customers(email)",
        "CREATE INDEX idx_bank_accounts_customer_id ON bank_accounts(customer_id)",
        "CREATE INDEX idx_bank_accounts_account_id ON bank_accounts(account_id)",
        "CREATE INDEX idx_branches_location_code ON branches(location_code)",
        "CREATE INDEX idx_appointments_appointment_id ON appointments(appointment_id)",
        "CREATE INDEX idx_appointments_customer_id ON appointments(customer_id)",
        "CREATE INDEX idx_appointments_branch_id ON appointments(branch_id)",
        "CREATE INDEX idx_appointments_date ON appointments(appointment_date)",
        "CREATE INDEX idx_appointments_status ON appointments(status)",
        "CREATE INDEX idx_sessions_session_id ON sessions(session_id)",
        "CREATE INDEX idx_sessions_customer_id ON sessions(customer_id)"
    ]
    
    for index in indexes:
        cursor.execute(index)
    
    print("✅ Schema created successfully!")

def insert_dummy_data(conn):
    """Insert dummy data into all tables"""
    cursor = conn.cursor()
    
    print("🌱 Inserting dummy data...")
    
    # Insert branches
    branches_data = [
        (
            'Brooklyn Branch',
            'Brooklyn',
            '{"street": "123 Brooklyn Ave", "city": "Brooklyn", "state": "NY", "zip": "11201"}',
            '(718) 555-0123',
            '["ATM", "Teller Services", "Personal Banking", "Business Banking", "Safe Deposit Boxes"]',
            '{"monday_friday": "9 AM - 5 PM", "saturday": "9 AM - 2 PM", "sunday": "Closed"}',
            '["Mortgage Lending", "Small Business Loans"]'
        ),
        (
            'Manhattan Branch',
            'Manhattan',
            '{"street": "456 Manhattan Blvd", "city": "New York", "state": "NY", "zip": "10001"}',
            '(212) 555-0456',
            '["ATM", "Teller Services", "Personal Banking", "Investment Services", "Private Banking"]',
            '{"monday_friday": "8 AM - 6 PM", "saturday": "9 AM - 3 PM", "sunday": "Closed"}',
            '["Investment Advisory", "Wealth Management", "Commercial Banking"]'
        ),
        (
            'Central New York Branch',
            'Downtown',
            '{"street": "789 Central Ave", "city": "New York", "state": "NY", "zip": "10010"}',
            '(212) 555-0789',
            '["ATM", "Teller Services", "Personal Banking", "Business Banking"]',
            '{"monday_friday": "9 AM - 5 PM", "saturday": "9 AM - 1 PM", "sunday": "Closed"}',
            '["Personal Loans", "Auto Loans", "Student Banking"]'
        )
    ]
    
    for branch in branches_data:
        cursor.execute("""
            INSERT INTO branches (name, location_code, address, phone_number, services, hours, specialties)
            VALUES (%s, %s, %s::jsonb, %s, %s::jsonb, %s::jsonb, %s::jsonb)
        """, branch)
    
    # Insert customers
    customers_data = [
        (
            '123',
            'Jack',
            'Rogers',
            'jack.rogers@Big Bank.com',
            '+1-555-123-4567',
            '2020-03-15',
            5,
            '{"street": "456 Banking Blvd", "city": "New York", "state": "NY", "zip": "10001"}',
            '{"email": true, "sms": true, "push_notifications": false}',
            '{"primary_account_type": "checking", "preferred_banker": "Sarah Mitchell", "preferred_branch": "Manhattan", "service_interests": ["mortgages", "investment advice", "credit cards"], "credit_score": 750}'
        ),
        (
            '456',
            'Sarah',
            'Johnson',
            'sarah.johnson@email.com',
            '+1-555-234-5678',
            '2018-06-20',
            7,
            '{"street": "789 Finance St", "city": "Brooklyn", "state": "NY", "zip": "11201"}',
            '{"email": true, "sms": false, "push_notifications": true}',
            '{"primary_account_type": "savings", "preferred_banker": "David Wilson", "preferred_branch": "Brooklyn", "service_interests": ["savings", "personal loans"], "credit_score": 680}'
        ),
        (
            '789',
            'Michael',
            'Brown',
            'michael.brown@email.com',
            '+1-555-345-6789',
            '2021-11-10',
            4,
            '{"street": "321 Investment Ave", "city": "New York", "state": "NY", "zip": "10010"}',
            '{"email": true, "sms": true, "push_notifications": true}',
            '{"primary_account_type": "checking", "preferred_banker": "Lisa Anderson", "preferred_branch": "Downtown", "service_interests": ["business banking", "investments"], "credit_score": 720}'
        )
    ]
    
    for customer in customers_data:
        cursor.execute("""
            INSERT INTO customers (customer_id, first_name, last_name, email, phone_number, customer_start_date, years_as_customer, billing_address, communication_preferences, bank_profile)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb)
        """, customer)
    
    # Get customer IDs for foreign key relationships
    cursor.execute("SELECT id, customer_id FROM customers")
    customers = {row['customer_id']: row['id'] for row in cursor.fetchall()}
    
    # Get branch IDs
    cursor.execute("SELECT id, location_code FROM branches")
    branches = {row['location_code']: row['id'] for row in cursor.fetchall()}
    
    # Insert bank accounts
    accounts_data = [
        (customers['123'], 'CHK-001-4567890', 'Everyday Checking', 2500.75, 'active'),
        (customers['123'], 'SAV-002-1234567', 'Way2Save Savings', 15000.00, 'active'),
        (customers['123'], 'CC-003-9876543', 'Cash Back Credit Card', -1200.50, 'active'),
        (customers['456'], 'CHK-456-1111111', 'Everyday Checking', 1750.25, 'active'),
        (customers['456'], 'SAV-456-2222222', 'Platinum Savings', 25000.00, 'active'),
        (customers['789'], 'CHK-789-3333333', 'Business Checking', 5000.00, 'active'),
        (customers['789'], 'INV-789-4444444', 'Investment Account', 50000.00, 'active')
    ]
    
    for account in accounts_data:
        cursor.execute("""
            INSERT INTO bank_accounts (customer_id, account_id, account_type, balance, status)
            VALUES (%s, %s, %s, %s, %s)
        """, account)
    
    # Insert historical appointments
    appointments_data = [
        ('APT-001-2024', customers['123'], branches['Brooklyn'], 'Account Opening', '2024-08-15', '10:00:00', 'completed', 'Sarah Mitchell'),
        ('APT-002-2024', customers['123'], branches['Manhattan'], 'Loan Consultation', '2024-08-20', '14:30:00', 'completed', 'Michael Chen'),
        ('APT-003-2024', customers['456'], branches['Brooklyn'], 'Investment Planning', '2024-09-01', '11:00:00', 'completed', 'David Wilson'),
        ('APT-004-2024', customers['789'], branches['Downtown'], 'Business Account Setup', '2024-09-10', '15:00:00', 'scheduled', 'Lisa Anderson')
    ]
    
    for appointment in appointments_data:
        cursor.execute("""
            INSERT INTO appointments (appointment_id, customer_id, branch_id, reason, appointment_date, appointment_time, status, banker_name)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, appointment)
    
    print("✅ Dummy data inserted successfully!")

def main():
    """Main setup function"""
    print("🚀 MAA Banking System Database Setup")
    print("=" * 50)
    
    # Connect to database
    conn = connect_to_db()
    if not conn:
        return 1
    
    try:
        # Create schema
        create_schema(conn)
        
        # Insert dummy data
        insert_dummy_data(conn)
        
        # Verify data
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM customers")
        customer_count = cursor.fetchone()['count']
        
        cursor.execute("SELECT COUNT(*) FROM branches")
        branch_count = cursor.fetchone()['count']
        
        cursor.execute("SELECT COUNT(*) FROM appointments")
        appointment_count = cursor.fetchone()['count']
        
        cursor.execute("SELECT COUNT(*) FROM bank_accounts")
        account_count = cursor.fetchone()['count']
        
        print()
        print("📊 Database Summary:")
        print(f"   👥 Customers: {customer_count}")
        print(f"   🏢 Branches: {branch_count}")
        print(f"   📅 Appointments: {appointment_count}")
        print(f"   💳 Bank Accounts: {account_count}")
        
        print()
        print("🎉 Database setup completed successfully!")
        print("✅ Ready to test the MAA banking system!")
        
        return 0
        
    except Exception as e:
        print(f"❌ Setup failed: {e}")
        import traceback
        traceback.print_exc()
        return 1
    finally:
        conn.close()

if __name__ == "__main__":
    exit_code = main()
    exit(exit_code)
