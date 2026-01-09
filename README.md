# Shoptet CSS Proxy

A development proxy server that intercepts CSS requests and serves local CSS files while proxying all other requests to a production server. Perfect for developing CSS changes locally while testing against a live production environment.

## Features

- 🎨 **CSS Interception**: Automatically serves local CSS files instead of production CSS
- 🔄 **Hot Reload**: Watches for CSS file changes and auto-reloads in the browser
- 📡 **Full Proxy**: Proxies all non-CSS requests to your production server
- ⚙️ **Configurable**: Easy configuration via JSON file or programmatic API
- 🚀 **Easy Setup**: Works out of the box with sensible defaults

## Installation

```bash
npm install shoptet-css-proxy
```

Or install globally:

```bash
npm install -g shoptet-css-proxy
```

## Quick Start

### 1. Create a configuration file

Create a `proxy.config.json` file in your project root:

```json
{
  "productionUrl": "https://example.com",
  "port": 3000,
  "sourceFolder": "./src",
  "cssMappings": {
    "/assets/css/header.css": "./src/header/style.css",
    "/assets/css/footer.css": "./src/footer/style.css"
  }
}
```

### 2. Run the proxy server

**Using CLI:**
```bash
npx shoptet-css-proxy
```

Or if installed globally:
```bash
shoptet-css-proxy
```

**Using npm script:**
```json
{
  "scripts": {
    "proxy": "shoptet-css-proxy"
  }
}
```

Then run:
```bash
npm run proxy
```

### 3. Open your browser

Navigate to `http://localhost:3000` and start developing!

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `productionUrl` | string | **required** | The production URL to proxy to |
| `port` | number | `3000` | Port to run the proxy server on |
| `sourceFolder` | string | `"./src"` | Folder containing local CSS files |
| `cssMappings` | object | `{}` | Map of production CSS paths to local file paths |
| `watchCSS` | boolean | `true` | Whether to watch for CSS file changes |
| `logLevel` | string | `"info"` | Log level: `"debug"`, `"info"`, `"warn"`, `"error"` |
| `injectCSSReload` | boolean | `true` | Whether to inject CSS reload script into HTML |

## Programmatic Usage

### Basic Usage

```javascript
import { createProxyServer } from 'shoptet-css-proxy';

const server = createProxyServer({
  productionUrl: 'https://example.com',
  port: 3000,
  cssMappings: {
    '/assets/css/header.css': './src/header/style.css'
  }
});

await server.start();
```

### Using Configuration File

```javascript
import { startFromConfig } from 'shoptet-css-proxy';

const server = await startFromConfig('./proxy.config.json');
```

### Advanced Usage

```javascript
import { CSSProxyServer } from 'shoptet-css-proxy';

const server = new CSSProxyServer({
  productionUrl: 'https://example.com',
  port: 3000,
  sourceFolder: './styles',
  cssMappings: {
    '/assets/css/main.css': './styles/main.css',
    '/assets/css/components.css': './styles/components.css'
  },
  watchCSS: true,
  logLevel: 'debug',
  injectCSSReload: true,
  baseDir: process.cwd()
});

await server.start();

// Later, stop the server
await server.stop();
```

## How It Works

1. **CSS Request Interception**: When a CSS file is requested, the proxy checks if there's a local file mapped to that path
2. **Local File Serving**: If a match is found, the local CSS file is served instead of proxying to production
3. **Auto-Detection**: CSS files in your `sourceFolder` are automatically mapped to common production paths
4. **Hot Reload**: The proxy watches for CSS file changes and injects a reload script into HTML pages
5. **Production Proxy**: All other requests are proxied to your production server

## CSS Mapping

The proxy uses three methods to match CSS requests:

1. **Exact Match**: Checks `cssMappings` for exact path matches
2. **Partial Match**: Tries to match based on filename or path patterns
3. **Direct Path**: Checks if the requested path exists directly in the `sourceFolder`

### Auto-Detection

If you have CSS files in `./src/header/style.css`, the proxy will automatically try to match:
- `/assets/css/header.css`
- `/assets/css/styles.header.css`
- `/css/header.css`
- `/styles/header.css`
- `/dist/styles.header.css`

## API Reference

### `createProxyServer(options)`

Creates a new CSS proxy server instance.

**Parameters:**
- `options` (object): Configuration options (see Configuration Options above)

**Returns:** `CSSProxyServer` instance

### `startFromConfig(configPath)`

Starts a proxy server from a configuration file.

**Parameters:**
- `configPath` (string): Path to configuration file (default: `"proxy.config.json"`)

**Returns:** `Promise<CSSProxyServer>`

### `CSSProxyServer` Class

#### Methods

- `start()`: Starts the proxy server
- `stop()`: Stops the proxy server
- `buildCSSMapping()`: Rebuilds the CSS file mappings

## Examples

### Example 1: Simple Setup

```json
{
  "productionUrl": "https://myshop.shoptet.cz",
  "port": 3000
}
```

### Example 2: Custom CSS Mappings

```json
{
  "productionUrl": "https://myshop.shoptet.cz",
  "port": 3000,
  "cssMappings": {
    "/user/documents/styles.header.css": "./src/header/style.css",
    "/user/documents/styles.footer.css": "./src/footer/style.css",
    "/user/documents/styles.main.css": "./src/main.css"
  }
}
```

### Example 3: Custom Source Folder

```json
{
  "productionUrl": "https://myshop.shoptet.cz",
  "port": 3000,
  "sourceFolder": "./styles",
  "logLevel": "debug"
}
```

## Troubleshooting

### Port Already in Use

If you get an error that the port is already in use, change the port in your configuration:

```json
{
  "port": 3001
}
```

### CSS Not Loading

1. Check that your `cssMappings` paths match the production CSS paths
2. Verify that your local CSS files exist at the specified paths
3. Use `logLevel: "debug"` to see detailed matching information

### Production URL Not Reachable

The proxy will warn you if it can't reach the production URL, but it will still start. Make sure your production URL is correct and accessible.

## License

UNLICENSED
