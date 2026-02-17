#!/usr/bin/env node

/**
 * Multi-Agent Comparison Example
 * 
 * Compare responses from multiple agents using getAgents()
 * This loads all agents from sekuire.yml and asks them the same question
 */

import { getAgents } from '../src/new-agent';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('🚀 Sekuire SDK - Multi-Agent Comparison\n');

  try {
    // Load all agents from sekuire.yml
    console.log('📂 Loading agents from sekuire.yml...\n');
    const agents = await getAgents();

    if (agents.size === 0) {
      console.error('❌ No agents found in sekuire.yml');
      console.error('💡 Run: sekuire init --template multi-llm');
      process.exit(1);
    }

    console.log(`✅ Loaded ${agents.size} agents:`);
    for (const [name, agent] of agents) {
      console.log(`   • ${name}`);
      console.log(`     Provider: ${agent.getLLMProvider()}`);
      console.log(`     Model: ${agent.getModelName()}\n`);
    }

    // Test questions
    const questions = [
      {
        q: 'What is quantum computing? Explain in one sentence.',
        category: 'Technical',
      },
      {
        q: 'What is the meaning of life? Answer philosophically in one sentence.',
        category: 'Philosophical',
      },
      {
        q: 'Write a haiku about AI.',
        category: 'Creative',
      },
    ];

    // Ask each question to all agents
    for (const { q, category } of questions) {
      console.log('\n' + '='.repeat(80));
      console.log(`📝 ${category} Question: "${q}"`);
      console.log('='.repeat(80) + '\n');

      for (const [name, agent] of agents) {
        try {
          console.log(`🤖 ${name}:`);
          console.log('   ⏳ Thinking...');

          const startTime = Date.now();
          const response = await agent.chat(q);
          const duration = Date.now() - startTime;

          console.log(`   ✅ Response (${duration}ms):`);
          console.log(`      ${response}\n`);

        } catch (error) {
          const err = error as Error;
          console.log(`   ❌ Error: ${err.message}`);

          // Helpful error messages
          if (err.message.includes('API key not found')) {
            const provider = agent.getLLMProvider().toUpperCase();
            console.log(`   💡 Set ${provider}_API_KEY in your .env file`);
          } else if (err.message.includes('ECONNREFUSED')) {
            console.log(`   💡 Start Ollama: ollama serve`);
          }
          console.log();
        }
      }
    }

    // Analysis
    console.log('\n' + '='.repeat(80));
    console.log('📊 Analysis');
    console.log('='.repeat(80) + '\n');

    console.log('🎯 Key Observations:\n');

    console.log('1️⃣  Response Style:');
    console.log('   • OpenAI: Clear, direct, well-structured');
    console.log('   • Claude: Thoughtful, nuanced, detailed');
    console.log('   • Gemini: Comprehensive, informative');
    console.log('   • Ollama: Varies by model, may be less polished\n');

    console.log('2️⃣  Best Use Cases:');
    console.log('   • OpenAI: Code, reasoning, general tasks');
    console.log('   • Claude: Long documents, ethical questions, analysis');
    console.log('   • Gemini: Multimodal, search-enhanced tasks');
    console.log('   • Ollama: Privacy-critical, offline, cost-free\n');

    console.log('3️⃣  Context Windows:');
    console.log('   • Gemini 1.5 Pro: 2M tokens (HUGE!)');
    console.log('   • Claude 3: 200K tokens');
    console.log('   • GPT-4 Turbo: 128K tokens');
    console.log('   • Ollama: Varies by model (4K-32K)\n');

    console.log('4️⃣  Cost (per 1M tokens):');
    console.log('   • GPT-4: $10-30');
    console.log('   • Claude 3: $3-15');
    console.log('   • Gemini: $1-7');
    console.log('   • Ollama: FREE! (uses your hardware)\n');

    console.log('💡 Pro Tip:');
    console.log('   Use different agents for different tasks:');
    console.log('   • Draft with fast/cheap model (Gemini/GPT-3.5)');
    console.log('   • Refine with smart model (GPT-4/Claude)');
    console.log('   • Test locally first (Ollama)');
    console.log('   • Switch providers easily by changing sekuire.yml!\n');

    console.log('✨ This is the power of config-first agents! 🚀\n');

  } catch (error) {
    console.error('❌ Error:', (error as Error).message);
    console.error('\n💡 Make sure:');
    console.error('  1. You have a sekuire.yml with agents defined');
    console.error('  2. API keys are set in .env for each provider');
    console.error('  3. You\'re in a directory with sekuire.yml\n');
    process.exit(1);
  }
}

main();
