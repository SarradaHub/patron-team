import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { appSelectors } from '../support/selectors.js';

Given('I open Arjen application', async function () {
  await this.page.goto(this.baseUrl);
});

Then('authentication should be resolved for current environment', async function () {
  const loginVisible = await this.page.locator(appSelectors.login.username).isVisible();
  if (loginVisible) {
    await expect(this.page.locator(appSelectors.login.submit)).toBeVisible();
  } else {
    await expect(this.page.getByTestId('tab-queue')).toBeVisible();
  }
});

Given('I am authenticated in app', async function () {
  await this.page.goto(this.baseUrl);
  const loginVisible = await this.page.locator(appSelectors.login.username).isVisible();
  if (loginVisible) {
    const user = process.env.BDD_AUTH_USER || 'admin';
    const pass = process.env.BDD_AUTH_PASS || '';
    await this.page.fill(appSelectors.login.username, user);
    await this.page.fill(appSelectors.login.password, pass);
    await this.page.click(appSelectors.login.submit);
  }
  await expect(this.page.getByTestId('tab-queue')).toBeVisible();
});

When('I add player {string}', async function (playerName) {
  await this.page.fill(appSelectors.controls.addPlayerInput, playerName);
  await this.page.click(appSelectors.controls.addPlayerButton);
});

Given('I add these players:', async function (dataTable) {
  for (const row of dataTable.hashes()) {
    await this.page.fill(appSelectors.controls.addPlayerInput, row.name);
    await this.page.click(appSelectors.controls.addPlayerButton);
  }
});

Then('queue should list players in order {string}', async function (playerListCsv) {
  const expectedNames = playerListCsv.split(',').map((name) => name.trim());
  const playerNames = this.page.locator('[data-testid="queue-panel"] .player-name');
  await expect(playerNames).toHaveCount(expectedNames.length);
  const got = await playerNames.allTextContents();
  expect(got).toEqual(expectedNames);
});

When('I set team size to {int}', async function (teamSize) {
  await this.page.fill(appSelectors.controls.teamSizeInput, String(teamSize));
});

When('I click form one team', async function () {
  await this.page.click(appSelectors.controls.formTeamButton);
});

Then('teams in field panel should show {int} team', async function (count) {
  const heading = this.page.locator('[data-testid="teams-in-field-panel"] h2');
  await expect(heading).toContainText(`(${count})`);
});

When('I click suggest match', async function () {
  await this.page.click(appSelectors.controls.suggestMatchButton);
});

When('I click schedule suggested match', async function () {
  await this.page.click(appSelectors.controls.scheduleSuggestedButton);
});

Then('matches panel should include a scheduled badge', async function () {
  await expect(this.page.locator('[data-testid="matches-panel"] .badge-scheduled').first()).toBeVisible();
});

When('I open global stats tab', async function () {
  await this.page.click(appSelectors.tabs.global);
});

Then('I should see player stats table', async function () {
  await expect(this.page.getByRole('heading', { name: '📊 Estatísticas de Jogadores' })).toBeVisible();
});

When('I open round stats tab', async function () {
  await this.page.click(appSelectors.tabs.round);
});

Then('I should see round statistics panel', async function () {
  await expect(
    this.page
      .locator('.app-main-stats')
      .getByText(
        /Estatísticas da rodada|Nenhum jogador nos times desta rodada ainda\. Forme times ou importe dados\./
      )
      .first()
  ).toBeVisible();
});
