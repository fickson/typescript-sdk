import { SekuireClient, generateKeyPair } from '../src';

async function basicClientExample() {
  console.log('🥝 Sekuire TypeScript SDK - Basic Client Example');

  // 1. Generate a client keypair
  const clientKeyPair = generateKeyPair();
  console.log('Generated client keypair');
  console.log('Public key:', clientKeyPair.publicKey);

  // 2. Create client instance
  const client = new SekuireClient(clientKeyPair, {
    registryUrl: 'https://registry.sekuire.ai',
    timeout: 10000,
    retries: 2,
  });

  // 3. Connect to an agent (this will fail without a real agent)
  try {
    const result = await client.connect('http://localhost:8000', 'expected-agent-id');
    console.log('✅ Handshake successful!');
    console.log('Agent ID:', result.agentId);
    console.log('Credentials:', result.credentials);
  } catch (error) {
    console.log('❌ Handshake failed (expected without running agent):');
    console.log(error.message);
  }

  // 4. Fetch agent info from registry
  try {
    const agentInfo = await client.getAgentInfo('example-agent-id');
    console.log('Agent info:', agentInfo);
  } catch (error) {
    console.log('❌ Failed to fetch agent info (expected without registry):');
    console.log(error.message);
  }

  // 5. Search agents
  try {
    const agents = await client.searchAgents('helpful');
    console.log('Found agents:', agents.length);
  } catch (error) {
    console.log('❌ Failed to search agents (expected without registry):');
    console.log(error.message);
  }
}

// Run the example
if (require.main === module) {
  basicClientExample().catch(console.error);
}
