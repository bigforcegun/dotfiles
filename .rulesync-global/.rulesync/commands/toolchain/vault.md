---
targets:
  - '*'
description: Vault secrets via the toolchain proxy
---
Scope `/toolchain` to Vault: `retrieve_tools` with `query: "vault secret <English action from $ARGUMENTS>"`.

Always sensitivity `private`. Report the path and the key names; never print a secret value into the transcript unless I ask for that value by name.
