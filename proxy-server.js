/** @format */

import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync, existsSync } from 'fs';
import chokidar from 'chokidar';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load configuration
let config;
try {
  const configFile = readFileSync(resolve(__dirname, 'proxy.config.json'), 'utf-8');
  config = JSON.parse(configFile);
} catch (error) {
  console.warn('Could not load proxy.config.json, using defaults');
}

const app = express();
const PORT = config.port || 3000;
const PRODUCTION_URL = config.productionUrl;

// Validate configuration
if (!PRODUCTION_URL || !PRODUCTION_URL.startsWith('http')) {
  console.error('❌ Invalid production URL in config:', PRODUCTION_URL);
  console.error('   Please check proxy.config.json');
  process.exit(1);
}

console.log('Configuration:');
console.log('  Port:', PORT);
console.log('  Production URL:', PRODUCTION_URL);

// Store CSS file mappings
const cssMappings = new Map();

// Function to find CSS files in src directory
async function findCSSFiles() {
  const { glob } = await import('glob');
  const cssFiles = await glob('./src/**/*.css');
  return cssFiles;
}

// Function to build CSS mapping based on file paths
async function buildCSSMapping() {
  const cssFiles = await findCSSFiles();
  cssMappings.clear();
  
  // First, add mappings from config file
  if (config.cssMappings) {
    Object.entries(config.cssMappings).forEach(([prodPath, localPath]) => {
      const resolvedPath = resolve(__dirname, localPath);
      console.log(`[CSS Mapping] Checking: ${prodPath} -> ${resolvedPath}`);
      if (existsSync(resolvedPath)) {
        cssMappings.set(prodPath, resolvedPath);
        console.log(`[CSS Mapping] ✓ Added: ${prodPath} -> ${resolvedPath}`);
      } else {
        console.warn(`[CSS Mapping] ✗ File not found: ${resolvedPath}`);
      }
    });
  }
  
  // Then, auto-detect CSS files and create common mappings
  cssFiles.forEach(file => {
    // Extract the folder name (header, footer, index, etc.)
    const match = file.match(/src\/([^\/]+)\//);
    if (match) {
      const folder = match[1];
      const resolvedFile = resolve(__dirname, file);
      
      // Map common CSS paths that might be used in production
      // Only add if not already in config mappings
      const patterns = [
        `/assets/css/${folder}.css`,
        `/assets/css/styles.${folder}.css`,
        `/css/${folder}.css`,
        `/styles/${folder}.css`,
        `/dist/styles.${folder}.css`,
      ];
      
      patterns.forEach(pattern => {
        if (!cssMappings.has(pattern)) {
          cssMappings.set(pattern, resolvedFile);
        }
      });
    }
  });
  
  console.log('CSS Mappings:');
  cssMappings.forEach((localPath, prodPath) => {
    console.log(`  ${prodPath} -> ${localPath}`);
  });
}

// Watch for CSS file changes
const watcher = chokidar.watch('./src/**/*.css', {
  ignored: /node_modules/,
  persistent: true,
  ignoreInitial: true
});

watcher.on('change', (path) => {
  console.log(`CSS file changed: ${path}`);
  buildCSSMapping().catch(console.error);
});

// Middleware to serve local CSS files (must be before proxy)
app.use((req, res, next) => {
  const urlPath = req.path.split('?')[0]; // Remove query string
  
  // Check if this is a CSS file request
  if (urlPath.endsWith('.css')) {
    console.log(`[CSS Check] Requested: ${urlPath}`);
    console.log(`[CSS Check] Available mappings:`, Array.from(cssMappings.keys()));
    
    // First, try exact match from mappings
    if (cssMappings.has(urlPath)) {
      const localPath = cssMappings.get(urlPath);
      console.log(`[CSS Check] Exact match found: ${urlPath} -> ${localPath}`);
      if (existsSync(localPath)) {
        console.log(`✓ Serving local CSS: ${urlPath} -> ${localPath}`);
        const cssContent = readFileSync(localPath, 'utf-8');
        res.setHeader('Content-Type', 'text/css');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        return res.send(cssContent);
      } else {
        console.log(`[CSS Check] File not found: ${localPath}`);
      }
    }
    
    // Try partial matches (check if URL contains the pattern base)
    for (const [pattern, localPath] of cssMappings.entries()) {
      // Remove .css extension for matching
      const patternBase = pattern.replace(/\.css$/, '');
      // Check if URL path contains the pattern or matches the filename
      if (urlPath.includes(patternBase) || urlPath.endsWith(pattern.split('/').pop())) {
        console.log(`[CSS Check] Partial match found: ${urlPath} matches ${pattern} -> ${localPath}`);
        if (existsSync(localPath)) {
          console.log(`✓ Serving local CSS (partial match): ${urlPath} -> ${localPath}`);
          const cssContent = readFileSync(localPath, 'utf-8');
          res.setHeader('Content-Type', 'text/css');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
          return res.send(cssContent);
        }
      }
    }
    
    // Also check for direct path matches in src directory
    const directPath = resolve(__dirname, 'src', urlPath.replace(/^\//, ''));
    if (existsSync(directPath) && directPath.endsWith('.css')) {
      console.log(`✓ Serving local CSS (direct): ${urlPath} -> ${directPath}`);
      const cssContent = readFileSync(directPath, 'utf-8');
      res.setHeader('Content-Type', 'text/css');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      return res.send(cssContent);
    }
    
    console.log(`[CSS Check] No local match found for ${urlPath}, will proxy to production`);
  }
  
  next();
});

// Verify production URL
console.log('Production URL:', PRODUCTION_URL);
if (!PRODUCTION_URL || !PRODUCTION_URL.startsWith('http')) {
  console.error('❌ Invalid production URL:', PRODUCTION_URL);
  process.exit(1);
}

// Test endpoint (must be before proxy middleware)
app.get('/proxy-test', (req, res) => {
  res.json({
    status: 'ok',
    proxyTarget: PRODUCTION_URL,
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

// Create proxy middleware
const proxy = createProxyMiddleware({
  target: PRODUCTION_URL,
  changeOrigin: true,
  secure: false,
  logLevel: 'debug', // Enable debug logging
  ws: true,
  followRedirects: true,
  onError: (err, req, res) => {
    console.error('❌ Proxy error for', req.method, req.url);
    console.error('   Error message:', err.message);
    console.error('   Error code:', err.code);
    console.error('   Target was:', PRODUCTION_URL);
    if (err.stack) {
      console.error('   Stack:', err.stack.split('\n').slice(0, 3).join('\n'));
    }
    if (!res.headersSent) {
      res.status(502).json({ 
        error: 'Proxy error', 
        message: err.message,
        code: err.code,
        target: PRODUCTION_URL
      });
    }
  },
  onProxyReq: (proxyReq, req) => {
    console.log(`→ Proxying ${req.method} ${req.path} to ${PRODUCTION_URL}`);
    // Ensure we're not creating a loop
    if (req.headers.host && req.headers.host.includes('localhost:' + PORT)) {
      console.log('   ✓ Request from localhost, proxying to production');
    }
  },
  onProxyRes: (proxyRes, req, res) => {
    // Disable caching
    proxyRes.headers['cache-control'] = 'no-cache, no-store, must-revalidate';
    proxyRes.headers['pragma'] = 'no-cache';
    proxyRes.headers['expires'] = '0';
    
    // Inject CSS reload script for HTML pages
    const contentType = proxyRes.headers['content-type'] || '';
    if (contentType.includes('text/html')) {
      let body = '';
      const originalWrite = res.write.bind(res);
      const originalEnd = res.end.bind(res);
      
      res.write = function(chunk) {
        if (chunk) body += chunk.toString();
        return true;
      };
      
      res.end = function(chunk) {
        if (chunk) body += chunk.toString();
        
        try {
          const cssReloadScript = `
<script>
(function() {
  const cssFiles = document.querySelectorAll('link[rel="stylesheet"]');
  let lastModified = {};
  function checkCSS() {
    cssFiles.forEach(link => {
      const href = link.href.split('?')[0];
      fetch(href + '?t=' + Date.now(), {cache: 'no-store'})
        .then(r => r.text())
        .then(css => {
          const hash = btoa(css).substring(0, 10);
          if (lastModified[href] && lastModified[href] !== hash) {
            link.href = href + '?v=' + Date.now();
            console.log('CSS updated:', href);
          }
          lastModified[href] = hash;
        })
        .catch(() => {});
    });
  }
  setInterval(checkCSS, 2000);
  checkCSS();
})();
</script>`;
          
          if (body.includes('</body>')) {
            body = body.replace('</body>', cssReloadScript + '</body>');
          } else if (body.includes('</html>')) {
            body = body.replace('</html>', cssReloadScript + '</html>');
          }
          
          delete proxyRes.headers['content-length'];
          res.setHeader('Content-Length', Buffer.byteLength(body));
          originalWrite(Buffer.from(body));
          originalEnd();
        } catch (error) {
          console.error('Error injecting script:', error);
          // Fallback: send original body without modification
          originalWrite(Buffer.from(body));
          originalEnd();
        }
      };
    }
  }
});

// Apply proxy to all routes (after CSS middleware and test endpoint)
app.use((req, res, next) => {
  // Skip proxy for test endpoint and favicon
  if (req.path === '/proxy-test' || req.path === '/favicon.ico' || req.path.startsWith('/_next/')) {
    return next();
  }
  
  // Log the request
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  
  // Apply proxy
  try {
    proxy(req, res, next);
  } catch (error) {
    console.error('Error applying proxy:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Proxy application error', message: error.message });
    }
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Express error:', err.message);
  console.error('Stack:', err.stack);
  if (!res.headersSent) {
    res.status(500).json({ 
      error: 'Internal server error',
      message: err.message 
    });
  }
});

// Test connection to production URL
async function testProductionConnection() {
  try {
    const https = await import('https');
    return new Promise((resolve) => {
      const url = new URL(PRODUCTION_URL);
      const req = https.request({
        hostname: url.hostname,
        port: url.port || 443,
        path: '/',
        method: 'HEAD',
        timeout: 5000
      }, (res) => {
        console.log(`✅ Can reach ${PRODUCTION_URL} (Status: ${res.statusCode})`);
        resolve(true);
      });
      
      req.on('error', (err) => {
        console.warn(`⚠️  Warning: Cannot reach ${PRODUCTION_URL}`);
        console.warn(`   Error: ${err.message}`);
        console.warn(`   The proxy will still start, but requests may fail.`);
        resolve(false);
      });
      
      req.on('timeout', () => {
        req.destroy();
        console.warn(`⚠️  Warning: Connection to ${PRODUCTION_URL} timed out`);
        console.warn(`   The proxy will still start, but requests may fail.`);
        resolve(false);
      });
      
      req.end();
    });
  } catch (error) {
    console.warn('⚠️  Could not test connection:', error.message);
    return false;
  }
}

// Initialize and start server
async function startServer() {
  try {
    await buildCSSMapping();
    console.log('\n✅ CSS mappings loaded');
  } catch (error) {
    console.warn('Warning: Could not build CSS mappings:', error.message);
  }
  
  // Test connection (non-blocking)
  testProductionConnection();
  
  const server = app.listen(PORT, () => {
    console.log(`\n✅ Proxy server started successfully!`);
    console.log(`🚀 Local URL: http://localhost:${PORT}`);
    console.log(`📡 Proxying to: ${PRODUCTION_URL}`);
    console.log(`🎨 Watching CSS files in ./src/**/*.css`);
    console.log(`\n💡 Test endpoint: http://localhost:${PORT}/proxy-test`);
    console.log(`💡 Open http://localhost:${PORT} in your browser\n`);
  });
  
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌ Port ${PORT} is already in use.`);
      console.log(`   Please stop the other process or change the port in proxy.config.json\n`);
      process.exit(1);
    } else {
      console.error('Server error:', err);
      process.exit(1);
    }
  });
}

startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
