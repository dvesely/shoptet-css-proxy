/**
 * Example: Starting from configuration file
 * 
 * This example shows how to start the proxy server using a configuration file
 */

import { startFromConfig } from '../index.js';

// Start server from config file
startFromConfig('./proxy.config.json')
  .then(server => {
    console.log('Server started successfully!');
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\nShutting down...');
      await server.stop();
      process.exit(0);
    });
  })
  .catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
