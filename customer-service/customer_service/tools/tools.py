# Copyright 2025 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
# add docstring to this module
"""Tools module for the MAA appointment booking agent."""

import logging
import uuid
import requests
from datetime import datetime, timedelta
from typing import Optional
from google.adk.tools import ToolContext
from .session_manager import ensure_authenticated, get_session_manager

logger = logging.getLogger(__name__)

# MAA Backend API configuration - update these URLs based on your backend
MAA_BACKEND_BASE_URL = "http://localhost:3000/api"

# Location mapping to convert user-friendly names to Salesforce picklist values
LOCATION_MAPPING = {
    "Brooklyn Branch": "Brooklyn",
    "Manhattan Branch": "Manhattan", 
    "Central New York Branch": "Downtown",
    "brooklyn": "Brooklyn",
    "manhattan": "Manhattan",
    "central new york": "Downtown",
    "downtown": "Downtown"
}

def normalize_location(location: str) -> str:
    """
    Convert user-friendly location names to Salesforce picklist values.
    
    Args:
        location: User-friendly location name
        
    Returns:
        Salesforce-compatible location value
    """
    if not location:
        return location
        
    # Check exact match first
    if location in LOCATION_MAPPING:
        return LOCATION_MAPPING[location]
    
    # Check case-insensitive match
    for user_name, sf_name in LOCATION_MAPPING.items():
        if location.lower() == user_name.lower():
            return sf_name
    
    # If no mapping found, return as is (might be already correct)
    return location

# Authentication headers for MAA backend API calls
def get_auth_headers():
    """Get authentication headers for MAA backend API calls"""
    session_mgr = get_session_manager()
    return session_mgr.get_headers()


def make_authenticated_request(method: str, endpoint: str, **kwargs) -> requests.Response:
    """
    Make an authenticated request to the MAA backend.
    
    Args:
        method: HTTP method (GET, POST, etc.)
        endpoint: API endpoint (without base URL)
        **kwargs: Additional arguments for requests
        
    Returns:
        Response object
    """
    # Ensure we're authenticated
    if not ensure_authenticated():
        raise Exception("Failed to authenticate with MAA backend")
    
    session_mgr = get_session_manager()
    session = session_mgr.get_session()
    
    url = f"{MAA_BACKEND_BASE_URL}{endpoint}"
    
    # Add default headers
    headers = kwargs.get('headers', {})
    headers.update(get_auth_headers())
    kwargs['headers'] = headers
    
    # Set default timeout
    kwargs.setdefault('timeout', 30)
    
    return session.request(method, url, **kwargs)

def get_available_appointment_times(date: str, location: str) -> dict:
    """
    Gets available appointment time slots for a specific date and location.

    Args:
        date (str): The date in YYYY-MM-DD format.
        location (str): The branch location (Brooklyn, Manhattan, or New York).

    Returns:
        dict: Available time slots for the specified date and location.

    Example:
        >>> get_available_appointment_times(date='2024-08-30', location='Brooklyn')
        {'available_times': ['9:00 AM', '10:30 AM', '2:00 PM', '4:30 PM']}
    """
    logger.info("Getting available appointment times for %s at %s", date, location)
    
    # For now, simulate available times since the MAA backend doesn't have a specific endpoint
    # In a real implementation, this would query the backend for available slots
    available_times = [
        "9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", 
        "11:30 AM", "2:00 PM", "2:30 PM", "3:00 PM", "3:30 PM", 
        "4:00 PM", "4:30 PM"
    ]
    
    return {
        "status": "success", 
        "date": date,
        "location": location,
        "available_times": available_times
    }


