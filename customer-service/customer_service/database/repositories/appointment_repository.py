"""
Appointment Repository for MAA Banking System
Handles all appointment-related database operations
"""

import logging
import uuid
from typing import Optional, List, Dict, Any
from datetime import datetime, date, time
from .. import execute_query, execute_mutation

logger = logging.getLogger(__name__)


class AppointmentRepository:
    """Repository class for appointment operations"""
    
    def create_appointment(self, appointment_data: Dict[str, Any]) -> Optional[str]:
        """
        Create a new appointment
        
        Args:
            appointment_data: Appointment information dictionary
            
        Returns:
            Appointment ID if successful, None otherwise
        """
        try:
            # Get customer and branch IDs
            customer = execute_query(
                "SELECT id FROM customers WHERE customer_id = %s",
                (appointment_data['customer_id'],),
                fetch_one=True
            )
            
            branch = execute_query(
                "SELECT id FROM branches WHERE location_code = %s",
                (appointment_data['location'],),
                fetch_one=True
            )
            
            if not customer or not branch:
                logger.error(f"Customer or branch not found for appointment")
                return None
            
            # Generate unique appointment ID
            appointment_id = f"APT-{uuid.uuid4().hex[:10].upper()}"
            
            result = execute_mutation("""
                INSERT INTO appointments (
                    appointment_id, customer_id, branch_id, reason, 
                    appointment_date, appointment_time, status, banker_name, banker_id
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING appointment_id
            """, (
                appointment_id,
                customer['id'],
                branch['id'],
                appointment_data['reason'],
                appointment_data['date'],
                appointment_data['time'],
                appointment_data.get('status', 'scheduled'),
                appointment_data.get('banker_name'),
                appointment_data.get('banker_id')
            ), return_id=True)
            
            return result['appointment_id'] if result else None
            
        except Exception as e:
            logger.error(f"Error creating appointment: {e}")
            return None
    
    def get_appointment_by_id(self, appointment_id: str) -> Optional[Dict[str, Any]]:
        """
        Get appointment by appointment ID
        
        Args:
            appointment_id: Appointment ID
            
        Returns:
            Appointment dictionary or None if not found
        """
        try:
            appointment = execute_query("""
                SELECT 
                    a.*, 
                    c.customer_id, c.first_name, c.last_name, c.email,
                    b.name as branch_name, b.location_code
                FROM appointments a
                JOIN customers c ON a.customer_id = c.id
                JOIN branches b ON a.branch_id = b.id
                WHERE a.appointment_id = %s
            """, (appointment_id,), fetch_one=True)
            
            if not appointment:
                return None
            
            return {
                "appointment_id": appointment['appointment_id'],
                "customer_id": appointment['customer_id'],
                "customer_name": f"{appointment['first_name']} {appointment['last_name']}",
                "customer_email": appointment['email'],
                "reason": appointment['reason'],
                "date": appointment['appointment_date'].isoformat() if appointment['appointment_date'] else None,
                "time": str(appointment['appointment_time'])[:5] if appointment['appointment_time'] else None,
                "location": appointment['location_code'],
                "branch_name": appointment['branch_name'],
                "status": appointment['status'],
                "banker_name": appointment['banker_name'],
                "banker_id": appointment['banker_id'],
                "created_at": appointment['created_at'].isoformat() if appointment['created_at'] else None
            }
            
        except Exception as e:
            logger.error(f"Error getting appointment {appointment_id}: {e}")
            return None
    
    def update_appointment_status(self, appointment_id: str, status: str) -> bool:
        """
        Update appointment status
        
        Args:
            appointment_id: Appointment ID
            status: New status (scheduled, completed, cancelled, rescheduled)
            
        Returns:
            True if successful, False otherwise
        """
        try:
            rowcount = execute_mutation("""
                UPDATE appointments 
                SET status = %s, updated_at = CURRENT_TIMESTAMP
                WHERE appointment_id = %s
            """, (status, appointment_id))
            
            return rowcount > 0
            
        except Exception as e:
            logger.error(f"Error updating appointment status {appointment_id}: {e}")
            return False
    
    def reschedule_appointment(self, appointment_id: str, new_date: str, new_time: str, new_location: Optional[str] = None) -> bool:
        """
        Reschedule an appointment
        
        Args:
            appointment_id: Appointment ID
            new_date: New appointment date (YYYY-MM-DD)
            new_time: New appointment time (HH:MM)
            new_location: New location (optional)
            
        Returns:
            True if successful, False otherwise
        """
        try:
            if new_location:
                # Get new branch ID
                branch = execute_query(
                    "SELECT id FROM branches WHERE location_code = %s",
                    (new_location,),
                    fetch_one=True
                )
                if not branch:
                    logger.error(f"Branch not found for location: {new_location}")
                    return False
                
                rowcount = execute_mutation("""
                    UPDATE appointments 
                    SET appointment_date = %s, appointment_time = %s, branch_id = %s, 
                        status = 'rescheduled', updated_at = CURRENT_TIMESTAMP
                    WHERE appointment_id = %s
                """, (new_date, new_time, branch['id'], appointment_id))
            else:
                rowcount = execute_mutation("""
                    UPDATE appointments 
                    SET appointment_date = %s, appointment_time = %s, 
                        status = 'rescheduled', updated_at = CURRENT_TIMESTAMP
                    WHERE appointment_id = %s
                """, (new_date, new_time, appointment_id))
            
            return rowcount > 0
            
        except Exception as e:
            logger.error(f"Error rescheduling appointment {appointment_id}: {e}")
            return False
    
    def get_customer_appointments(self, customer_id: str, status: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Get all appointments for a customer
        
        Args:
            customer_id: Customer ID
            status: Optional status filter
            
        Returns:
            List of appointment dictionaries
        """
        try:
            # Get customer database ID
            customer = execute_query(
                "SELECT id FROM customers WHERE customer_id = %s",
                (customer_id,),
                fetch_one=True
            )
            
            if not customer:
                return []
            
            if status:
                appointments = execute_query("""
                    SELECT 
                        a.*, 
                        b.name as branch_name, b.location_code
                    FROM appointments a
                    JOIN branches b ON a.branch_id = b.id
                    WHERE a.customer_id = %s AND a.status = %s
                    ORDER BY a.appointment_date DESC, a.appointment_time DESC
                """, (customer['id'], status))
            else:
                appointments = execute_query("""
                    SELECT 
                        a.*, 
                        b.name as branch_name, b.location_code
                    FROM appointments a
                    JOIN branches b ON a.branch_id = b.id
                    WHERE a.customer_id = %s
                    ORDER BY a.appointment_date DESC, a.appointment_time DESC
                """, (customer['id'],))
            
            return [
                {
                    "appointment_id": apt['appointment_id'],
                    "reason": apt['reason'],
                    "date": apt['appointment_date'].isoformat() if apt['appointment_date'] else None,
                    "time": str(apt['appointment_time'])[:5] if apt['appointment_time'] else None,
                    "location": apt['location_code'],
                    "branch_name": apt['branch_name'],
                    "status": apt['status'],
                    "banker_name": apt['banker_name']
                }
                for apt in (appointments or [])
            ]
            
        except Exception as e:
            logger.error(f"Error getting appointments for customer {customer_id}: {e}")
            return []
    
    def cancel_appointment(self, appointment_id: str) -> bool:
        """
        Cancel an appointment
        
        Args:
            appointment_id: Appointment ID
            
        Returns:
            True if successful, False otherwise
        """
        return self.update_appointment_status(appointment_id, 'cancelled')
    
    def get_available_times(self, date_str: str, location: str) -> List[str]:
        """
        Get available appointment times for a given date and location
        
        Args:
            date_str: Date in YYYY-MM-DD format
            location: Branch location code
            
        Returns:
            List of available time slots
        """
        try:
            # Get branch ID
            branch = execute_query(
                "SELECT id FROM branches WHERE location_code = %s",
                (location,),
                fetch_one=True
            )
            
            if not branch:
                logger.error(f"Branch not found for location: {location}")
                return []
            
            # Get booked times for the date
            booked_times = execute_query("""
                SELECT appointment_time 
                FROM appointments 
                WHERE branch_id = %s 
                AND appointment_date = %s 
                AND status IN ('scheduled', 'rescheduled')
            """, (branch['id'], date_str))
            
            # Define all possible time slots
            all_times = [
                "9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", 
                "11:30 AM", "2:00 PM", "2:30 PM", "3:00 PM", "3:30 PM", 
                "4:00 PM", "4:30 PM"
            ]
            
            # Convert booked times to comparable format
            booked_time_strings = []
            for booking in (booked_times or []):
                time_obj = booking['appointment_time']
                if time_obj:
                    # Convert time to 12-hour format
                    hour = time_obj.hour
                    minute = time_obj.minute
                    period = "AM" if hour < 12 else "PM"
                    display_hour = hour if hour <= 12 else hour - 12
                    if display_hour == 0:
                        display_hour = 12
                    booked_time_strings.append(f"{display_hour}:{minute:02d} {period}")
            
            # Filter out booked times
            available_times = [t for t in all_times if t not in booked_time_strings]
            
            return available_times
            
        except Exception as e:
            logger.error(f"Error getting available times for {date_str} at {location}: {e}")
            return []


# Global instance
appointment_repository = AppointmentRepository()
