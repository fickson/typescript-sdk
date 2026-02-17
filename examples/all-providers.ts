#!/usr/bin/env node

/**
 * All LLM Providers Example
 * 
 * This example demonstrates all 4 LLM providers:
 * 1. OpenAI (GPT-4, GPT-3.5)
 * 2. Anthropic (Claude 3.5, Claude 3)
 * 3. Google (Gemini 1.5 Pro, Gemini Pro)
 * 4. Ollama (Local models: Llama 2, Mistral, etc.)
 */

import { llm } from '../src/llm';
import dotenv from 'dotenv';

dotenv.config();

async function testProvider(
  name: string,
  provider: any,
  question: string
): Promise<void> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🤖 ${name} (${provider.getModelName()})`);
  console.log(`${'='.repeat(80)}`);

  try {
    console.log(`❓ Question: "${question}"`);
    console.log('⏳ Thinking...\n');

    const startTime = Date.now();
    const response = await provider.chat(
      [{ role: 'user', content: question }],
      { temperature: 0.7, max_tokens: 150 }
    );
    const duration = Date.now() - startTime;

    console.log(`✅ Response (${duration}ms):`);
    console.log(`   ${response.content}\n`);

    if (response.usage) {
      console.log(`📊 Usage:`);
      console.log(`   Prompt tokens: ${response.usage.prompt_tokens}`);
      console.log(`   Completion tokens: ${response.usage.completion_tokens}`);
      console.log(`   Total tokens: ${response.usage.total_tokens}`);
    }

  } catch (error) {
    console.log(`❌ Error: ${(error as Error).message}`);
    console.log(`💡 Make sure the API key is set for ${name}\n`);
  }
}

async function testStreamingProvider(
  name: string,
  provider: any,
  question: string
): Promise<void> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🌊 ${name} - STREAMING (${provider.getModelName()})`);
  console.log(`${'='.repeat(80)}`);

  try {
    console.log(`❓ Question: "${question}"`);
    console.log('⏳ Streaming response...\n');
    console.log('💬 ');

    const startTime = Date.now();
    let tokenCount = 0;

    for await (const chunk of provider.chatStream(
      [{ role: 'user', content: question }],
      { temperature: 0.7, max_tokens: 100 }
    )) {
      if (chunk.content) {
        process.stdout.write(chunk.content);
        tokenCount++;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`\n\n✅ Streaming complete (${duration}ms, ~${tokenCount} chunks)\n`);

  } catch (error) {
    console.log(`\n❌ Error: ${(error as Error).message}\n`);
  }
}

async function main() {
  console.log('🚀 Sekuire SDK - All LLM Providers Test\n');

  const question = 'What is the capital of France? Answer in one sentence.';
  const streamQuestion = 'Tell me a very short fun fact about cats.';

  // Test 1: OpenAI
  if (process.env.OPENAI_API_KEY) {
    const openai = llm.openai({
      apiKey: process.env.OPENAI_API_KEY!,
      model: 'gpt-4',
    });
    await testProvider('OpenAI GPT-4', openai, question);
    await testStreamingProvider('OpenAI GPT-4', openai, streamQuestion);
  } else {
    console.log('\n⚠️  OPENAI_API_KEY not set, skipping OpenAI test');
  }

  // Test 2: Anthropic
  if (process.env.ANTHROPIC_API_KEY) {
    const anthropic = llm.anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
      model: 'claude-3-5-sonnet-20241022',
    });
    await testProvider('Anthropic Claude 3.5', anthropic, question);
    await testStreamingProvider('Anthropic Claude 3.5', anthropic, streamQuestion);
  } else {
    console.log('\n⚠️  ANTHROPIC_API_KEY not set, skipping Anthropic test');
  }

  // Test 3: Google Gemini
  if (process.env.GOOGLE_API_KEY) {
    const google = llm.google({
      apiKey: process.env.GOOGLE_API_KEY!,
      model: 'gemini-1.5-pro',
    });
    await testProvider('Google Gemini 1.5 Pro', google, question);
    await testStreamingProvider('Google Gemini 1.5 Pro', google, streamQuestion);
  } else {
    console.log('\n⚠️  GOOGLE_API_KEY not set, skipping Google test');
  }

  // Test 4: Ollama (local)
  try {
    const ollama = llm.ollama({
      apiKey: '', // Not needed for local
      model: 'llama2',
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    });
    await testProvider('Ollama Llama 2 (Local)', ollama, question);
    await testStreamingProvider('Ollama Llama 2 (Local)', ollama, streamQuestion);
  } catch (error) {
    console.log('\n⚠️  Ollama not running locally, skipping Ollama test');
    console.log('   Start Ollama: brew install ollama && ollama serve');
    console.log('   Download model: ollama pull llama2\n');
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('🎉 Testing Complete!');
  console.log('='.repeat(80));
  console.log('\n💡 Provider Comparison:');
  console.log('\n📊 OpenAI GPT-4:');
  console.log('   ✅ Excellent reasoning and instruction following');
  console.log('   ✅ Great for code generation and complex tasks');
  console.log('   ⚠️  Higher cost, moderate speed');
  console.log('\n🧠 Anthropic Claude 3.5:');
  console.log('   ✅ Best for long documents and analysis');
  console.log('   ✅ 200K context window!');
  console.log('   ✅ Strong safety and ethical reasoning');
  console.log('\n🌟 Google Gemini 1.5 Pro:');
  console.log('   ✅ 2M token context window! (largest)');
  console.log('   ✅ Multimodal (text, images, video)');
  console.log('   ✅ Fast and cost-effective');
  console.log('\n🏠 Ollama (Local):');
  console.log('   ✅ 100% private and offline');
  console.log('   ✅ Free to use');
  console.log('   ✅ Great for sensitive data');
  console.log('   ⚠️  Requires local GPU/CPU resources\n');

  console.log('📝 Configuration:');
  console.log('   Set API keys in .env file:');
  console.log('   - OPENAI_API_KEY=sk-...');
  console.log('   - ANTHROPIC_API_KEY=sk-ant-...');
  console.log('   - GOOGLE_API_KEY=...');
  console.log('   - OLLAMA_BASE_URL=http://localhost:11434 (optional)\n');
}

main();
