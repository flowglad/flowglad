# Zsh completions for fbr (flowglad bun run)
#
# This file is automatically sourced by direnv when entering the directory.
# It can also be manually sourced: source fbr.zsh

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

compdef _fbr fbr 2>/dev/null
