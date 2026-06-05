# Example Plugin

Reference layout for Lamprey plugins. Every plugin lives in its own
directory under `~/.lamprey-harness/plugins/<id>/` (or, while bundled,
under `resources/plugins/<id>/`).

```
example-plugin/
├── plugin.json         (required)
├── skills/             (optional)
│   └── hello-from-plugin.md
├── slash-commands/     (optional, flat .md files)
├── connectors.json     (optional, McpServerConfig[])
└── README.md           (this file)
```

Toggle this plugin from **Customize → Plugins**. When disabled, its
skills and connectors disappear from the rest of the app but the files
on disk are untouched — re-enable to restore.
