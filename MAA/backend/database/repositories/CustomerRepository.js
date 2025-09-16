/**
 * Customer Repository
 * Handles all customer-related database operations
 */

import { query, withTransaction } from '../connection.js';

export class CustomerRepository {
  /**
   * Find customer by customer ID
   * @param {string} customerId - Customer ID
   * @returns {Promise<Object|null>} Customer object or null
   */
  async findByCustomerId(customerId) {
    const result = await query(
      'SELECT * FROM customers WHERE customer_id = $1',
      [customerId]
    );
    return result.rows[0] || null;
  }

  /**
   * Find customer by email
   * @param {string} email - Customer email
   * @returns {Promise<Object|null>} Customer object or null
   */
  async findByEmail(email) {
    const result = await query(
      'SELECT * FROM customers WHERE email = $1',
      [email]
    );
    return result.rows[0] || null;
  }

  /**
   * Get customer with all related data (accounts, appointments)
   * @param {string} customerId - Customer ID
   * @returns {Promise<Object|null>} Complete customer profile
   */
  async getCustomerProfile(customerId) {
    const customer = await this.findByCustomerId(customerId);
    if (!customer) return null;

    // Get bank accounts
    const accountsResult = await query(
      'SELECT * FROM bank_accounts WHERE customer_id = $1 ORDER BY created_at',
      [customer.id]
    );

    // Get appointment history
    const appointmentsResult = await query(`
      SELECT a.*, b.name as branch_name, b.location_code 
      FROM appointments a 
      JOIN branches b ON a.branch_id = b.id 
      WHERE a.customer_id = $1 
      ORDER BY a.appointment_date DESC, a.appointment_time DESC
    `, [customer.id]);

    return {
      contact_id: customer.id, // For compatibility with existing code
      customer_id: customer.customer_id,
      customer_first_name: customer.first_name,
      customer_last_name: customer.last_name,
      email: customer.email,
      phone_number: customer.phone_number,
      customer_start_date: customer.customer_start_date,
      years_as_customer: customer.years_as_customer,
      billing_address: customer.billing_address,
      accounts: accountsResult.rows.map(account => ({
        account_id: account.account_id,
        account_type: account.account_type,
        balance: parseFloat(account.balance),
        status: account.status
      })),
      appointment_history: appointmentsResult.rows.map(apt => ({
        appointment_id: apt.appointment_id,
        reason: apt.reason,
        date: apt.appointment_date,
        time: apt.appointment_time.substring(0, 5), // Format HH:MM
        location: apt.location_code,
        status: apt.status,
        banker_name: apt.banker_name
      })),
      preferred_branch: customer.bank_profile?.preferred_branch || 'Manhattan',
      communication_preferences: customer.communication_preferences,
      bank_profile: customer.bank_profile,
      current_appointment: null // Will be populated if there's a pending appointment
    };
  }

  /**
   * Create a new customer
   * @param {Object} customerData - Customer data
   * @returns {Promise<Object>} Created customer
   */
  async create(customerData) {
    const {
      customer_id,
      first_name,
      last_name,
      email,
      phone_number,
      customer_start_date,
      years_as_customer,
      billing_address,
      communication_preferences,
      bank_profile
    } = customerData;

    const result = await query(`
      INSERT INTO customers (
        customer_id, first_name, last_name, email, phone_number,
        customer_start_date, years_as_customer, billing_address,
        communication_preferences, bank_profile
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      customer_id, first_name, last_name, email, phone_number,
      customer_start_date, years_as_customer, 
      JSON.stringify(billing_address),
      JSON.stringify(communication_preferences),
      JSON.stringify(bank_profile)
    ]);

    return result.rows[0];
  }

  /**
   * Update customer information
   * @param {string} customerId - Customer ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated customer
   */
  async update(customerId, updates) {
    const customer = await this.findByCustomerId(customerId);
    if (!customer) throw new Error('Customer not found');

    const setClause = [];
    const values = [];
    let paramIndex = 1;

    Object.keys(updates).forEach(key => {
      if (key === 'billing_address' || key === 'communication_preferences' || key === 'bank_profile') {
        setClause.push(`${key} = $${paramIndex}`);
        values.push(JSON.stringify(updates[key]));
      } else {
        setClause.push(`${key} = $${paramIndex}`);
        values.push(updates[key]);
      }
      paramIndex++;
    });

    values.push(customer.id);

    const result = await query(`
      UPDATE customers 
      SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);

    return result.rows[0];
  }

  /**
   * Delete a customer and all related data
   * @param {string} customerId - Customer ID
   * @returns {Promise<boolean>} Success status
   */
  async delete(customerId) {
    const customer = await this.findByCustomerId(customerId);
    if (!customer) return false;

    await query('DELETE FROM customers WHERE id = $1', [customer.id]);
    return true;
  }

  /**
   * Search customers by name or email
   * @param {string} searchTerm - Search term
   * @returns {Promise<Array>} Array of customers
   */
  async search(searchTerm) {
    const result = await query(`
      SELECT customer_id, first_name, last_name, email, phone_number
      FROM customers 
      WHERE 
        first_name ILIKE $1 OR 
        last_name ILIKE $1 OR 
        email ILIKE $1
      ORDER BY last_name, first_name
      LIMIT 50
    `, [`%${searchTerm}%`]);

    return result.rows;
  }
}

export default new CustomerRepository();
