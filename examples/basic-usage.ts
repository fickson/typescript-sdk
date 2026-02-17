#!/usr/bin/env node

/**
 * Basic usage example for Sekuire SDK
 * 
 * This example demonstrates:
 * 1. Loading an agent from sekuire.yml
 * 2. Chatting with the agent
 * 3. Using different LLM providers
 */

import { getAgent } from '../src/new-agent';
import dotenv from 'dotenv';

// Load environment variables from .env
dotenv.config();

async function main() {
  console.log('🚀 Sekuire SDK - Basic Usage Example\n');

  try {
    // Load agent from sekuire.yml
    console.log('📂 Loading agent from sekuire.yml...');
    const agent = await getAgent('my-agent-openai');
    
    console.log(`✅ Agent loaded: ${agent.name}`);
    console.log(`📡 LLM Provider: ${agent.getLLMProvider()}`);
    console.log(`🤖 Model: ${agent.getModelName()}\n`);

    // First chat message
    console.log('💬 User: Hello! What can you do?');
    const response1 = await agent.chat('Hello! What can you do?');
    console.log(`🤖 Agent: ${response1}\n`);

    // Second chat message (with context)
    console.log('💬 User: What is 15% of 250?');
    const response2 = await agent.chat('What is 15% of 250?');
    console.log(`🤖 Agent: ${response2}\n`);

    // Third chat message (conversational context)
    console.log('💬 User: Can you explain how you calculated that?');
    const response3 = await agent.chat('Can you explain how you calculated that?');
    console.log(`🤖 Agent: ${response3}\n`);

    console.log('✨ Done! Conversation history preserved across messages.');

  } catch (error) {
    console.error('❌ Error:', (error as Error).message);
    console.error('\n💡 Make sure:');
    console.error('  1. You have a sekuire.yml in the current directory');
    console.error('  2. OPENAI_API_KEY is set in your .env file');
    console.error('  3. The agent name matches what\'s in sekuire.yml');
    process.exit(1);
  }
}

main();
