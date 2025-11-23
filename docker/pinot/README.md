# Apache Pinot Authentication Configuration

This directory contains configuration files for enabling basic authentication on Apache Pinot broker and controller.

## Users Configured

The following users are configured for testing various authentication scenarios:

### 1. Admin User
- **Username**: `admin`
- **Password**: `admin123`
- **Permissions**: Full access (READ/WRITE/DELETE)
- **Use case**: Administrative operations, full access to all APIs

### 2. Regular User
- **Username**: `user`
- **Password**: `user123`
- **Permissions**: Read-only access
- **Use case**: Standard query operations

### 3. No-Auth User
- **Username**: `noauth`
- **Password**: (empty string)
- **Permissions**: Read-only access
- **Use case**: Testing datasource without providing credentials

## Configuration Files

- **`broker-conf/pinot-broker.conf`**: Basic authentication configuration for the Pinot broker
- **`controller-conf/pinot-controller.conf`**: Basic authentication configuration for the Pinot controller

## How It Works

Apache Pinot's basic authentication uses the `BasicAuthAccessControlFactory` which validates credentials against a configured list of principals (users). Each user has:

1. A username
2. A password
3. Table access permissions
4. General permissions (READ, WRITE, DELETE, etc.)

## Grafana Datasource Test Scenarios

The Grafana provisioning file includes 11 datasource configurations to test various scenarios:

1. **No Auth** - Using noauth user with empty password
2. **Broker Only - Admin** - Admin credentials for broker only
3. **Broker Only - User** - User credentials for broker only
4. **Full - Admin on Both** - Admin credentials for both broker and controller
5. **Full - User on Both** - User credentials for both broker and controller
6. **Full - Different Creds** - Admin on broker, user on controller
7. **FAIL - Wrong Broker Password** - Tests incorrect broker password
8. **FAIL - Wrong Controller Password** - Tests incorrect controller password
9. **FAIL - Wrong Both Passwords** - Tests incorrect credentials on both
10. **FAIL - Invalid User** - Tests non-existent username
11. **Mixed TLS Settings** - Tests different TLS configurations

## Testing Authentication

### Automated Validation

Run the automated validation script to test all authentication scenarios:

```bash
# From the project root
docker-compose up -d
sleep 30  # Wait for Pinot to be ready
./docker/validate-pinot-setup.sh
```

The validation script tests:
- Broker health endpoint with various credentials (correct/incorrect)
- Broker query endpoint with various credentials
- Controller health endpoint with various credentials
- Controller tables endpoint with various credentials

### Manual Testing via Grafana

1. Start the Docker containers: `docker-compose up -d`
2. Wait for Pinot to initialize and load sample data (about 1-2 minutes)
3. Access Grafana at http://localhost:3000
4. Navigate to Connections > Data sources
5. Test each of the provisioned datasources to verify authentication behavior

Expected results:
- Datasources 1-6 should pass health checks ✅
- Datasources 7-10 should fail health checks with 401/403 errors ❌
- Datasource 11 should pass health check with mixed TLS settings ✅

### Command Line Testing

Test authentication directly with curl:

```bash
# Test broker with admin credentials (should succeed)
curl -u admin:admin123 http://localhost:8099/health

# Test broker with wrong password (should fail)
curl -u admin:wrongpass http://localhost:8099/health

# Test controller tables endpoint
curl -u admin:admin123 http://localhost:9000/tables

# Test query endpoint
curl -u admin:admin123 -X POST http://localhost:8099/query/sql \
  -H "Content-Type: application/json" \
  -d '{"sql":"SELECT 1"}'
```

## Bootstrap Script

The `bootstrap.sh` script uses the admin credentials (`admin:admin123`) to:
- Create schemas via controller API
- Create tables via controller API
- Upload data segments via controller API

## Security Notes

⚠️ **Warning**: These credentials are for development/testing only!

For production:
- Use strong, randomly generated passwords
- Store credentials securely (e.g., environment variables, secrets management)
- Consider using bearer token authentication for API access
- Enable TLS/HTTPS for encrypted communication
- Use network segmentation and firewalls

## References

- [Apache Pinot Basic Auth Documentation](https://docs.pinot.apache.org/operators/tutorials/authentication/basic-auth-access-control)
- [Apache Pinot Access Control](https://docs.pinot.apache.org/operators/operating-pinot/security)
