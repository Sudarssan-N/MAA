/**
 * Database connection module for MAA Banking System
 * Handles PostgreSQL connection pool and basic database operations
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Database configuration
const dbConfig = {
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'maa_banking',
  password: process.env.DB_PASSWORD || 'postgres',
  port: process.env.DB_PORT || 5432,
  // Connection pool settings
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // How long a client is allowed to remain idle
  connectionTimeoutMillis: 2000, // How long to wait when connecting
};

// Create connection pool
const pool = new Pool(dbConfig);

// Handle pool errors
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

/**
 * Execute a query with parameters
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Query result
 */
export const query = async (text, params = []) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query:', { text, duration, rows: result.rowCount });
    return result;
  } catch (error) {
    console.error('Database query error:', { text, params, error: error.message });
    throw error;
  }
};

/**
 * Get a client from the pool for transactions
 * @returns {Promise<Object>} Database client
 */
export const getClient = async () => {
  const client = await pool.connect();
  return client;
};

/**
 * Execute multiple queries in a transaction
 * @param {Function} callback - Function that receives client and executes queries
 * @returns {Promise<any>} Result of the callback
 */
export const withTransaction = async (callback) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Check database connection health
 * @returns {Promise<boolean>} True if connected
 */
export const checkConnection = async () => {
  try {
    const result = await query('SELECT NOW() as current_time');
    console.log('Database connected successfully:', result.rows[0].current_time);
    return true;
  } catch (error) {
    console.error('Database connection failed:', error.message);
    return false;
  }
};

/**
 * Initialize database with schema and seed data
 * @returns {Promise<void>}
 */
export const initializeDatabase = async () => {
  console.log('Initializing database...');
  
  try {
    // Check if tables exist
    const tablesResult = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('customers', 'branches', 'appointments', 'bank_accounts', 'sessions')
    `);
    
    if (tablesResult.rows.length === 0) {
      console.log('Tables not found. Database needs to be set up manually.');
      console.log('Please run the schema.sql and seed_data.sql files against your PostgreSQL database.');
      return false;
    }
    
    console.log(`Found ${tablesResult.rows.length} tables in database`);
    return true;
  } catch (error) {
    console.error('Failed to initialize database:', error.message);
    return false;
  }
};

/**
 * Close the database pool
 * @returns {Promise<void>}
 */
export const closePool = async () => {
  try {
    await pool.end();
    console.log('Database pool closed successfully');
  } catch (error) {
    console.error('Error closing database pool:', error.message);
  }
};

// Gracefully close pool on application termination
process.on('SIGINT', closePool);
process.on('SIGTERM', closePool);

export default {
  query,
  getClient,
  withTransaction,
  checkConnection,
  initializeDatabase,
  closePool
};
