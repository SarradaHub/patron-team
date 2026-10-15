@e2e @smoke
Feature: Cloud export
  Scenario: Enviar para nuvem expects Entrar when signed out
    Given I open Arjen application
    When I click Enviar para nuvem
    Then the Entrar form should be visible
