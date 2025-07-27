#!/bin/bash

# The Inner Circle - Migration to Local PostgreSQL
# Run this script to set up your local database

set -e  # Exit on any error

echo "🚀 Starting migration to local PostgreSQL..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Database configuration
DB_NAME="theinnercircle"
DB_USER="innercircle_app"
DB_PASS="Spiderman_20200"  # Change this!

echo -e "${YELLOW}Step 1: Checking PostgreSQL installation...${NC}"
if ! command -v psql &> /dev/null; then
    echo -e "${RED}❌ PostgreSQL is not installed or not in PATH${NC}"
    echo "Please install PostgreSQL first"
    exit 1
fi

echo -e "${GREEN}✅ PostgreSQL found${NC}"

echo -e "${YELLOW}Step 2: Creating database and user...${NC}"
# Create database and user (you may be prompted for postgres password)
psql -U postgres -c "CREATE DATABASE ${DB_NAME};" 2>/dev/null || echo "Database might already exist"
psql -U postgres -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';" 2>/dev/null || echo "User might already exist"

echo -e "${YELLOW}Step 3: Setting up database schema...${NC}"
# Run the database schema
psql -U postgres -d ${DB_NAME} -f database.sql

echo -e "${YELLOW}Step 4: Testing database connection...${NC}"
if psql -U ${DB_USER} -d ${DB_NAME} -c "SELECT NOW();" &> /dev/null; then
    echo -e "${GREEN}✅ Database connection successful${NC}"
else
    echo -e "${RED}❌ Database connection failed${NC}"
    echo "Please check your credentials"
    exit 1
fi

echo -e "${YELLOW}Step 5: Installing Node.js dependencies...${NC}"
npm install

echo -e "${YELLOW}Step 6: Generating Prisma client...${NC}"
npx prisma generate

echo -e "${YELLOW}Step 7: Running Prisma migration (if needed)...${NC}"
npx prisma db push --skip-generate

echo -e "${GREEN}🎉 Migration completed successfully!${NC}"
echo ""
echo "Next steps:"
echo "1. Update your .env file with the correct database password"
echo "2. Change SESSION_SECRET to a strong random string"
echo "3. Test the application with: npm start"
echo "4. Visit http://localhost:3000"
echo ""
echo -e "${YELLOW}⚠️  Remember to secure your database for production use!${NC}"