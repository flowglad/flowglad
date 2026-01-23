# fbr - Flowglad Bun Run
# A wrapper for 'bun run' with environment selection
#
# Usage: fbr <script> [environment]
#   script      - Any script from package.json
#   environment - Optional: test, development, production (default: development)
#
# Examples:
#   fbr dev                    # NODE_ENV=development bun run dev
#   fbr migrations:push test   # NODE_ENV=test bun run migrations:push
#   fbr build production       # NODE_ENV=production bun run build
#
# Installation: Add to your .zshrc:
#   source /path/to/flowglad/platform/flowglad-next/fbr.zsh

fbr() {
  if [[ -z "$1" ]]; then
    echo "Usage: fbr <script> [environment]"
    echo "  environment: test, development, production (default: development)"
    return 1
  fi

  local script="$1"
  local env="${2:-development}"

  # Validate environment
  if [[ "$env" != "test" && "$env" != "development" && "$env" != "production" ]]; then
    echo "Invalid environment: $env"
    echo "Valid options: test, development, production"
    return 1
  fi

  echo "Running: NODE_ENV=$env bun run $script"
  NODE_ENV="$env" bun run "$script"
}

# Zsh completion for fbr
_fbr() {
  local state

  _arguments -C \
    '1:script:->script' \
    '2:environment:->env'

  case $state in
    script)
      # Get scripts from bun's built-in completion
      local -a scripts_list
      IFS=$'\n' scripts_list=($(SHELL=zsh bun getcompletes s 2>/dev/null))
      _describe 'script' scripts_list
      ;;
    env)
      local -a envs=(
        'test:Use .env.test (test database)'
        'development:Use .env.development (Vercel dev)'
        'production:Use .env.production (Vercel prod)'
      )
      _describe 'environment' envs
      ;;
  esac
}

compdef _fbr fbr
