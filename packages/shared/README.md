# @flowglad/shared

[![npm version](https://img.shields.io/npm/v/@flowglad/shared.svg)](https://www.npmjs.com/package/@flowglad/shared)
[![npm bundle size](https://img.shields.io/bundlephobia/min/@flowglad/shared)](https://bundlephobia.com/package/@flowglad/shared)

Shared types, schemas, and utilities for Flowglad projects. This package serves as the central source of truth for TypeScript types and Zod schemas used across the Flowglad ecosystem.

## Features

- TypeScript type definitions for Flowglad's data structures
- Zod schemas for runtime type validation
- Shared utility functions
- Common action types and interfaces
- Environment-aware configuration utilities

## Installation

```bash
npm install @flowglad/shared
# or
yarn add @flowglad/shared
# or
bun add @flowglad/shared
```

## Usage

```typescript
// Import types and schemas
import type { CreateProductCheckoutSessionParams } from '@flowglad/shared';
import { createCheckoutSessionSchema } from '@flowglad/shared';
```

## API Reference

### Utilities

- `getBaseURL()`: Returns the base URL for the Flowglad API, with development environment support

### Types and Schemas

The package exports various TypeScript types and Zod schemas that are used across Flowglad projects. These include:

- Action types
- Common interfaces
- Validation schemas

## Development

This package is built using:
- TypeScript
- Zod for schema validation
- tsup for building

## License

MIT
