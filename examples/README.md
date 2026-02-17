# TypeScript SDK Examples

This directory contains example code demonstrating how to use the Sekuire TypeScript SDK.

## Examples

### 1. Compliance with Logging (`compliance-with-logging.ts`)

Demonstrates the full integration of the compliance monitor with async logging to the Sekuire API.

**Features:**
- Creating a logger instance with configuration
- Initializing compliance monitor with logger
- Testing network access blocking/allowing
- Testing tool usage restrictions
- Viewing compliance violations
- Flushing logs to API
- Querying logs from API

**Running the example:**

```bash
# 1. Make sure sekuire-core is running
cd /Volumes/Work/Technology/agent
make up

# 2. Install dependencies
cd packages/typescript-sdk
pnpm install

# 3. Build the SDK
pnpm build

# 4. Run the example
cd examples
npx tsx compliance-with-logging.ts
```

**Expected Output:**

```
🚀 Sekuire Compliance Monitor with Logging Example

✅ Logger created
   Status: { enabled: true, bufferedEvents: 0, sessionId: '...', environment: 'development' }

✅ Compliance monitor created

--- Testing Network Access ---

Test 1: Attempting to access blocked domain (https://evil.com)...
   ✅ Blocked as expected: Network access to https://evil.com blocked by blocklist rule: https://evil.com

Test 2: Attempting to access allowed domain (https://api.openai.com)...
   ✅ Allowed as expected

Test 3: Attempting to use blocked tool...
   ✅ Blocked as expected: Tool usage contains blocked pattern: rm -rf

Test 4: Attempting to use allowed tool (calculator)...
   ✅ Allowed as expected

--- Compliance Status ---

Violations count: 2
Last violation: { ... }

--- Flushing Logs ---

Logger status before flush: { enabled: true, bufferedEvents: 4, ... }
✅ Logs flushed to Sekuire API
Logger status after flush: { enabled: true, bufferedEvents: 0, ... }

--- Querying Logs from API ---

Found 4 log entries:
1. policy_violation (error)
   Time: 2025-12-04T...
   Data: { category: "network", message: "...", ... }

2. network_access (info)
   Time: 2025-12-04T...
   Data: { url: "https://api.openai.com/v1/chat", ... }

...

--- Cleanup ---

✅ Logger shut down gracefully

🎉 Example complete!
```

## Configuration

The example uses `sekuire.yaml` for compliance configuration. Key sections:

- **permissions.network**: Controls which domains can be accessed
- **permissions.tools**: Enforces tool whitelisting and blocks dangerous patterns
- **logging**: Enables audit trails for all operations
- **alerts**: Configures real-time monitoring

## Troubleshooting

**"Connection refused" error:**
- Make sure sekuire-core is running: `make up`
- Check that the API is accessible: `curl http://localhost:9300/health`

**"No logs found in API":**
- The backend may have compilation errors (check with `docker logs sekuire-core`)
- The migration may not have run (check database)
- Try querying the database directly to verify logs were inserted

**"Module not found" error:**
- Run `pnpm install` in the typescript-sdk directory
- Run `pnpm build` to compile the SDK
- Use `npx tsx` to run TypeScript files directly

## Next Steps

Once this example works, you can:
1. Create custom agents using the SDK
2. Integrate with your AI framework (LangChain, AutoGPT, etc.)
3. Configure workspace-specific policies
4. Set up monitoring dashboards
5. Export logs for SIEM integration
