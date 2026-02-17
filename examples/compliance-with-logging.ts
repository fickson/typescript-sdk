/**
 * Example: Using Sekuire Compliance Monitor with Logging
 *
 * This example demonstrates how to:
 * 1. Create a logger instance
 * 2. Create a compliance monitor with logging enabled
 * 3. Test network access blocking/allowing
 * 4. Verify logs are sent to Sekuire API
 */

import { ComplianceMonitor, SekuireLogger } from '../src';

async function main() {
  console.log('🚀 Sekuire Compliance Monitor with Logging Example\n');

  // 1. Create logger instance
  const logger = new SekuireLogger({
    sekuireId: 'sekuire:example-agent',
    apiBaseUrl: 'http://localhost:9300',
    environment: 'development',
    enabled: true,
    batchSize: 10, // Small batch for demo
    flushInterval: 5000, // 5 seconds for demo
  });

  console.log('✅ Logger created');
  console.log('   Status:', logger.getStatus());
  console.log('');

  // 2. Create compliance monitor with logger
  const compliance = new ComplianceMonitor('./sekuire.yaml', logger);

  console.log('✅ Compliance monitor created');
  console.log('');

  // 3. Test network access scenarios
  console.log('--- Testing Network Access ---\n');

  // Test 1: Try to access blocked domain
  console.log('Test 1: Attempting to access blocked domain (https://evil.com)...');
  try {
    compliance.checkNetworkAccess('https://evil.com');
    console.log('   ❌ Should have been blocked!');
  } catch (error: any) {
    console.log('   ✅ Blocked as expected:', error.message);
  }
  console.log('');

  // Test 2: Try to access allowed domain
  console.log('Test 2: Attempting to access allowed domain (https://api.openai.com)...');
  try {
    compliance.checkNetworkAccess('https://api.openai.com/v1/chat');
    console.log('   ✅ Allowed as expected');
  } catch (error: any) {
    console.log('   ❌ Should have been allowed!', error.message);
  }
  console.log('');

  // Test 3: Try to use blocked tool
  console.log('Test 3: Attempting to use blocked tool...');
  try {
    compliance.checkToolUsage('dangerous_tool', 'rm -rf /');
    console.log('   ❌ Should have been blocked!');
  } catch (error: any) {
    console.log('   ✅ Blocked as expected:', error.message);
  }
  console.log('');

  // Test 4: Try to use allowed tool
  console.log('Test 4: Attempting to use allowed tool (calculator)...');
  try {
    compliance.checkToolUsage('calculator');
    console.log('   ✅ Allowed as expected');
  } catch (error: any) {
    console.log('   ❌ Should have been allowed!', error.message);
  }
  console.log('');

  // 4. Check compliance status
  console.log('--- Compliance Status ---\n');
  const status = compliance.getComplianceStatus();
  console.log('Violations count:', status.violationsCount);
  console.log('Last violation:', status.lastViolation);
  console.log('');

  // 5. Flush logs manually
  console.log('--- Flushing Logs ---\n');
  console.log('Logger status before flush:', logger.getStatus());
  await logger.flush();
  console.log('✅ Logs flushed to Sekuire API');
  console.log('Logger status after flush:', logger.getStatus());
  console.log('');

  // 6. Wait a moment for logs to be processed
  console.log('Waiting 2 seconds for logs to be processed...');
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // 7. Query logs from API
  console.log('\n--- Querying Logs from API ---\n');
  try {
    const axios = require('axios');
    const response = await axios.get(
      'http://localhost:9300/api/v1/agents/sekuire:example-agent/logs?limit=10'
    );

    if (response.data && response.data.logs) {
      console.log(`Found ${response.data.logs.length} log entries:`);
      response.data.logs.forEach((log: any, index: number) => {
        console.log(`\n${index + 1}. ${log.event_type} (${log.severity})`);
        console.log(`   Time: ${log.event_timestamp}`);
        console.log(`   Data:`, JSON.stringify(log.event_data, null, 2));
      });
    } else {
      console.log('No logs found in API response');
    }
  } catch (error: any) {
    console.error('❌ Failed to query logs from API:', error.message);
    console.log('   Make sure sekuire-core is running on http://localhost:9300');
  }

  // 8. Cleanup
  console.log('\n--- Cleanup ---\n');
  await logger.shutdown();
  console.log('✅ Logger shut down gracefully');
  console.log('\n🎉 Example complete!');
}

// Run the example
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
