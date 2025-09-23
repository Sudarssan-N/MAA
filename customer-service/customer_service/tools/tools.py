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
"""Tools module for the MAA appointment booking agent - Direct Database Version."""

import logging
import uuid
from datetime import datetime, timedelta
from typing import Optional
from google.adk.tools import ToolContext
from ..database.repositories import customer_repository, appointment_repository, branch_repository
from ..shared_libraries.token_tracker import TokenUsageTracker

logger = logging.getLogger(__name__)

# Location mapping to normalize user-friendly location names
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
    Convert user-friendly location names to database location codes.
    
    Args:
        location: User-friendly location name
        
    Returns:
        Database-compatible location code
    """
    if not location:
        return location
        
    # Check exact match first
    if location in LOCATION_MAPPING:
        return LOCATION_MAPPING[location]
    
    # Check case-insensitive match
    for user_name, db_code in LOCATION_MAPPING.items():
        if location.lower() == user_name.lower():
            return db_code
    
    # If no mapping found, return as is (might be already correct)
    return location


def _convert_to_24_hour_format(time_str: str) -> str:
    """
    Convert 12-hour time format to 24-hour format for database storage.
    
    Args:
        time_str: Time in 12-hour format (e.g., "2:30 PM")
        
    Returns:
        Time in 24-hour format (e.g., "14:30:00")
    """
    try:
        # Parse the time string
        time_obj = datetime.strptime(time_str, "%I:%M %p")
        return time_obj.strftime("%H:%M:%S")
    except ValueError:
        # If parsing fails, try without leading zero
        try:
            time_obj = datetime.strptime(time_str, "%I:%M%p")  # No space before AM/PM
            return time_obj.strftime("%H:%M:%S")
        except ValueError:
            # If still fails, return as-is and let database handle it
            logger.warning(f"Could not parse time format: {time_str}")
            return time_str


def get_available_appointment_times(date: str, location: str) -> dict:
    """
    Gets available appointment time slots for a specific date and location.

    Args:
        date (str): The date in YYYY-MM-DD format.
        location (str): The branch location (Brooklyn, Manhattan, or Downtown).

    Returns:
        dict: Available time slots for the specified date and location.

    Example:
        >>> get_available_appointment_times(date='2024-08-30', location='Brooklyn')
        {'available_times': ['9:00 AM', '10:30 AM', '2:00 PM', '4:30 PM']}
    """
    logger.info("Getting available appointment times for %s at %s", date, location)
    
    # Normalize location to database format
    normalized_location = normalize_location(location)
    
    try:
        # Get available times from database
        available_times = appointment_repository.get_available_times(date, normalized_location)
        
        return {
            "status": "success", 
            "date": date,
            "location": location,
            "available_times": available_times
        }
        
    except Exception as e:
        logger.error("Error getting available appointment times: %s", str(e))
        return {
            "status": "error",
            "message": f"Failed to get available times: {str(e)}"
        }


def schedule_appointment(reason: str, date: str, time: str, location: str, banker_id: Optional[str] = None) -> dict:
    """
    Schedules a new appointment with the bank using direct database access.

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
    
    # Normalize location to database format
    normalized_location = normalize_location(location)
    logger.info("Location normalized from '%s' to '%s'", location, normalized_location)
    
    try:
        # Convert 12-hour time to 24-hour format for database
        time_24h = _convert_to_24_hour_format(time)
        
        # Prepare appointment data for database
        appointment_data = {
            "customer_id": "123",  # Default customer ID (Jack Rogers)
            "reason": reason,
            "date": date,
            "time": time_24h,
            "location": normalized_location,
            "status": "scheduled"
        }
        
        if banker_id:
            appointment_data["banker_id"] = banker_id
        
        logger.info("Creating appointment in database: %s", appointment_data)
        
        # Create appointment in database
        appointment_id = appointment_repository.create_appointment(appointment_data)
        
        if appointment_id:
            logger.info("Appointment created successfully: %s", appointment_id)
            
            return {
                "status": "success",
                "appointment_id": appointment_id,
                "confirmation": f"Your appointment is confirmed! Your Appointment ID is {appointment_id}.",
                "details": {
                    "reason": reason,
                    "date": date,
                    "time": time,
                    "location": normalized_location,
                    "banker_id": banker_id
                }
            }
        else:
            logger.error("Failed to create appointment in database")
            return {
                "status": "error",
                "message": "Failed to schedule appointment"
            }
        
    except Exception as e:
        logger.error("Unexpected error scheduling appointment: %s", str(e))
        return {
            "status": "error",
            "message": f"Unexpected error: {str(e)}"
        }


