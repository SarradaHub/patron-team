@e2e @smoke
Feature: FIFO queue
  # Source: docs/bddbooks-discovery.pdf - Queue ordering behaviour mapping
  Scenario: Add players and keep FIFO order in queue list
    Given I open Arjen application
    When I add player "Carlos"
    And I add player "Ana"
    Then queue should list players in order "Carlos, Ana"
