@e2e @smoke
Feature: Suggest and schedule next match
  # Source: docs/bddbooks-discovery.pdf - Next match planning behaviour mapping
  Scenario: Suggest and schedule match when two teams exist
    Given I open Arjen application
    And I am authenticated in app
    And I add these players:
      | name   |
      | Carlos |
      | Ana    |
      | Bruno  |
      | Diana  |
      | Edu    |
      | Fabi   |
      | Gabi   |
      | Hugo   |
      | Iago   |
      | Joao   |
    And I set team size to 5
    And I click form one team
    And I click form one team
    When I click schedule next match
    Then matches panel should include a scheduled badge
