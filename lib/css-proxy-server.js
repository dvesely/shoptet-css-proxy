/** @format */

import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { resolve } from 'path';
import { readFileSync, existsSync } from 'fs';
import chokidar from 'chokidar';

export class CSSProxyServer {
  constructor(options = {}) {
    this.options = {
      port: options.port || 3000,
      productionUrl: options.productionUrl,
      cssMappings: options.cssMappings || {},
      sourceFolder: options.sourceFolder || './src',
      watchCSS: options.watchCSS !== false,
      logLevel: options.logLevel || 'info',
      ...options
    };

    if (!this.options.productionUrl || !this.options.productionUrl.startsWith('http')) {
      throw new Error('Invalid productionUrl: must be a valid HTTP/HTTPS URL');
    }

    this.app = express();
    this.cssMappings = new Map();
    this.watcher = null;
    this.server = null;
    this.baseDir = options.baseDir || process.cwd();
  }

  log(message, level = 'info') {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    const currentLevel = levels[this.options.logLevel] || 1;
    const messageLevel = levels[level] || 1;
    
    if (messageLevel >= currentLevel) {
      console.log(message);
    }
  }

  async findCSSFiles() {
    const { glob } = await import('glob');
    const sourcePath = resolve(this.baseDir, this.options.sourceFolder);
    const cssFiles = await glob(`${this.options.sourceFolder}/**/*.css`, {
      cwd: this.baseDir
    });
    return cssFiles;
  }

