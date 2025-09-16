"""
Database connection module            db_config = {
                'host': os.getenv('DB_HOST', 'localhost'),
                'port': int(os.getenv('DB_PORT', 5432)),
                'database': os.getenv('DB_NAME', 'AppointmentStore'),
                'user': os.getenv('DB_USER', 'postgres'),
                'password': os.getenv('DB_PASSWORD', '0000')
            }A Banking System (Python)
Handles PostgreSQL connections and basic database operations
"""

import os
import logging
import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2.pool import ThreadedConnectionPool
from contextlib import contextmanager
from typing import Dict, List, Optional, Any
import json
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

logger = logging.getLogger(__name__)


class DatabaseConnection:
    """Database connection manager with connection pooling"""
    
    def __init__(self):
        self._pool = None
        self._initialize_pool()
    
    def _initialize_pool(self):
        """Initialize the connection pool"""
        try:
            db_config = {
                'host': os.getenv('DB_HOST', 'localhost'),
                'port': int(os.getenv('DB_PORT', 5432)),
                'database': os.getenv('DB_NAME', 'maa_banking'),
                'user': os.getenv('DB_USER', 'postgres'),
                'password': os.getenv('DB_PASSWORD', '0000')
            }
            
            self._pool = ThreadedConnectionPool(
                minconn=1,
                maxconn=20,
                **db_config
            )
            
            logger.info("Database connection pool initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize database connection pool: {e}")
            raise
    
    def test_connection(self):
        """Test the database connection"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT 1")
                result = cursor.fetchone()
                cursor.close()
                return result is not None
        except Exception as e:
            logger.error(f"Connection test failed: {e}")
            return False

    @contextmanager
    def get_connection(self):
        """Get a connection from the pool"""
        conn = None
        try:
            conn = self._pool.getconn()
            yield conn
        except Exception as e:
            if conn:
                conn.rollback()
            logger.error(f"Database connection error: {e}")
            raise
        finally:
            if conn:
                self._pool.putconn(conn)
    
    @contextmanager
    def get_cursor(self, commit=True):
        """Get a cursor with automatic connection management"""
        with self.get_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            try:
                yield cursor
                if commit:
                    conn.commit()
            except Exception as e:
                conn.rollback()
                logger.error(f"Database cursor error: {e}")
                raise
            finally:
                cursor.close()
    
    def execute_query(self, query: str, params: tuple = None, fetch_one: bool = False, fetch_all: bool = True) -> Optional[List[Dict]]:
        """Execute a SELECT query and return results"""
        try:
            with self.get_cursor(commit=False) as cursor:
                cursor.execute(query, params or ())
                
                if fetch_one:
                    result = cursor.fetchone()
                    return dict(result) if result else None
                elif fetch_all:
                    results = cursor.fetchall()
                    return [dict(row) for row in results]
                else:
                    return None
                    
        except Exception as e:
            logger.error(f"Query execution failed: {query}, params: {params}, error: {e}")
            raise
    
    def execute_mutation(self, query: str, params: tuple = None, return_id: bool = False) -> Optional[Any]:
        """Execute an INSERT, UPDATE, or DELETE query"""
        try:
            with self.get_cursor(commit=True) as cursor:
                cursor.execute(query, params or ())
                
                if return_id:
                    result = cursor.fetchone()
                    return dict(result) if result else None
                
                return cursor.rowcount
                
        except Exception as e:
            logger.error(f"Mutation execution failed: {query}, params: {params}, error: {e}")
            raise
    
    def check_connection(self) -> bool:
        """Test database connectivity"""
        try:
            result = self.execute_query("SELECT NOW() as current_time", fetch_one=True)
            if result:
                logger.info(f"Database connected successfully: {result['current_time']}")
                return True
            return False
        except Exception as e:
            logger.error(f"Database connection check failed: {e}")
            return False
    
    def close_pool(self):
        """Close all connections in the pool"""
        if self._pool:
            self._pool.closeall()
            logger.info("Database connection pool closed")


# Global database instance
_db_instance = None


def get_database() -> DatabaseConnection:
    """Get the global database instance"""
    global _db_instance
    if _db_instance is None:
        _db_instance = DatabaseConnection()
    return _db_instance


def execute_query(query: str, params: tuple = None, fetch_one: bool = False, fetch_all: bool = True) -> Optional[List[Dict]]:
    """Convenience function for executing queries"""
    db = get_database()
    return db.execute_query(query, params, fetch_one, fetch_all)


def execute_mutation(query: str, params: tuple = None, return_id: bool = False) -> Optional[Any]:
    """Convenience function for executing mutations"""
    db = get_database()
    return db.execute_mutation(query, params, return_id)


def check_database_connection() -> bool:
    """Convenience function for checking database connectivity"""
    db = get_database()
    return db.check_connection()
