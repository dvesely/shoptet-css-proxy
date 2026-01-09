/** @format */

import { startFromConfig } from './index.js';

// Load and start server from config file
// This file is kept for backward compatibility
// For new projects, use: npm start or npx shoptet-css-proxy
startFromConfig('./proxy.config.json')
  .catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