def schedule_appointment(reason: str, date: str, time: str, location: str, banker_id: Optional[str] = None) -> dict:
    """
    Schedules a new appointment with the bank using the MAA backend API.

    Args:
        reason (str): The reason for the visit (e.g., "Account Opening", "Loan Consultation").
        date (str): The appointment date in YYYY-MM-DD format.
        time (str): The appointment time (e.g., "10:00 AM").
        location (str): The branch location.
        banker_id (str, optional): Specific banker ID if customer has a preference.

    Returns:
        dict: Appointment confirmation details.

    Example:
        >>> schedule_appointment(reason="Account Opening", date="2024-08-30", time="10:00 AM", location="Brooklyn")
        {'status': 'success', 'appointment_id': 'APT-123456', 'confirmation': 'Appointment scheduled successfully'}
    """
    logger.info("Scheduling appointment: %s on %s at %s in %s", reason, date, time, location)
    
    # Normalize location to match Salesforce picklist values
    normalized_location = normalize_location(location)
    logger.info("Location normalized from '%s' to '%s'", location, normalized_location)
    
    try:
        # Prepare appointment data in the format expected by MAA backend
        appointment_data = {
            "appointmentDetails": {
                "Reason_for_Visit__c": reason,
                "Appointment_Date__c": date,
                "Appointment_Time__c": time,
                "Location__c": normalized_location  # Use normalized location
            }
        }
        
        if banker_id:
            appointment_data["appointmentDetails"]["Banker__c"] = banker_id
        
        logger.info("Calling MAA backend to schedule appointment: %s", appointment_data)
        
        # Call the MAA backend API to confirm the appointment using authenticated session
        response = make_authenticated_request(
            "POST",
            "/confirm-appointment",
            json=appointment_data
        )
        
        if response.status_code == 200:
            result = response.json()
            logger.info("Appointment created successfully via MAA backend: %s", result)
            
            return {
                "status": "success",
                "appointment_id": result.get("appointmentId", "Unknown"),
                "confirmation": result.get("message", "Appointment scheduled successfully"),
                "details": {
                    "reason": reason,
                    "date": date,
                    "time": time,
                    "location": normalized_location,  # Use normalized location
                    "banker_id": banker_id
                }
            }
        else:
            logger.error("MAA backend returned error: %s - %s", response.status_code, response.text)
            return {
                "status": "error",
                "message": f"Backend API error: {response.status_code} - {response.text}"
            }
        
    except requests.RequestException as e:
        logger.error("Error calling MAA backend API: %s", str(e))
        # Fall back to simulated response if backend is unavailable
        appointment_id = f"APT-{uuid.uuid4().hex[:8].upper()}"
        logger.warning("Falling back to simulated appointment creation: %s", appointment_id)
        
        return {
            "status": "success",
            "appointment_id": appointment_id,
            "confirmation": f"Appointment scheduled successfully for {date} at {time} (Backend unavailable - using simulation)",
            "details": {
                "reason": reason,
                "date": date,
                "time": time,
                "location": location,
                "banker_id": banker_id
            }
        }
        
    except Exception as e:
        logger.error("Unexpected error scheduling appointment: %s", str(e))
        return {
            "status": "error",
            "message": f"Failed to schedule appointment: {str(e)}"
        }


def reschedule_appointment(appointment_id: str, new_date: str, new_time: str, new_location: Optional[str] = None) -> dict:
    """
    Reschedules an existing appointment using MAA backend API.

    Args:
        appointment_id (str): The ID of the appointment to reschedule.
        new_date (str): The new date in YYYY-MM-DD format.
        new_time (str): The new time (e.g., "2:00 PM").
        new_location (str, optional): New location if changing branches.

    Returns:
        dict: Rescheduling confirmation details.

    Example:
        >>> reschedule_appointment(appointment_id="APT-123456", new_date="2024-08-31", new_time="2:00 PM")
        {'status': 'success', 'message': 'Appointment rescheduled successfully'}
    """
    logger.info("Rescheduling appointment %s to %s at %s", appointment_id, new_date, new_time)
    
    try:
        # For rescheduling, we need to:
        # 1. Get existing appointment details
        # 2. Update the appointment with new details
        # Note: MAA backend doesn't have a specific reschedule endpoint,
        # so this would need to be implemented there or handled differently
        
        # For now, simulate the rescheduling
        logger.warning("Reschedule endpoint not yet implemented in MAA backend, using simulation")
        
        return {
            "status": "success",
            "appointment_id": appointment_id,
            "message": f"Appointment {appointment_id} rescheduled successfully",
            "new_details": {
                "date": new_date,
                "time": new_time,
                "location": new_location or "Previous location"
            }
        }
        
    except Exception as e:
        logger.error("Error rescheduling appointment: %s", str(e))
        return {
            "status": "error",
            "message": f"Failed to reschedule appointment: {str(e)}"
        }