def reschedule_appointment(appointment_id: str, new_date: str, new_time: str, new_location: Optional[str] = None) -> dict:
    """
    Reschedules an existing appointment using direct database access.

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
        # Normalize location if provided
        normalized_location = normalize_location(new_location) if new_location else None
        
        # Convert time to 24-hour format
        time_24h = _convert_to_24_hour_format(new_time)
        
        # Reschedule appointment in database
        success = appointment_repository.reschedule_appointment(
            appointment_id, new_date, time_24h, normalized_location
        )
        
        if success:
            logger.info("Appointment %s rescheduled successfully", appointment_id)
            return {
                "status": "success",
                "message": f"Appointment {appointment_id} rescheduled to {new_date} at {new_time}",
                "details": {
                    "appointment_id": appointment_id,
                    "new_date": new_date,
                    "new_time": new_time,
                    "new_location": new_location
                }
            }
        else:
            return {
                "status": "error",
                "message": f"Failed to reschedule appointment {appointment_id}"
            }
        
    except Exception as e:
        logger.error("Error rescheduling appointment %s: %s", appointment_id, str(e))
        return {
            "status": "error",
            "message": f"Error rescheduling appointment: {str(e)}"
        }


def cancel_appointment(appointment_id: str) -> dict:
    """
    Cancels an existing appointment using direct database access.

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
        # Cancel appointment in database
        success = appointment_repository.cancel_appointment(appointment_id)
        
        if success:
            logger.info("Appointment %s cancelled successfully", appointment_id)
            return {
                "status": "success",
                "message": f"Appointment {appointment_id} has been cancelled",
                "appointment_id": appointment_id
            }
        else:
            return {
                "status": "error",
                "message": f"Failed to cancel appointment {appointment_id} - appointment may not exist"
            }
        
    except Exception as e:
        logger.error("Error cancelling appointment %s: %s", appointment_id, str(e))
        return {
            "status": "error",
            "message": f"Error cancelling appointment: {str(e)}"
        }


def get_customer_appointments(customer_id: str) -> dict:
    """
    Retrieves all appointments for a specific customer using direct database access.

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
        # Get appointments from database
        appointments = appointment_repository.get_customer_appointments(customer_id)
        
        return {
            "status": "success",
            "customer_id": customer_id,
            "appointments": appointments
        }
        
    except Exception as e:
        logger.error("Error getting appointments for customer %s: %s", customer_id, str(e))
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
    
    try:
        if location:
            normalized_location = normalize_location(location)
            branch_info = branch_repository.get_branch_info_formatted(normalized_location)
        else:
            branch_info = branch_repository.get_branch_info_formatted()
        
        return {
            "status": "success",
            **branch_info
        }
        
    except Exception as e:
        logger.error("Error getting branch information: %s", str(e))
        return {
            "status": "error",
            "message": f"Failed to retrieve branch information: {str(e)}"
        }


def send_appointment_confirmation(appointment_details: dict, customer_email: str) -> dict:
    """
    Sends an appointment confirmation email to the customer.

    Args:
        appointment_details (dict): The appointment details.
        customer_email (str): The customer's email address.

    Returns:
        dict: Confirmation that the email was sent.

    Example:
        >>> send_appointment_confirmation({'appointment_id': 'APT-123'}, 'customer@email.com')
        {'status': 'success', 'message': 'Confirmation email sent'}
    """
    logger.info("Sending appointment confirmation to %s", customer_email)
    
    try:
        # In a real implementation, this would integrate with an email service
        # For now, we'll simulate the email sending
        
        appointment_id = appointment_details.get('appointment_id', 'Unknown')
        reason = appointment_details.get('reason', 'Banking Appointment')
        date = appointment_details.get('date', 'TBD')
        time = appointment_details.get('time', 'TBD')
        location = appointment_details.get('location', 'TBD')
        
        # Simulate email content
        email_subject = f"Appointment Confirmation - {appointment_id}"
        email_body = f"""
