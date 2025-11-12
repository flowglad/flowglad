# @flowglad packages
This directory contains the SDKs for Flowglad

## Local Development

1. From the project root (the directory above this), run the script that runs yalc publish and yalc link across all of the packages:
```bash
bun yalc:publish
```
2. Start the dev process, which will hot reload a package in `packages` whenever any of its files changes:
```bash
bun build:declarations && bun build && bun dev # in project root
```
3. In `playground/supabase-auth`, link the packages in yalc and then install dependencies:
```bash
bun link:packages # in playground/supabase-auth
```
4. Start the `flowglad-next` project at `http://localhost:3000`:
```bash
bun dev # in platform/flowglad-next
```
5. Run `playground/supabase-auth`:
```bash
bun dev # in playground/supabase-auth
```