# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a GitHub Action proof-of-concept (PoC) for guardrails functionality. The action is built using JavaScript with ES modules and uses Rollup to bundle the source code into a distributable format.

## Build System

The project uses Rollup to bundle the source code from `src/` into `dist/index.js`.

**Build command:**
```bash
npm run build
```

This runs `rollup -c` which:
- Takes `src/index.js` as the entry point
- Bundles all dependencies using `@rollup/plugin-commonjs` and `@rollup/plugin-node-resolve`
- Outputs to `dist/index.js` in ES module format with sourcemaps
- Resolves Node.js built-in modules preferentially

**Important:** The `dist/` directory must be committed to the repository, as GitHub Actions runs the bundled code from `dist/index.js` (specified in `action.yml`).

## Architecture

### GitHub Action Structure

The action is defined in `action.yml`:
- **Runtime:** Node.js 20
- **Entry point:** `dist/index.js` (bundled output)
- **Inputs:** `who-to-greet` (configurable greeting target)
- **Outputs:** `time` (timestamp of execution)

### Source Code Organization

- `src/index.js` - Main action entry point that uses GitHub Actions toolkit libraries (`@actions/core` and `@actions/github`)
- The action currently implements a simple greeting workflow with webhook payload logging

### Dependencies

**Runtime dependencies:**
- `@actions/core` - Core GitHub Actions functionality (inputs, outputs, logging)
- `@actions/github` - GitHub API client and webhook context

**Dev dependencies:**
- `rollup` - Module bundler
- `@rollup/plugin-commonjs` - CommonJS to ES6 module conversion
- `@rollup/plugin-node-resolve` - Node module resolution

## Development Workflow

1. Make changes to source files in `src/`
2. Run `npm run build` to bundle the code
3. Commit both source changes and the updated `dist/` directory
4. The action runs using the bundled code in `dist/index.js`

## Module System

The project uses ES modules (`"type": "module"` in package.json). All source code should use `import`/`export` syntax rather than `require()`/`module.exports`.
