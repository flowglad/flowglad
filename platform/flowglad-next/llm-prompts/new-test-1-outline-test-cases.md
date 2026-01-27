# Planning Test Cases
This is a guide designed to help you complete the first step in writing a comprehensive test suite: planning the tests.

Here are some brief instructions on how to do this step:

## 1. Examine the Code

Consider every condition implied by the code. If the code uses functions that are found elsewhere -- either in the file or in other files -- go check those files out. And do so recursively if necessary. Your initial goal is to fully understand what this code does.

Don't just rely on the code but also take hints from the comments.

## 2. Enumerate all of the scenarios where its behavior will differ

Oftentimes it is easier to think about the code in terms of different conditions - different sets of arguments for example, that each function might receive - and how that would change the function's behavior.

Once you have a good sense of all of the possible scenarios for a given passage of code, list them out. These will make for great test conditions.

## 3. Write out your plan

In a markdown format, come up with a list of test cases. These test cases should include what will be required to set up the state necessary for the test case, as well as the expectations that we should assert at the end of each test.

Ideally, your test cases are separated by scenario. The gameplan is that each of these scenarios will be later tested in a bun:test suite like so:
```ts
describe("thefunction", ()=> { it("should [do X] when [condition Y]", () => {...})})
```

Do these steps for each function in the file that we want to test. If one function in the file consumes another function, you should write out test cases for both functions.

Remember - don't write the actual code for the test. This step is all about coming up with a gameplan. Give it some thought, and once you feel like you have a good gameplan, write out the list of cases.

## Notes
There will be a strong temptation to test functionality in the database layer. For now, you should not see that as your job. Instead, you should just test functionality assuming the database is an always-working data store. 

So things like "will roll back in the case that the transaction fails" - those do nothing for us. Do not include them.

In the case where we planning on tests in a file for db/tableMethods or db/schema - there, it can make sense to write tests that assert certain database functionality - such as uniqueness constraints, foreign key constraints, and RLS policies.

But outside of the src/db directory - there's really no reason to test things that happen at the database layer. Instead you should see that layer as an opaque implementation detail.
