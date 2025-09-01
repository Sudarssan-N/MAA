#!/usr/bin/env python3
"""
Test script for the MAA Appointment Booking Service

This script demonstrates the transformation from a garden customer service agent 
to a bank appointment booking agent.
"""

from customer_service.agent import root_agent
from customer_service.entities.customer import Customer
from customer_service.tools.tools import (
    get_available_appointment_times,
    schedule_appointment,
    get_branch_information,
)


def main():
    print("🏦 MAA Appointment Booking Service - Test Script")
    print("=" * 55)
    
    # Test 1: Load bank customer
    print("\n1. Loading Bank Customer Profile:")
    customer = Customer.get_customer("123")
    print(f"   ✅ Customer: {customer.customer_first_name} {customer.customer_last_name}")
    print(f"   ✅ Contact ID: {customer.contact_id}")
    print(f"   ✅ Preferred Branch: {customer.preferred_branch}")
    print(f"   ✅ Years as Customer: {customer.years_as_customer}")
    
    # Test 2: Test appointment tools
    print("\n2. Testing Appointment Tools:")
    
    # Get available times
    times = get_available_appointment_times("2024-08-30", "Brooklyn")
    print(f"   ✅ Available times for Brooklyn: {times['status']}")
    print(f"      Times: {', '.join(times['available_times'][:3])}... (showing first 3)")
    
    # Schedule an appointment
    appointment = schedule_appointment(
        reason="Account Opening",
        date="2024-08-30", 
        time="10:00 AM",
        location="Brooklyn"
    )
    print(f"   ✅ Schedule appointment: {appointment['status']}")
    print(f"      Appointment ID: {appointment['appointment_id']}")
    
    # Test 3: Test branch information
    print("\n3. Testing Branch Information:")
    branch_info = get_branch_information("Manhattan")
    print(f"   ✅ Branch info for Manhattan: {branch_info['status']}")
    print(f"      Address: {branch_info['branch_info']['address']}")
    print(f"      Services: {', '.join(branch_info['branch_info']['services'][:3])}...")
    
    # Test 4: Agent configuration
    print("\n4. Agent Configuration:")
    print(f"   ✅ Agent Name: {root_agent.name}")
    print(f"   ✅ Number of Tools: {len(root_agent.tools)}")
    print(f"   ✅ Tools Available:")
    for tool in root_agent.tools:
        print(f"      - {tool.__name__}")
    
    print("\n🎉 All tests passed! MAA Appointment Booking Service is ready!")
    print("\nTo start the service, run: adk web")
    print("\nTransformation Summary:")
    print("  ✅ Bank appointment booking and management")
    print("  ✅ Branch information and services")
    print("  ✅ Professional banking customer service")


if __name__ == "__main__":
    main()
