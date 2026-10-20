import { readFile } from 'node:fs/promises'

const [packageJson, manifest] = await Promise.all([
  readFile(new URL('../package.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../public/manifest.json', import.meta.url), 'utf8').then(JSON.parse),
])

if (manifest.version !== packageJson.version) {
  throw new Error(
    `Version mismatch: package.json is ${packageJson.version}, manifest.json is ${manifest.version}.`,
  )
}

const tag = process.env.GITHUB_REF_NAME
if (tag && tag !== `v${packageJson.version}`) {
  throw new Error(
    `Release tag ${tag} does not match project version v${packageJson.version}.`,
  )
}

console.log(`Project and manifest version: ${packageJson.version}`)
