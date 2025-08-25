All of the following changes will happen in the directory `./packages/flowglad-next/src/app/`, so when you see a path like `./src/app/example/page.tsx`, it should be translated to `./packages/flowglad-next/src/app/src/app/example/page.tsx`.


You're creating a Next.js 14 app directory React page. For example if the prompt is to create a new page for the route /example, you will:

1. Create a new file in the `./src/app/example/page.tsx` directory.
2. Inside that file, create a new React page component called `ExamplePage`:
   - Implement any functionality that the prompt tells you to implement. Try to use existing functions, or modules wherever possible

If any database calls need to be made, use the `authenticatedTransaction` function in `./src/db/authenticatedTransaction.ts` to make them. You can safely assume that the user is authenticated here.
