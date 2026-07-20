-- MYSQL_DATABASE / MYSQL_USER / MYSQL_PASSWORD are applied by the official
-- MySQL entrypoint before this file runs. Keep this hook environment-neutral:
-- hard-coded database or user names break isolated and production deployments.
SELECT 'Delivery Platform database initialized successfully' AS status;
