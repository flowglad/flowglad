/**
 * Docker image configuration for flowglad-mock-server
 *
 * This file is the source of truth for:
 * - src/scripts/docker-build-push.ts (local builds)
 * - .github/workflows/build-mock-server.yml (CI builds)
 *
 * If you change the image name here, update the GitHub workflow too.
 */

export const DOCKER_CONFIG = {
  registry: 'ghcr.io',
  imageName: 'flowglad/flowglad/mock-server',
  get fullImage() {
    return `${this.registry}/${this.imageName}`
  },
} as const
