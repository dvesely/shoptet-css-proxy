/**
 * Basic usage example
 * 
 * This example shows how to use the CSS proxy server programmatically
 */

import { createProxyServer } from '../index.js';

// Create and start the proxy server
const server = createProxyServer({
  productionUrl: 'https://example.com',
  port: 3000,
  cssMappings: {
    '/assets/css/header.css': './src/header/style.css',
    '/assets/css/footer.css': './src/footer/style.css'
  },
  logLevel: 'info'
});

// Start the server
server.start().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await server.stop();
  process.exit(0);
});