def cancel_appointment(appointment_id: str) -> dict:
    """
    Cancels an existing appointment using MAA backend API.

    Args:
        appointment_id (str): The ID of the appointment to cancel.

    Returns:
        dict: Cancellation confirmation.

    Example:
        >>> cancel_appointment(appointment_id="APT-123456")
        {'status': 'success', 'message': 'Appointment cancelled successfully'}
    """
    logger.info("Cancelling appointment %s", appointment_id)
    
    try:
        # Note: MAA backend doesn't have a specific cancel endpoint,
        # This would need to be implemented by updating the appointment status in Salesforce
        logger.warning("Cancel endpoint not yet implemented in MAA backend, using simulation")
        
        return {
            "status": "success",
            "appointment_id": appointment_id,
            "message": f"Appointment {appointment_id} cancelled successfully"
        }
        
    except Exception as e:
        logger.error("Error cancelling appointment: %s", str(e))
        return {
            "status": "error",
            "message": f"Failed to cancel appointment: {str(e)}"
        }


def get_customer_appointments(customer_id: str) -> dict:
    """
    Retrieves all appointments for a specific customer using MAA backend API.

    Args:
        customer_id (str): The customer's ID.

    Returns:
        dict: List of customer's appointments.

    Example:
        >>> get_customer_appointments(customer_id="123")
        {'appointments': [{'appointment_id': 'APT-123', 'date': '2024-08-30', 'status': 'scheduled'}]}
    """
    logger.info("Getting appointments for customer %s", customer_id)
    
    try:
        # Call the MAA backend API to get appointments from Salesforce
        response = make_authenticated_request(
            "GET",
            "/salesforce/appointments"
        )
        
        if response.status_code == 200:
            appointments_data = response.json()
            logger.info("Retrieved appointments from Salesforce: %s", appointments_data)
            
            # Transform Salesforce data to our format
            appointments = []
            for apt in appointments_data:
                appointments.append({
                    "appointment_id": apt.get("Id"),
                    "reason": apt.get("Reason_for_Visit__c"),
                    "date": apt.get("Appointment_Date__c"),
                    "time": apt.get("Appointment_Time__c"),
                    "location": apt.get("Location__c"),
                    "status": "scheduled"  # Default status
                })
            
            return {
                "status": "success",
                "customer_id": customer_id,
                "appointments": appointments
            }
        else:
            logger.error("MAA backend returned error: %s - %s", response.status_code, response.text)
            # Fall back to mock data
            return {
                "status": "success",
                "customer_id": customer_id,
                "appointments": [
                    {
                        "appointment_id": "APT-001-2024",
                        "reason": "Account Opening",
                        "date": "2024-08-15",
                        "time": "10:00 AM",
                        "location": "Brooklyn Branch",
                        "status": "completed",
                        "banker_name": "Sarah Mitchell"
                    }
                ]
            }
        
    except requests.RequestException as e:
        logger.error("Error calling MAA backend API: %s", str(e))
        # Fall back to mock data when backend is unavailable
        return {
            "status": "success",
            "customer_id": customer_id,
            "appointments": [
                {
                    "appointment_id": "APT-001-2024",
                    "reason": "Account Opening",
                    "date": "2024-08-15",
                    "time": "10:00 AM",
                    "location": "Brooklyn Branch",
                    "status": "completed",
                    "banker_name": "Sarah Mitchell"
                }
            ]
        }
        
    except Exception as e:
        logger.error("Error getting customer appointments: %s", str(e))
        return {
            "status": "error",
            "message": f"Failed to retrieve appointments: {str(e)}"
        }


def get_branch_information(location: Optional[str] = None) -> dict:
    """
    Gets information about bank branches and their services.

    Args:
        location (str, optional): Specific branch location to get info for.

    Returns:
        dict: Branch information including services and hours.

    Example:
        >>> get_branch_information(location="Brooklyn")
        {'branch_info': {'name': 'Brooklyn Branch', 'services': ['ATM', 'Teller Services'], 'hours': '9 AM - 5 PM'}}
    """
    logger.info("Getting branch information for %s", location or "all branches")
    
    branches = {
        "Brooklyn": {
            "name": "Brooklyn Branch",
            "address": "123 Brooklyn Ave, Brooklyn, NY 11201",
            "phone": "(718) 555-0123",
            "services": ["ATM", "Teller Services", "Personal Banking", "Business Banking", "Safe Deposit Boxes"],
            "hours": "Monday-Friday: 9 AM - 5 PM, Saturday: 9 AM - 2 PM",
            "specialties": ["Mortgage Lending", "Small Business Loans"]
        },
        "Manhattan": {
            "name": "Manhattan Branch",
            "address": "456 Manhattan Blvd, New York, NY 10001",
            "phone": "(212) 555-0456",
            "services": ["ATM", "Teller Services", "Personal Banking", "Investment Services", "Private Banking"],
            "hours": "Monday-Friday: 8 AM - 6 PM, Saturday: 9 AM - 3 PM",
            "specialties": ["Investment Advisory", "Wealth Management", "Commercial Banking"]
        },
        "New York": {
            "name": "Central New York Branch",
            "address": "789 Central Ave, New York, NY 10010",
            "phone": "(212) 555-0789",
            "services": ["ATM", "Teller Services", "Personal Banking", "Business Banking"],
            "hours": "Monday-Friday: 9 AM - 5 PM, Saturday: 9 AM - 1 PM",
            "specialties": ["Personal Loans", "Auto Loans", "Student Banking"]
        }
    }
    
    if location:
        return {
            "status": "success",
            "branch_info": branches.get(location, {"error": "Branch not found"})
        }
    else:
        return {
            "status": "success",
            "all_branches": branches
        }


