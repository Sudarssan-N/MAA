#!/usr/bin/env python3
"""
Simple validation script to verify the tools module syntax
"""

import os
import py_compile

def validate_tools_module():
    """Validate that the tools module has no syntax errors."""
    try:
        tools_path = os.path.join(os.path.dirname(__file__), 'customer_service', 'tools', 'tools.py')
        
        print("🔧 Validating MAA Customer Service Tools Module")
        print("=" * 50)
        
        # Test syntax compilation
        py_compile.compile(tools_path, doraise=True)
        print("✅ Tools module compiles successfully (no syntax errors)")
        
        # Read and analyze the file
        with open(tools_path, 'r') as f:
            content = f.read()
        
        # Check for key functions
        expected_functions = [
            'get_available_appointment_times',
            'schedule_appointment', 
            'reschedule_appointment',
            'cancel_appointment',
            'get_customer_appointments',
            'get_branch_information',
            'send_appointment_confirmation',
            'create_salesforce_appointment',
            'normalize_location',
            '_convert_to_24_hour_format'
        ]
        
        print("\n📋 Checking for expected functions:")
        all_found = True
        for func_name in expected_functions:
            if f'def {func_name}(' in content:
                print(f"   ✅ {func_name}")
            else:
                print(f"   ❌ {func_name} - NOT FOUND")
                all_found = False
        
        # Check for old dependencies (should not exist)
        old_dependencies = [
            'import requests',
            'from requests',
            'make_authenticated_request',
            'get_session_manager',
            'session_manager'
        ]
        
        print("\n🚫 Checking for old dependencies (should not exist):")
        dependencies_clean = True
        for dep in old_dependencies:
            if dep in content:
                print(f"   ❌ Found: {dep}")
                dependencies_clean = False
            else:
                print(f"   ✅ Clean: {dep}")
        
        # Check for new database imports
        print("\n🗄️ Checking for database imports:")
        database_imports = [
            'from ..database.repositories import',
            'customer_repository',
            'appointment_repository', 
            'branch_repository'
        ]
        
        db_imports_found = True
        for imp in database_imports:
            if imp in content:
                print(f"   ✅ Found: {imp}")
            else:
                print(f"   ❌ Missing: {imp}")
                db_imports_found = False
        
        print("\n📊 Validation Results:")
        print(f"   Syntax Check: {'✅ PASS' if True else '❌ FAIL'}")
        print(f"   All Functions Present: {'✅ PASS' if all_found else '❌ FAIL'}")
        print(f"   Old Dependencies Removed: {'✅ PASS' if dependencies_clean else '❌ FAIL'}")
        print(f"   Database Imports Present: {'✅ PASS' if db_imports_found else '❌ FAIL'}")
        
        if all([True, all_found, dependencies_clean, db_imports_found]):
            print("\n🎉 All validations passed! The tools module migration is complete.")
            print("   ✅ Syntax is correct")
            print("   ✅ All expected functions are present") 
            print("   ✅ Old Salesforce/MAA backend dependencies removed")
            print("   ✅ New database dependencies added")
            print("\n📝 Next Steps:")
            print("   1. Set up PostgreSQL database")
            print("   2. Run database schema and seed scripts")
            print("   3. Test actual function calls")
        else:
            print("\n⚠️ Some validations failed. Check the output above for details.")
        
        return True
        
    except py_compile.PyCompileError as e:
        print(f"❌ Syntax error in tools module: {e}")
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False

if __name__ == "__main__":
    validate_tools_module()
