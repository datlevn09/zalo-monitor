-- Grants needed for Prisma on Postgres 16
ALTER USER zalomonitor WITH SUPERUSER;
ALTER DATABASE zalomonitor OWNER TO zalomonitor;
ALTER SCHEMA public OWNER TO zalomonitor;
GRANT ALL PRIVILEGES ON DATABASE zalomonitor TO zalomonitor;
GRANT ALL ON SCHEMA public TO zalomonitor;
