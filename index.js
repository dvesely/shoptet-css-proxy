/** @format */

import { CSSProxyServer } from './lib/css-proxy-server.js';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load configuration from a JSON file
 * @param {string} configPath - Path to the configuration file
 * @returns {object} Configuration object
 */
export function loadConfig(configPath = 'proxy.config.json') {
  const resolvedPath = resolve(process.cwd(), configPath);
  
  if (!existsSync(resolvedPath)) {
    return null;
  }

  try {
    const configFile = readFileSync(resolvedPath, 'utf-8');
    return JSON.parse(configFile);
  } catch (error) {
    throw new Error(`Failed to load config from ${configPath}: ${error.message}`);
  }
}

/**
 * Create a CSS proxy server instance
 * @param {object} options - Configuration options
 * @param {string} options.productionUrl - The production URL to proxy to
 * @param {number} [options.port=3000] - Port to run the proxy server on
 * @param {object} [options.cssMappings={}] - Map of production CSS paths to local file paths
 * @param {string} [options.sourceFolder='./src'] - Folder containing local CSS files
 * @param {boolean} [options.watchCSS=true] - Whether to watch for CSS file changes
 * @param {string} [options.logLevel='info'] - Log level: 'debug', 'info', 'warn', 'error'
 * @param {boolean} [options.injectCSSReload=true] - Whether to inject CSS reload script into HTML
 * @param {string} [options.baseDir] - Base directory for resolving paths (defaults to process.cwd())
 * @returns {CSSProxyServer} CSS proxy server instance
 */
export function createProxyServer(options = {}) {
  // If configPath is provided, load config from file
  if (options.configPath) {
    const config = loadConfig(options.configPath);
    if (config) {
      options = { ...config, ...options };
    }
    delete options.configPath;
  }

  return new CSSProxyServer(options);
}

/**
 * Start a proxy server from a configuration file
 * @param {string} configPath - Path to the configuration file
 * @returns {Promise<CSSProxyServer>} The started proxy server instance
 */
export async function startFromConfig(configPath = 'proxy.config.json') {
  const config = loadConfig(configPath);
  if (!config) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }

  const server = createProxyServer(config);
  await server.start();
  return server;
}

// Export the class directly
export { CSSProxyServer };

// Default export
export default {
  CSSProxyServer,
  createProxyServer,
  startFromConfig,
  loadConfig
};
