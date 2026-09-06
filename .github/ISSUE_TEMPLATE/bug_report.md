name: Bug report
description: Something is broken or behaves unexpectedly
labels: [bug]
body:
  - type: textarea
    id: what-happened
    attributes:
      label: What happened?
      description: A clear description of the bug. Include what you expected instead.
      placeholder: |
        Player paused itself after node reconnect...
        Expected: playback continues.
    validations:
      required: true

  - type: textarea
    id: reproduction
    attributes:
      label: Minimal reproduction
      description: Code we can paste into a file and run. The shorter, the faster the fix.
      placeholder: |
        const junie = new Junie({ ... });
        ...
    validations:
      required: true

  - type: input
    id: versions
    attributes:
      label: Versions
      description: junie version, Node version, Lavalink version (node.lavalinkVersion), Discord library + version
      placeholder: junie 1.1.0, Node 22.x, Lavalink 4.2.2, discord.js 14.16
    validations:
      required: true

  - type: textarea
    id: logs
    attributes:
      label: Relevant logs
      description: Junie logger output (logLevel: 'debug' or 'trace' helps a lot), error stacks, Lavalink side if available.
      render: shell

  - type: checkboxes
    id: checks
    attributes:
      label: Preflight
      options:
        - label: I searched the existing issues and the troubleshooting docs first.
          required: true
        - label: This reproduces with the latest junie version.
          required: true
