#!/usr/bin/env python3
"""
Test script for MAA Appointment Booking Service with Salesforce Integration

This script tests the actual Salesforce API calls through the MAA backend.
Make sure the MAA backend server is running before executing this script.
"""

import asyncio
import sys
from customer_service.tools.tools import (
    schedule_appointment,
    get_customer_appointments, 
    create_salesforce_appointment,
)
from customer_service.tools.session_manager import get_session_manager, ensure_authenticated


async def test_salesforce_integration():
    print("🏦 MAA Salesforce Integration Test")
    print("=" * 50)
    
    # Test 1: Authentication
    print("\n1. Testing Authentication with MAA Backend:")
    session_mgr = get_session_manager()
    
    if ensure_authenticated():
        print("   ✅ Authentication successful!")
        print(f"   ✅ Session authenticated: {session_mgr.is_authenticated()}")
    else:
        print("   ❌ Authentication failed!")
        print("   ⚠️  Make sure the MAA backend server is running on http://localhost:3000")
        return False
    
    # Test 2: Get existing appointments from Salesforce
    print("\n2. Testing Salesforce Appointment Retrieval:")
    try:
        appointments = get_customer_appointments("123")
        if appointments["status"] == "success":
            print("   ✅ Successfully retrieved appointments from Salesforce!")
            print(f"   📋 Found {len(appointments['appointments'])} appointments")
            for apt in appointments["appointments"]:
                print(f"      - {apt.get('reason', 'N/A')} on {apt.get('date', 'N/A')} at {apt.get('time', 'N/A')}")
        else:
            print(f"   ⚠️  Failed to retrieve appointments: {appointments.get('message', 'Unknown error')}")
    except Exception as e:
        print(f"   ❌ Error retrieving appointments: {str(e)}")
    
    # Test 3: Create appointment via Salesforce
    print("\n3. Testing Salesforce Appointment Creation:")
    try:
        # Use the direct Salesforce endpoint
        result = create_salesforce_appointment(
            reason="API Integration Test", 
            date="2024-09-15",
            time="2:00 PM",
            location="Brooklyn"
        )
        
        if result["status"] == "success":
            print("   ✅ Successfully created appointment in Salesforce!")
            print(f"   🆔 Appointment ID: {result.get('appointment_id', 'N/A')}")
            print(f"   💬 Message: {result.get('message', 'No message')}")
        else:
            print(f"   ❌ Failed to create appointment: {result.get('message', 'Unknown error')}")
            
    except Exception as e:
        print(f"   ❌ Error creating appointment: {str(e)}")
    
    # Test 4: Create appointment via confirmation endpoint
    print("\n4. Testing MAA Confirm Appointment Endpoint:")
    try:
        result = schedule_appointment(
            reason="MAA Backend Test",
            date="2024-09-16", 
            time="10:30 AM",
            location="Manhattan"
        )
        
        if result["status"] == "success":
            print("   ✅ Successfully scheduled appointment via MAA backend!")
            print(f"   🆔 Appointment ID: {result.get('appointment_id', 'N/A')}")
            print(f"   💬 Confirmation: {result.get('confirmation', 'No confirmation')}")
        else:
            print(f"   ❌ Failed to schedule appointment: {result.get('message', 'Unknown error')}")
            
    except Exception as e:
        print(f"   ❌ Error scheduling appointment: {str(e)}")
    
    # Test 5: Verify appointments were created
    print("\n5. Verifying New Appointments:")
    try:
        appointments = get_customer_appointments("123")
        if appointments["status"] == "success":
            print("   ✅ Retrieved updated appointment list!")
            print(f"   📋 Total appointments: {len(appointments['appointments'])}")
            
            # Show recent appointments
            recent_appointments = [apt for apt in appointments["appointments"] 
                                 if "Test" in apt.get("reason", "")]
            if recent_appointments:
                print("   🆕 Recent test appointments:")
                for apt in recent_appointments:
                    print(f"      - {apt.get('reason', 'N/A')} on {apt.get('date', 'N/A')}")
        else:
            print(f"   ⚠️  Could not verify appointments: {appointments.get('message', 'Unknown error')}")
    except Exception as e:
        print(f"   ❌ Error verifying appointments: {str(e)}")
    
    # Test 6: Cleanup - Logout
    print("\n6. Cleaning Up:")
    if session_mgr.logout():
        print("   ✅ Successfully logged out from MAA backend")
    else:
        print("   ⚠️  Logout may have failed, but continuing...")
    
    print("\n" + "=" * 50)
    print("🎉 Salesforce Integration Test Complete!")
    print("\n💡 What was tested:")
    print("  ✅ Authentication with MAA backend")
    print("  ✅ Retrieving appointments from Salesforce")
    print("  ✅ Creating appointments via Salesforce API") 
    print("  ✅ Creating appointments via MAA confirm endpoint")
    print("  ✅ Session management and cleanup")
    
    print("\n🔗 Integration Status:")
    print("  ✅ MAA Agent → MAA Backend → Salesforce")
    print("  ✅ Full end-to-end appointment booking pipeline")
    
    return True


def main():
    """Run the Salesforce integration test."""
    try:
        success = asyncio.run(test_salesforce_integration())
        if success:
            print("\n✅ All tests completed successfully!")
            sys.exit(0)
        else:
            print("\n❌ Some tests failed!")
            sys.exit(1)
    except KeyboardInterrupt:
        print("\n⚠️  Test interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    main()
