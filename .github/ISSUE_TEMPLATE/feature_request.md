name: Feature request
description: Propose an enhancement or new capability
labels: [enhancement]
body:
  - type: textarea
    id: problem
    attributes:
      label: What are you trying to achieve?
      description: The use case, not the solution. What does your bot need that it cannot do today?
    validations:
      required: true

  - type: textarea
    id: solution
    attributes:
      label: How would you like it to work?
      description: Your proposed API or behaviour. Rough ideas are fine.

  - type: dropdown
    id: scope
    attributes:
      label: Scope
      options:
        - Core protocol (Lavalink API surface)
        - Player / queue behaviour
        - Node management & failover
        - Developer experience (types, events, docs)
        - Something else
    validations:
      required: true

  - type: checkboxes
    id: checks
    attributes:
      label: Preflight
      options:
        - label: I checked the roadmap/CHANGELOG for existing work on this.
          required: true
