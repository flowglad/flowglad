We are planning to undertake a relatively complex change to this codebase. We need you to come up with a plan that helps us all align as a team on:
- what is the current state of this part of the codebase
- what work needs to be done
- what are the acceptance criteria
- what cases must we have test coverage for before we land the changes into main?
- how to break this work into patches?
- how can the patches be parallelized?
- what open questions do we have?
- what formal decisions have we made so far?

The goal is to produce a markdown file that the team can review and "approve", so that the engineer can go off and have the whole thing implemented using AI coding agents as quickly as possible.

Note that this should be easy to review, and not super voluminuous - the whole idea is that it's 5-10x easier to scrutinize a markdown describe planned code than reviewing the actual lines of code themselves!

Roughly, the shape should be:

- Problem Statement
  A concise (2-4 sentences) description of what problem we're solving and why.

- Solution Summary
  A concise (3-5 sentences) high-level description of how we're solving it.

- Current State Analysis
  What's the current state of the codebase relative to where we want it to be.

- Required Changes
    Be specific. Cite files with approximate line numbers, and name functions. When creating a new function or updating an existing one's signature, explicitly state the signature using a typescript codeblock, like so:
    ```ts
        const someFunction = (myArgs: { firstArg: Subscription.Record, secondArg: Date | number }): Promise<Subscription.Item | null>
    ```

- Acceptance Criteria
    Make this a bullet point list of what needs to be in place to consider the gameplan completed.

- Open Questions
    What questions should be decided as a team about what we're going to do?

- Explicit Opinions
    Explicitly state the technical design decisions you've arrived at (in conversation with the person you're building the gameplan for).
    That way those decisions themselves can be subject to review. When a decision has been arrived at, include the rationale for why. E.g:
    "Re-use existing `cancelSubscription` logic rather than create new one. That way we can keep one authoritative implementation of all of the side effects rather than have to maintain them in multiple places"
    "Explicitly assume we are not going to make any changes to billing state when updating pricing models. That's the least change to existing behavior (this gameplan only attempts to make the web app behavior available via CLI). And that's the least change to existing data / sidesteps the question of how to handle breaking schema changes on existing subscriptions."

- Patches
    Make this an ordered list of patches like: "Patch 1: .....".
    Each patch should include a specific list of files to modify / create / delete, and what specific changes to make.
    Each patch should also include test cases that we need to have. The list of test cases should be organized in a way that suggests quickly how we might do a vitest describe / it nested pattern to describe groups of cases. Each of the cases should ideally be grouped around a specific scenario, with assertions about what we expect from that scenario. So specific kinds of assertions should be grouped into the same "it" case if they are derived from the same antecedent state / scenario.
    Ideally provide stubbed out test code like so, that will make it really easy for the agent doing the work to implement the details of. Don't actually implement the tests yourself! Just help us think clearly to plan them:
    ```ts
    describe('adjustSubscription' async () => {
        it ('should fail if the subscription is in a terminal state' async () => {
            // setup: get a subscription into a terminal state
            // expectation: it should throw an error with message "..."
        })
        it('should fail for free plan subscriptions' async () => {
            // setup: create a free plan subscription
            // expectation: it should throw an error message with "..."
        })
        it('should execute successfully for an active, paid subscription', async () => {
            // setup: create non-free plan subscription
            // expect:
            // it creates billing run
            // billing run is executed
            // payment is created and successfully received
            // old subscription items are expired
            // new subscription items are created based on what was provided, and are non-expired
            // ...
        })
    })

    ```

- Dependency Graph
    Express patch dependencies in this exact format:
    ```
    - Patch 1 -> []
    - Patch 2 -> [1]
    - Patch 3 -> [1]
    - Patch 4 -> [2, 3]
    ```
    Where `[]` means no dependencies, and `[1, 2]` means depends on patches 1 and 2.

    This format enables automated tooling to fan out parallel patch execution.


# Notes
- Be explicit rather than wishy washy. It should be easy to pick up the markdown and execute its instructions patch-by-patch using a coding agent that has none of your context window, but just has access to the codebase
- If there are new functions or functions whose signatures will be modified, always include the proposed function signatures. This helps the team build explicit understanding of what we're going to do
- Don't make it overly verbose. The gameplan should be 10x easier for a human to review and provide pointed feedback about than the code that gets produced as a result