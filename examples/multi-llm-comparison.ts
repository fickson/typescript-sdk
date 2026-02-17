#!/usr/bin/env node

/**
 * Multi-LLM Comparison Example
 * 
 * This example demonstrates comparing responses from different LLM providers
 * for the same question.
 */

import { getAgents } from '../src/new-agent';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('🚀 Sekuire SDK - Multi-LLM Comparison\n');

  try {
    // Load all agents from sekuire.yml
    console.log('📂 Loading agents from sekuire.yml...\n');
    const agents = await getAgents();

    if (agents.size === 0) {
      console.error('❌ No agents found in sekuire.yml');
      process.exit(1);
    }

    console.log(`✅ Loaded ${agents.size} agents:\n`);
    for (const [name, agent] of agents) {
      console.log(`  - ${name} (${agent.getLLMProvider()}/${agent.getModelName()})`);
    }

    // Question to ask all agents
    const question = 'What is quantum computing? Explain in one sentence.';
    console.log(`\n❓ Question: "${question}"\n`);
    console.log('=' .repeat(80));

    // Ask each agent the same question
    for (const [name, agent] of agents) {
      try {
        console.log(`\n🤖 ${name} (${agent.getModelName()}):`);
        console.log('   Thinking...');
        
        const response = await agent.chat(question);
        console.log(`   ${response}`);
        
      } catch (error) {
        console.log(`   ❌ Error: ${(error as Error).message}`);
        console.log(`   💡 Make sure ${agent.getLLMProvider().toUpperCase()}_API_KEY is set`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n✨ Comparison complete!');
    console.log('💡 Tip: Different LLMs have different strengths:');
    console.log('   - OpenAI GPT-4: Reasoning, code generation');
    console.log('   - Anthropic Claude: Document analysis, long context');
    console.log('   - Google Gemini: Multimodal, real-time data');
    console.log('   - Ollama (local): Privacy, offline capability\n');

  } catch (error) {
    console.error('❌ Error:', (error as Error).message);
    console.error('\n💡 Make sure:');
    console.error('  1. You have a sekuire.yml with multiple agents');
    console.error('  2. API keys are set for each provider');
    process.exit(1);
  }
}

main();