  async buildCSSMapping() {
    const cssFiles = await this.findCSSFiles();
    this.cssMappings.clear();
    
    // First, add mappings from options
    if (this.options.cssMappings) {
      Object.entries(this.options.cssMappings).forEach(([prodPath, localPath]) => {
        const resolvedPath = resolve(this.baseDir, localPath);
        this.log(`[CSS Mapping] Checking: ${prodPath} -> ${resolvedPath}`, 'debug');
        if (existsSync(resolvedPath)) {
          this.cssMappings.set(prodPath, resolvedPath);
          this.log(`[CSS Mapping] ✓ Added: ${prodPath} -> ${resolvedPath}`, 'debug');
        } else {
          this.log(`[CSS Mapping] ✗ File not found: ${resolvedPath}`, 'warn');
        }
      });
    }
    
    // Then, auto-detect CSS files and create common mappings
    cssFiles.forEach(file => {
      // Extract the folder name (header, footer, index, etc.)
      const match = file.match(new RegExp(`${this.options.sourceFolder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/([^/]+)/`));
      if (match) {
        const folder = match[1];
        const resolvedFile = resolve(this.baseDir, file);
        
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
          if (!this.cssMappings.has(pattern)) {
            this.cssMappings.set(pattern, resolvedFile);
          }
        });
      }
    });
    
    if (this.options.logLevel === 'debug') {
      this.log('CSS Mappings:', 'debug');
      this.cssMappings.forEach((localPath, prodPath) => {
        this.log(`  ${prodPath} -> ${localPath}`, 'debug');
      });
    }
  }

  setupCSSMiddleware() {
    // Middleware to serve local CSS files (must be before proxy)
    this.app.use((req, res, next) => {
      const urlPath = req.path.split('?')[0]; // Remove query string
      
      // Check if this is a CSS file request
      if (urlPath.endsWith('.css')) {
        this.log(`[CSS Check] Requested: ${urlPath}`, 'debug');
        
        // First, try exact match from mappings
        if (this.cssMappings.has(urlPath)) {
          const localPath = this.cssMappings.get(urlPath);
          this.log(`[CSS Check] Exact match found: ${urlPath} -> ${localPath}`, 'debug');
          if (existsSync(localPath)) {
            this.log(`✓ Serving local CSS: ${urlPath} -> ${localPath}`, 'info');
            const cssContent = readFileSync(localPath, 'utf-8');
            res.setHeader('Content-Type', 'text/css');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            return res.send(cssContent);
          } else {
            this.log(`[CSS Check] File not found: ${localPath}`, 'debug');
          }
        }
        
        // Try partial matches (check if URL contains the pattern base)
        for (const [pattern, localPath] of this.cssMappings.entries()) {
          // Remove .css extension for matching
          const patternBase = pattern.replace(/\.css$/, '');
          // Check if URL path contains the pattern or matches the filename
          if (urlPath.includes(patternBase) || urlPath.endsWith(pattern.split('/').pop())) {
            this.log(`[CSS Check] Partial match found: ${urlPath} matches ${pattern} -> ${localPath}`, 'debug');
            if (existsSync(localPath)) {
              this.log(`✓ Serving local CSS (partial match): ${urlPath} -> ${localPath}`, 'info');
              const cssContent = readFileSync(localPath, 'utf-8');
              res.setHeader('Content-Type', 'text/css');
              res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
              res.setHeader('Pragma', 'no-cache');
              res.setHeader('Expires', '0');
              return res.send(cssContent);
            }
          }
        }
        
        // Also check for direct path matches in source directory
        const directPath = resolve(this.baseDir, this.options.sourceFolder, urlPath.replace(/^\//, ''));
        if (existsSync(directPath) && directPath.endsWith('.css')) {
          this.log(`✓ Serving local CSS (direct): ${urlPath} -> ${directPath}`, 'info');
          const cssContent = readFileSync(directPath, 'utf-8');
          res.setHeader('Content-Type', 'text/css');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
          return res.send(cssContent);
        }
        
        this.log(`[CSS Check] No local match found for ${urlPath}, will proxy to production`, 'debug');
      }
      
      next();
    });
  }

  setupProxyMiddleware() {
    // Test endpoint (must be before proxy middleware)
    this.app.get('/proxy-test', (req, res) => {
      res.json({
        status: 'ok',
        proxyTarget: this.options.productionUrl,
        port: this.options.port,
        timestamp: new Date().toISOString()
      });
    });

    // Create proxy middleware
    const proxy = createProxyMiddleware({
      target: this.options.productionUrl,
      changeOrigin: true,
      secure: false,
      logLevel: this.options.logLevel === 'debug' ? 'debug' : 'silent',
      ws: true,
      followRedirects: true,
      onError: (err, req, res) => {
        this.log(`❌ Proxy error for ${req.method} ${req.url}`, 'error');
        this.log(`   Error message: ${err.message}`, 'error');
        this.log(`   Error code: ${err.code}`, 'error');
        this.log(`   Target was: ${this.options.productionUrl}`, 'error');
        if (err.stack) {
          this.log(`   Stack: ${err.stack.split('\n').slice(0, 3).join('\n')}`, 'error');
        }
        if (!res.headersSent) {
          res.status(502).json({ 
            error: 'Proxy error', 
            message: err.message,
            code: err.code,
            target: this.options.productionUrl
          });
        }
      },
      onProxyReq: (proxyReq, req) => {
        this.log(`→ Proxying ${req.method} ${req.path} to ${this.options.productionUrl}`, 'debug');
      },
      onProxyRes: (proxyRes, req, res) => {
        // Disable caching
        proxyRes.headers['cache-control'] = 'no-cache, no-store, must-revalidate';
        proxyRes.headers['pragma'] = 'no-cache';
        proxyRes.headers['expires'] = '0';
        
        // Inject CSS reload script for HTML pages
        const contentType = proxyRes.headers['content-type'] || '';
        if (contentType.includes('text/html') && this.options.injectCSSReload !== false) {
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
              this.log(`Error injecting script: ${error.message}`, 'error');
              // Fallback: send original body without modification
              originalWrite(Buffer.from(body));
              originalEnd();
            }
          };
        }
      }
    });

    // Apply proxy to all routes (after CSS middleware and test endpoint)
    this.app.use((req, res, next) => {
      // Skip proxy for test endpoint and favicon
      if (req.path === '/proxy-test' || req.path === '/favicon.ico' || req.path.startsWith('/_next/')) {
        return next();
      }
      
      // Log the request
      this.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`, 'debug');
      
      // Apply proxy
      try {
        proxy(req, res, next);
      } catch (error) {
        this.log(`Error applying proxy: ${error.message}`, 'error');
        if (!res.headersSent) {
          res.status(500).json({ error: 'Proxy application error', message: error.message });
        }
      }
    });
  }

  setupErrorHandling() {
    // Error handling
    this.app.use((err, req, res, next) => {
      this.log(`Express error: ${err.message}`, 'error');
      this.log(`Stack: ${err.stack}`, 'error');
      if (!res.headersSent) {
        res.status(500).json({ 
          error: 'Internal server error',
          message: err.message 
        });
      }
    });
  }

  async testProductionConnection() {
    try {
      const https = await import('https');
      return new Promise((resolve) => {
        const url = new URL(this.options.productionUrl);
        const req = https.request({
          hostname: url.hostname,
          port: url.port || 443,
          path: '/',
          method: 'HEAD',
          timeout: 5000
        }, (res) => {
          this.log(`✅ Can reach ${this.options.productionUrl} (Status: ${res.statusCode})`, 'info');
          resolve(true);
        });
        
        req.on('error', (err) => {
          this.log(`⚠️  Warning: Cannot reach ${this.options.productionUrl}`, 'warn');
          this.log(`   Error: ${err.message}`, 'warn');
          this.log(`   The proxy will still start, but requests may fail.`, 'warn');
          resolve(false);
        });
        
        req.on('timeout', () => {
          req.destroy();
          this.log(`⚠️  Warning: Connection to ${this.options.productionUrl} timed out`, 'warn');
          this.log(`   The proxy will still start, but requests may fail.`, 'warn');
          resolve(false);
        });
        
        req.end();
      });
    } catch (error) {
      this.log(`⚠️  Could not test connection: ${error.message}`, 'warn');
      return false;
    }
  }

  setupWatcher() {
    if (!this.options.watchCSS) return;

    const watchPath = resolve(this.baseDir, this.options.sourceFolder, '**/*.css');
    this.watcher = chokidar.watch(watchPath, {
      ignored: /node_modules/,
      persistent: true,
      ignoreInitial: true,
      cwd: this.baseDir
    });

    this.watcher.on('change', (path) => {
      this.log(`CSS file changed: ${path}`, 'info');
      this.buildCSSMapping().catch(err => {
        this.log(`Error rebuilding CSS mappings: ${err.message}`, 'error');
      });
    });
  }

  async start() {
    try {
      await this.buildCSSMapping();
      this.log('\n✅ CSS mappings loaded', 'info');
    } catch (error) {
      this.log(`Warning: Could not build CSS mappings: ${error.message}`, 'warn');
    }

    this.setupCSSMiddleware();
    this.setupProxyMiddleware();
    this.setupErrorHandling();
    this.setupWatcher();

    // Test connection (non-blocking)
    this.testProductionConnection();

    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.options.port, () => {
        this.log(`\n✅ Proxy server started successfully!`, 'info');
        this.log(`🚀 Local URL: http://localhost:${this.options.port}`, 'info');
        this.log(`📡 Proxying to: ${this.options.productionUrl}`, 'info');
        this.log(`🎨 Watching CSS files in ${this.options.sourceFolder}/**/*.css`, 'info');
        this.log(`\n💡 Test endpoint: http://localhost:${this.options.port}/proxy-test`, 'info');
        this.log(`💡 Open http://localhost:${this.options.port} in your browser\n`, 'info');
        resolve(this.server);
      });
      
      this.server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          this.log(`\n❌ Port ${this.options.port} is already in use.`, 'error');
          this.log(`   Please stop the other process or change the port\n`, 'error');
          reject(err);
        } else {
          this.log(`Server error: ${err.message}`, 'error');
          reject(err);
        }
      });
    });
  }

  async stop() {
    return new Promise((resolve) => {
      if (this.watcher) {
        this.watcher.close();
      }
      
      if (this.server) {
        this.server.close(() => {
          this.log('Proxy server stopped', 'info');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}
