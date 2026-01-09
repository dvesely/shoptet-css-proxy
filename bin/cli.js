#!/usr/bin/env node

/** @format */

import { startFromConfig, loadConfig } from '../index.js';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const configPath = args.find(arg => arg.startsWith('--config='))?.split('=')[1] || 
                   args[args.indexOf('--config') + 1] || 
                   'proxy.config.json';

const help = `
Usage: shoptet-css-proxy [options]

Options:
  --config <path>    Path to configuration file (default: proxy.config.json)
  --help, -h         Show this help message

Example:
  shoptet-css-proxy --config ./my-config.json
`;

if (args.includes('--help') || args.includes('-h')) {
  console.log(help);
  process.exit(0);
}

// Start the server
(async () => {
  try {
    const resolvedConfigPath = resolve(process.cwd(), configPath);
    console.log(`Loading configuration from: ${resolvedConfigPath}`);
    
    const server = await startFromConfig(configPath);
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n\nShutting down gracefully...');
      await server.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n\nShutting down gracefully...');
      await server.stop();
      process.exit(0);
    });
  } catch (error) {
    console.error('Failed to start proxy server:', error.message);
    process.exit(1);
  }
})();
