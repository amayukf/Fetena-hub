
CREATE ROLE examvault_user WITH LOGIN PASSWORD 'secret_password' SUPERUSER CREATEDB CREATEROLE;
CREATE DATABASE examvault_db OWNER examvault_user;
CREATE DATABASE examvault_test_db OWNER examvault_user;
GRANT ALL ON SCHEMA public TO examvault_user;
