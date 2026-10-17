RULESYNC ?= rulesync

.PHONY: install-agents-configs install-agents-global-configs

# install fetches declarative sources (pinned in rulesync.lock), then generate
# Project-level agent configs from ./.rulesync (./rulesync.jsonc)
install-agents-configs:
	$(RULESYNC) install && $(RULESYNC) generate

# Global agent configs from .rulesync-global (global: true → writes to $$HOME)
install-agents-global-configs:
	cd .rulesync-global && $(RULESYNC) install && $(RULESYNC) generate
