#!/bin/bash

# Pinot Setup Validation Script
# This script tests Apache Pinot broker and controller with different authentication scenarios

set -e

BROKER_URL="${BROKER_URL:-http://localhost:8099}"
CONTROLLER_URL="${CONTROLLER_URL:-http://localhost:9000}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Function to print test result
print_result() {
    local test_name="$1"
    local result="$2"
    local details="$3"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    if [ "$result" = "PASS" ]; then
        echo -e "${GREEN}✓ PASS${NC} - $test_name"
        [ -n "$details" ] && echo "  Details: $details"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${RED}✗ FAIL${NC} - $test_name"
        [ -n "$details" ] && echo "  Details: $details"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
}

# Function to test HTTP endpoint
test_endpoint() {
    local description="$1"
    local url="$2"
    local user="$3"
    local pass="$4"
    local expected_status="$5"  # "success" or "fail"
    
    echo ""
    echo -e "${YELLOW}Testing:${NC} $description"
    
    local auth_flag=""
    if [ -n "$user" ]; then
        auth_flag="-u ${user}:${pass}"
    fi
    
    local http_code
    local response
    
    # Make request and capture both status code and response
    if response=$(curl -s -w "\n%{http_code}" $auth_flag "$url" 2>&1); then
        http_code=$(echo "$response" | tail -n1)
        body=$(echo "$response" | sed '$d')
        
        if [ "$expected_status" = "success" ]; then
            if [ "$http_code" = "200" ]; then
                print_result "$description" "PASS" "HTTP $http_code"
            else
                print_result "$description" "FAIL" "Expected HTTP 200, got $http_code"
            fi
        else
            if [ "$http_code" != "200" ]; then
                print_result "$description" "PASS" "HTTP $http_code (expected failure)"
            else
                print_result "$description" "FAIL" "Expected failure, but got HTTP 200"
            fi
        fi
    else
        print_result "$description" "FAIL" "Request failed: $response"
    fi
}

echo "========================================"
echo "  Apache Pinot Setup Validation"
echo "========================================"
echo ""
echo "Broker URL: $BROKER_URL"
echo "Controller URL: $CONTROLLER_URL"
echo ""

# Wait for services to be ready
echo "Waiting for Pinot services to be ready..."
sleep 5

echo ""
echo "========================================"
echo "  BROKER TESTS"
echo "========================================"

# Broker health endpoint tests
test_endpoint "Broker health - No Auth" \
    "$BROKER_URL/health" "" "" "success"

test_endpoint "Broker health - Admin user" \
    "$BROKER_URL/health" "admin" "admin123" "success"

test_endpoint "Broker health - User credentials" \
    "$BROKER_URL/health" "user" "user123" "success"

test_endpoint "Broker health - Noauth user" \
    "$BROKER_URL/health" "noauth" "" "success"

test_endpoint "Broker health - Wrong password" \
    "$BROKER_URL/health" "admin" "wrongpass" "fail"

test_endpoint "Broker health - Invalid user" \
    "$BROKER_URL/health" "invaliduser" "somepass" "fail"

# Broker query endpoint tests
test_endpoint "Broker query - Admin credentials" \
    "$BROKER_URL/query/sql" "admin" "admin123" "success"

test_endpoint "Broker query - User credentials" \
    "$BROKER_URL/query/sql" "user" "user123" "success"

test_endpoint "Broker query - Wrong credentials" \
    "$BROKER_URL/query/sql" "admin" "wrongpass" "fail"

echo ""
echo "========================================"
echo "  CONTROLLER TESTS"
echo "========================================"

# Controller health endpoint tests
test_endpoint "Controller health - No Auth" \
    "$CONTROLLER_URL/health" "" "" "success"

test_endpoint "Controller health - Admin user" \
    "$CONTROLLER_URL/health" "admin" "admin123" "success"

test_endpoint "Controller health - User credentials" \
    "$CONTROLLER_URL/health" "user" "user123" "success"

test_endpoint "Controller health - Noauth user" \
    "$CONTROLLER_URL/health" "noauth" "" "success"

test_endpoint "Controller health - Wrong password" \
    "$CONTROLLER_URL/health" "admin" "wrongpass" "fail"

test_endpoint "Controller health - Invalid user" \
    "$CONTROLLER_URL/health" "invaliduser" "somepass" "fail"

# Controller tables endpoint tests
test_endpoint "Controller tables - Admin credentials" \
    "$CONTROLLER_URL/tables" "admin" "admin123" "success"

test_endpoint "Controller tables - User credentials" \
    "$CONTROLLER_URL/tables" "user" "user123" "success"

test_endpoint "Controller tables - Wrong credentials" \
    "$CONTROLLER_URL/tables" "admin" "wrongpass" "fail"

echo ""
echo "========================================"
echo "  TEST SUMMARY"
echo "========================================"
echo ""
echo "Total Tests: $TOTAL_TESTS"
echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
echo -e "${RED}Failed: $FAILED_TESTS${NC}"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed!${NC}"
    exit 1
fi
