#!/usr/bin/env tsx
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const main = () => {
  const userArg = process.argv[2];

  if (!userArg) {
    return;
  }

  const upperCaseArg = userArg.toUpperCase();
  const exampleFilePath = resolve(process.cwd(), '.env_user.example');
  const targetFilePath = resolve(process.cwd(), '.env_user');

  try {
    // Read the example file
    const exampleContent = readFileSync(exampleFilePath, 'utf-8');

    // Replace AGREE with the uppercase argument
    const modifiedContent = exampleContent.replace(/AGREE/g, upperCaseArg);

    // Write to .env_user
    writeFileSync(targetFilePath, modifiedContent, 'utf-8');

    // FIXME(FG-384): Fix this warning:
    // eslint-disable-next-line no-console
    console.log(`✓ Created .env_user with LOCAL_USER=${upperCaseArg}`);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error setting up .env_user: ${error.message}`);
    }
    process.exit(1);
  }
};

main();