Dear Customer,

Your appointment has been confirmed:

Appointment ID: {appointment_id}
Reason: {reason}
Date: {date}
Time: {time}
Location: {location}

Required Documents:
- Valid government-issued ID (Driver's License, Passport)
- Proof of address (utility bill, bank statement)
- Social Security Number or ITIN
- Proof of income (pay stubs, tax returns, bank statements)

Thank you for choosing our banking services.

Best regards,
Big Bank MAA Banking Assistant
        """
        
        logger.info("Email would be sent with subject: %s", email_subject)
        
        return {
            "status": "success",
            "message": f"Confirmation email sent to {customer_email}",
            "appointment_details": appointment_details
        }
        
    except Exception as e:
        logger.error("Error sending confirmation email: %s", str(e))
        return {
            "status": "error",
            "message": f"Failed to send confirmation email: {str(e)}"
        }


def create_salesforce_appointment(reason: str, date: str, time: str, location: str, banker_id: Optional[str] = None) -> dict:
    """
    Legacy function - now redirects to schedule_appointment for backward compatibility.

    Args:
        reason (str): The reason for the visit.
        date (str): The appointment date in YYYY-MM-DD format.
        time (str): The appointment time.
        location (str): The branch location.
        banker_id (str, optional): Specific banker ID if customer has a preference.

    Returns:
        dict: Appointment confirmation details.
    """
    logger.info("create_salesforce_appointment called - redirecting to schedule_appointment")
    return schedule_appointment(reason, date, time, location, banker_id)


def get_token_usage_stats(tool_context: ToolContext) -> dict:
    """
    Get current session token usage statistics and cost estimates.
    
    Args:
        tool_context: The tool context containing session state
        
    Returns:
        dict: Token usage statistics and cost estimates
        
    Example:
        >>> get_token_usage_stats()
        {'status': 'success', 'total_tokens': 1250, 'estimated_cost': 0.001875}
    """
    try:
        stats = TokenUsageTracker.get_session_stats(tool_context.state)
        
        if stats["status"] == "no_data":
            return {
                "status": "info", 
                "message": "No token usage data available yet. This will be populated after the first model interaction.",
                "total_tokens": 0,
                "estimated_cost": 0.0
            }
        
        return {
            "status": "success",
            "message": f"Session has used {stats['total_tokens']:,} tokens across {stats['total_requests']} requests",
            "session_duration_minutes": stats["session_duration_minutes"],
            "total_requests": stats["total_requests"], 
            "input_tokens": stats["input_tokens"],
            "output_tokens": stats["output_tokens"],
            "total_tokens": stats["total_tokens"],
            "average_tokens_per_request": stats["average_tokens_per_request"],
            "tokens_per_minute": stats["tokens_per_minute"],
            "estimated_cost_usd": stats["cost_estimation"]["total_cost_usd"],
            "cost_per_request_usd": stats["cost_estimation"]["cost_per_request_usd"]
        }
        
    except Exception as e:
        logger.error("Error getting token usage stats: %s", str(e))
        return {
            "status": "error",
            "message": f"Failed to retrieve token usage stats: {str(e)}"
        }
