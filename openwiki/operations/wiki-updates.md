# Updating this wiki

The checked-in wiki can be edited and reviewed with ordinary Git changes. The optional **OpenWiki Update** GitHub Actions workflow is manual-only. Its former nightly trigger repeatedly failed because the provider credential was not configured.

Before manually requesting an automated update, the repository owner must configure the `ANTHROPIC_API_KEY` Actions secret and approve the provider usage cost. The workflow checks for that secret before checkout, installation or generation. It does not print the key. A missing secret produces a configuration error rather than pretending an update succeeded.

Once configured and authorized, run **Actions → OpenWiki Update → Run workflow**. The workflow retains the pinned OpenWiki tool version, Anthropic provider/model configuration and pull-request review path. Optional LangSmith connector/tracing secrets are only needed for those integrations. Review the generated changes before merging.

The September audit did not create credentials or run paid generation. Scheduled generation remains disabled; re-enabling it requires an explicit maintenance decision after a successful configured manual run.

Authored and reviewed by Basho Parks, copyright 2026
