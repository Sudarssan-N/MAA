import psycopg2

try:
    # Connect to PostgreSQL server
    conn = psycopg2.connect(
        host='localhost',
        database='postgres',
        user='postgres',
        password='0000'
    )
    conn.autocommit = True
    cursor = conn.cursor()
    
    # Create database
    cursor.execute('CREATE DATABASE "AppointmentStore"')
    print('Database AppointmentStore created successfully!')
    
except psycopg2.errors.DuplicateDatabase:
    print('Database AppointmentStore already exists!')
except Exception as e:
    print(f'Error creating database: {e}')
finally:
    if conn:
        conn.close()