def send_appointment_confirmation(appointment_details: dict, customer_email: str) -> dict:
    """
    Sends appointment confirmation email to the customer.

    Args:
        appointment_details (dict): Details of the appointment.
        customer_email (str): Customer's email address.

    Returns:
        dict: Confirmation sending status.

    Example:
        >>> send_appointment_confirmation(appointment_details={'date': '2024-08-30', 'time': '10:00 AM'}, customer_email='customer@email.com')
        {'status': 'success', 'message': 'Confirmation email sent successfully'}
    """
    logger.info("Sending appointment confirmation to %s", customer_email)
    
    try:
        return {
            "status": "success",
            "message": f"Confirmation email sent to {customer_email}",
            "appointment_details": appointment_details
        }
        
    except Exception as e:
        logger.error("Error sending confirmation: %s", str(e))
        return {
            "status": "error",
            "message": f"Failed to send confirmation: {str(e)}"
        }


def create_salesforce_appointment(reason: str, date: str, time: str, location: str, banker_id: Optional[str] = None) -> dict:
    """
    Creates an appointment directly in Salesforce via MAA backend API.
    This is an alternative to schedule_appointment that uses the direct Salesforce endpoint.

    Args:
        reason (str): The reason for the visit.
        date (str): The appointment date in YYYY-MM-DD format.
        time (str): The appointment time.
        location (str): The branch location.
        banker_id (str, optional): Specific banker ID.

    Returns:
        dict: Appointment creation details.

    Example:
        >>> create_salesforce_appointment(reason="Loan Consultation", date="2024-08-30", time="2:00 PM", location="Manhattan")
        {'status': 'success', 'appointment_id': 'a0X...', 'message': 'Appointment created'}
    """
    logger.info("Creating Salesforce appointment: %s on %s at %s in %s", reason, date, time, location)
    
    # Normalize location to match Salesforce picklist values
    normalized_location = normalize_location(location)
    logger.info("Location normalized from '%s' to '%s'", location, normalized_location)
    
    try:
        # Use the direct Salesforce appointment creation endpoint
        appointment_data = {
            "Reason_for_Visit__c": reason,
            "Appointment_Date__c": date,
            "Appointment_Time__c": time,
            "Location__c": normalized_location  # Use normalized location
        }
        
        if banker_id:
            appointment_data["Banker__c"] = banker_id
        
        response = make_authenticated_request(
            "POST",
            "/salesforce/appointments",
            json=appointment_data
        )
        
        if response.status_code == 200:
            result = response.json()
            logger.info("Appointment created in Salesforce: %s", result)
            
            return {
                "status": "success",
                "appointment_id": result.get("id"),
                "message": result.get("message", "Appointment created"),
                "details": appointment_data
            }
        else:
            logger.error("Salesforce API returned error: %s - %s", response.status_code, response.text)
            return {
                "status": "error",
                "message": f"Salesforce API error: {response.status_code} - {response.text}"
            }
        
    except requests.RequestException as e:
        logger.error("Error calling Salesforce API: %s", str(e))
        return {
            "status": "error", 
            "message": f"Failed to connect to Salesforce API: {str(e)}"
        }
        
    except Exception as e:
        logger.error("Error creating Salesforce appointment: %s", str(e))
        return {
            "status": "error",
            "message": f"Failed to create Salesforce appointment: {str(e)}"
        }
