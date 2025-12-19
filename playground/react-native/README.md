# React Native Playground

This is a testing playground for validating Flowglad's ability to work with React Native. This project is **not** a template or starter project—it's used internally to test and verify Flowglad's React Native integration.

## Run playground app
1. Install packages in monorepo root: `bun install`
2. Navigate to playground directory: `cd playground/react-native`
3. Create env file: `cp .env.example .env.local`
4. Edit `.env.local` and add your Flowglad API key
5. Generate Prisma client and run migrations:
- `bunx prisma generate`
- `bunx prisma migrate deploy`
6. Start Expo development server: `bunx expo start`

