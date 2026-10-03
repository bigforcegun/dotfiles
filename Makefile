RULESYNC ?= rulesync

.PHONY: install-agents-configs install-agents-global-configs

# Project-level agent configs from ./.rulesync (./rulesync.jsonc)
install-agents-configs:
	$(RULESYNC) generate

# Global agent configs from .rulesync-global (global: true → writes to $$HOME)
install-agents-global-configs:
	cd .rulesync-global && $(RULESYNC) generate
