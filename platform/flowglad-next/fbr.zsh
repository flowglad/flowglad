# Zsh completions for fbr (flowglad bun run)
#
# Add to your ~/.zshrc for tab completions:
#   source /path/to/flowglad/platform/flowglad-next/fbr.zsh
#
# The fbr command itself is added to PATH by direnv when in the directory.

_fbr() {
  local state

  _arguments -C \
    '1:script:->script' \
    '2:environment:->env'

  case $state in
    script)
      # Get scripts from bun's built-in completion
      # Escape colons so they're not treated as value:description separators
      local -a scripts_list
      local script
      while IFS= read -r script; do
        scripts_list+=("${script//:/\\:}")
      done < <(SHELL=zsh bun getcompletes s 2>/dev/null)
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
