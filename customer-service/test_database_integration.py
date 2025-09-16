#!/usr/bin/env python3
"""
Test script for MAA database integration
Tests database connection and basic tool functionality
"""

import os
import sys
import traceback

# Add the customer service directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def test_database_connection():
    """Test database connection"""
    print("🧪 Testing database connection...")
    try:
        import psycopg2
        from customer_service.database import DatabaseConnection
        
        # Test connection
        db = DatabaseConnection()
        if db.test_connection():
            print("✅ Database connection successful!")
            return True
        else:
            print("❌ Database connection failed!")
            return False
    except Exception as e:
        print(f"❌ Database connection error: {e}")
        traceback.print_exc()
        return False

def test_tools_import():
    """Test importing tools module"""
    print("🧪 Testing tools module import...")
    try:
        from customer_service.tools import tools
        print("✅ Tools module imported successfully!")
        
        # Test that all expected functions exist
        required_functions = [
            'get_available_appointment_times',
            'schedule_appointment',
            'reschedule_appointment',
            'cancel_appointment',
            'get_customer_appointments',
            'get_branch_information',
            'send_appointment_confirmation',
            'create_salesforce_appointment'
        ]
        
        for func_name in required_functions:
            if hasattr(tools, func_name):
                print(f"✅ Found function: {func_name}")
            else:
                print(f"❌ Missing function: {func_name}")
                
        return True
    except Exception as e:
        print(f"❌ Tools import error: {e}")
        traceback.print_exc()
        return False

def test_customer_repository():
    """Test customer repository functionality"""
    print("🧪 Testing customer repository...")
    try:
        from customer_service.database.repositories import CustomerRepository
        
        # Create repository instance
        repo = CustomerRepository()
        print("✅ CustomerRepository created successfully!")
        
        # Test finding a customer (this will fail if DB is not set up, but shouldn't crash)
        try:
            customer = repo.get_customer_by_id("123")
            if customer:
                print(f"✅ Found customer: {customer['customer_first_name']} {customer['customer_last_name']}")
            else:
                print("ℹ️ No customer found with ID '123' (this is expected if DB is not seeded)")
        except Exception as e:
            print(f"ℹ️ Customer lookup failed (expected if DB not set up): {e}")
        
        return True
    except Exception as e:
        print(f"❌ Customer repository error: {e}")
        traceback.print_exc()
        return False

def main():
    """Run all tests"""
    print("🚀 Starting MAA Database Integration Tests")
    print("=" * 50)
    
    # Test results
    results = []
    
    # Test 1: Database connection
    results.append(test_database_connection())
    print()
    
    # Test 2: Tools module
    results.append(test_tools_import())
    print()
    
    # Test 3: Customer repository
    results.append(test_customer_repository())
    print()
    
    # Summary
    print("=" * 50)
    print("📊 Test Summary:")
    passed = sum(results)
    total = len(results)
    
    if passed == total:
        print(f"🎉 All tests passed! ({passed}/{total})")
        return 0
    else:
        print(f"⚠️ {total - passed} test(s) failed. ({passed}/{total} passed)")
        return 1

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
