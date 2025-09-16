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
"""Bank customer entity module."""

from typing import List, Dict, Optional
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime


class Address(BaseModel):
    """
    Represents a customer's address.
    """

    street: str
    city: str
    state: str
    zip: str
    model_config = ConfigDict(from_attributes=True)


class BankAccount(BaseModel):
    """
    Represents a customer's bank account.
    """

    account_id: str
    account_type: str  # checking, savings, credit_card, etc.
    balance: float
    status: str
    model_config = ConfigDict(from_attributes=True)


class Appointment(BaseModel):
    """
    Represents a customer's appointment.
    """

    appointment_id: str
    reason: str
    date: str
    time: str
    location: str
    status: str  # scheduled, completed, cancelled, rescheduled
    banker_name: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)
    model_config = ConfigDict(from_attributes=True)


class CommunicationPreferences(BaseModel):
    """
    Represents a customer's communication preferences.
    """

    email: bool = True
    sms: bool = True
    push_notifications: bool = True
    model_config = ConfigDict(from_attributes=True)


class BankProfile(BaseModel):
    """
    Represents a customer's banking profile.
    """

    primary_account_type: str
    preferred_banker: Optional[str] = None
    preferred_branch: str
    service_interests: List[str]
    credit_score: Optional[int] = None
    model_config = ConfigDict(from_attributes=True)


class Customer(BaseModel):
    """
    Represents a bank customer.
    """

    contact_id: str  # Salesforce Contact ID
    customer_id: str
    customer_first_name: str
    customer_last_name: str
    email: str
    phone_number: str
    customer_start_date: str
    years_as_customer: int
    billing_address: Address
    accounts: List[BankAccount]
    appointment_history: List[Appointment]
    preferred_branch: str
    communication_preferences: CommunicationPreferences
    bank_profile: BankProfile
    current_appointment: Optional[Dict] = Field(default=None)
    model_config = ConfigDict(from_attributes=True)

    def to_json(self) -> str:
        """
        Converts the Customer object to a JSON string.

        Returns:
            A JSON string representing the Customer object.
        """
        return self.model_dump_json(indent=4)

    @staticmethod
    def get_customer(current_customer_id: str) -> Optional["Customer"]:
        """
        Retrieves a bank customer based on their ID.

        Args:
            customer_id: The ID of the customer to retrieve.

        Returns:
            The Customer object if found, None otherwise.
        """
        # In a real application, this would involve a database lookup.
        # For this example, we'll return a dummy bank customer - Jack Rogers.
        return Customer(
            contact_id="003dM000005H5A7QAK",  # Salesforce Contact ID from server.js
            customer_id=current_customer_id,
            customer_first_name="Jack",
            customer_last_name="Rogers",
            email="jack.rogers@Big Bank.com",
            phone_number="+1-555-123-4567",
            customer_start_date="2020-03-15",
            years_as_customer=5,
            billing_address=Address(
                street="456 Banking Blvd", city="New York", state="NY", zip="10001"
            ),
            accounts=[
                BankAccount(
                    account_id="CHK-001-4567890",
                    account_type="Everyday Checking",
                    balance=2500.75,
                    status="active"
                ),
                BankAccount(
                    account_id="SAV-002-1234567",
                    account_type="Way2Save Savings",
                    balance=15000.00,
                    status="active"
                ),
                BankAccount(
                    account_id="CC-003-9876543",
                    account_type="Cash Back Credit Card",
                    balance=-1200.50,
                    status="active"
                )
            ],
            appointment_history=[
                Appointment(
                    appointment_id="APT-001-2024",
                    reason="Account Opening",
                    date="2024-08-15",
                    time="10:00 AM",
                    location="Brooklyn",  # Use Salesforce-compatible location
                    status="completed",
                    banker_name="Sarah Mitchell"
                ),
                Appointment(
                    appointment_id="APT-002-2024",
                    reason="Loan Consultation",
                    date="2024-08-20",
                    time="2:30 PM", 
                    location="Manhattan",  # Use Salesforce-compatible location
                    status="completed",
                    banker_name="Michael Chen"
                )
            ],
            preferred_branch="Manhattan",  # Use Salesforce-compatible location
            communication_preferences=CommunicationPreferences(
                email=True, sms=True, push_notifications=False
            ),
            bank_profile=BankProfile(
                primary_account_type="checking",
                preferred_banker="Sarah Mitchell",
                preferred_branch="Manhattan",  # Use Salesforce-compatible location
                service_interests=["mortgages", "investment advice", "credit cards"],
                credit_score=750
            ),
            current_appointment=None
        )
