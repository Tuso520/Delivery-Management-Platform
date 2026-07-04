-- Delivery Platform Database Initialization
CREATE DATABASE IF NOT EXISTS delivery_platform
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Grant privileges
GRANT ALL PRIVILEGES ON delivery_platform.* TO 'delivery_user'@'%';
FLUSH PRIVILEGES;

-- Create a test user table comment for verification
SELECT 'Database delivery_platform initialized successfully' AS status;
