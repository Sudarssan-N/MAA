"""
Customer Repository for MAA Banking System
Handles all customer-related database operations
"""

import logging
import uuid
from typing import Optional, List, Dict, Any
from datetime import datetime, date
from ..  import execute_query, execute_mutation

logger = logging.getLogger(__name__)


class CustomerRepository:
    """Repository class for customer operations"""
    
    def get_customer_by_id(self, customer_id: str) -> Optional[Dict[str, Any]]:
        """
        Get customer by customer_id with full profile including accounts and appointment history
        
        Args:
            customer_id: The customer's ID
            
        Returns:
            Complete customer profile dictionary or None if not found
        """
        try:
            # Get customer basic info
            customer = execute_query(
                "SELECT * FROM customers WHERE customer_id = %s",
                (customer_id,),
                fetch_one=True
            )
            
            if not customer:
                return None
            
            # Get bank accounts
            accounts = execute_query(
                "SELECT * FROM bank_accounts WHERE customer_id = %s ORDER BY created_at",
                (customer['id'],)
            )
            
            # Get appointment history with branch info
            appointments = execute_query("""
                SELECT a.*, b.name as branch_name, b.location_code 
                FROM appointments a 
                JOIN branches b ON a.branch_id = b.id 
                WHERE a.customer_id = %s 
                ORDER BY a.appointment_date DESC, a.appointment_time DESC
            """, (customer['id'],))
            
            # Format the response to match the existing structure
            return {
                "contact_id": str(customer['id']),  # Keep for compatibility
                "customer_id": customer['customer_id'],
                "customer_first_name": customer['first_name'],
                "customer_last_name": customer['last_name'],
                "email": customer['email'],
                "phone_number": customer['phone_number'],
                "customer_start_date": customer['customer_start_date'].isoformat() if customer['customer_start_date'] else None,
                "years_as_customer": customer['years_as_customer'] or 0,
                "billing_address": customer['billing_address'] or {},
                "accounts": [
                    {
                        "account_id": acc['account_id'],
                        "account_type": acc['account_type'],
                        "balance": float(acc['balance']),
                        "status": acc['status']
                    }
                    for acc in (accounts or [])
                ],
                "appointment_history": [
                    {
                        "appointment_id": apt['appointment_id'],
                        "reason": apt['reason'],
                        "date": apt['appointment_date'].isoformat() if apt['appointment_date'] else None,
                        "time": str(apt['appointment_time'])[:5] if apt['appointment_time'] else None,  # Format as HH:MM
                        "location": apt['location_code'],
                        "status": apt['status'],
                        "banker_name": apt['banker_name']
                    }
                    for apt in (appointments or [])
                ],
                "preferred_branch": (customer['bank_profile'] or {}).get('preferred_branch', 'Manhattan'),
                "communication_preferences": customer['communication_preferences'] or {
                    "email": True,
                    "sms": True, 
                    "push_notifications": False
                },
                "bank_profile": customer['bank_profile'] or {},
                "current_appointment": None  # Will be set if there's a pending appointment
            }
            
        except Exception as e:
            logger.error(f"Error getting customer {customer_id}: {e}")
            return None
    
    def create_customer(self, customer_data: Dict[str, Any]) -> Optional[str]:
        """
        Create a new customer
        
        Args:
            customer_data: Customer information dictionary
            
        Returns:
            Customer ID if successful, None otherwise
        """
        try:
            result = execute_mutation("""
                INSERT INTO customers (
                    customer_id, first_name, last_name, email, phone_number,
                    customer_start_date, years_as_customer, billing_address,
                    communication_preferences, bank_profile
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING customer_id
            """, (
                customer_data['customer_id'],
                customer_data['first_name'],
                customer_data['last_name'],
                customer_data['email'],
                customer_data.get('phone_number'),
                customer_data.get('customer_start_date'),
                customer_data.get('years_as_customer', 0),
                customer_data.get('billing_address'),
                customer_data.get('communication_preferences'),
                customer_data.get('bank_profile')
            ), return_id=True)
            
            return result['customer_id'] if result else None
            
        except Exception as e:
            logger.error(f"Error creating customer: {e}")
            return None
    
    def update_customer(self, customer_id: str, updates: Dict[str, Any]) -> bool:
        """
        Update customer information
        
        Args:
            customer_id: Customer ID to update
            updates: Dictionary of fields to update
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Build dynamic update query
            set_clauses = []
            values = []
            
            for field, value in updates.items():
                set_clauses.append(f"{field} = %s")
                values.append(value)
            
            if not set_clauses:
                return False
            
            values.append(customer_id)
            
            rowcount = execute_mutation(f"""
                UPDATE customers 
                SET {', '.join(set_clauses)}, updated_at = CURRENT_TIMESTAMP
                WHERE customer_id = %s
            """, tuple(values))
            
            return rowcount > 0
            
        except Exception as e:
            logger.error(f"Error updating customer {customer_id}: {e}")
            return False


# Global instance
customer_repository = CustomerRepository()
