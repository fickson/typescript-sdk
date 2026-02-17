import { SekuireServer, generateKeyPair, calculateSekuireId } from '../src';

// Example server implementation
class MySekuireServer extends SekuireServer {
  constructor() {
    // Calculate agent ID from configuration
    const agentConfig = {
      model: 'gpt-4',
      systemPrompt: 'You are a helpful AI assistant.',
      tools: '[{"name": "calculator", "description": "Perform calculations"}]',
      projectName: 'MyAgent',
      projectVersion: '1.0.0',
    };

    const agentId = calculateSekuireId(agentConfig);
    const keyPair = generateKeyPair();

    super(agentId, keyPair);
    console.log('🤖 Sekuire Server initialized');
    console.log('Agent ID:', agentId);
    console.log('Public Key:', keyPair.publicKey);
  }
}

async function basicServerExample() {
  console.log('🥝 Sekuire TypeScript SDK - Basic Server Example');

  const server = new MySekuireServer();

  // Simulate handling a HELLO message
  const helloMessage = {
    clientNonce: 'a'.repeat(64), // Example nonce
  };

  try {
    const welcomeResponse = await server.handleHello(helloMessage);
    console.log('✅ Handshake step 1 successful!');
    console.log('Welcome response:', welcomeResponse);

    // Simulate handling an AUTH message
    const authMessage = {
      signatureA: 'b'.repeat(128), // Example signature
    };

    await server.handleAuth(authMessage, helloMessage.clientNonce);
    console.log('✅ Handshake step 2 successful!');
  } catch (error) {
    console.error('❌ Handshake failed:', error.message);
  }
}

// Run the example
if (require.main === module) {
  basicServerExample().catch(console.error);
}
