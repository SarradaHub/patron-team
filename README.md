# Fila de Times ⚽

> Um navegador organiza a pelada: a fila, os times e o resultado ficam neste aparelho.

## 🌟 Destaques

- A fila é por ordem de chegada.
- **Formar todos os times possíveis** monta times completos até a fila não fechar mais um.
- Agende a partida e grave o resultado no card.
- **Bloquear time** tira um time em campo da próxima sugestão e do rebalanceamento.
- **Rebalancear** fica fechado em Times em campo e só mistura quando há dois times em campo desbloqueados.
- **Enviar para nuvem** pede Entrar. A conta nasce no painel do Supabase. **Sair** esquece só essa sessão.
- **Importar dados** pede confirmação e recusa um arquivo que não seja três listas.

## ℹ️ Visão geral

A Fila de Times serve para uma pelada, num celular ou notebook. Os jogadores esperam numa fila, o app forma os times e grava o resultado no IndexedDB daquele navegador. Sem internet, a noite continua.

Um botão pode enviar uma cópia (jogadores, times, partidas, rodadas e estatísticas) para a nuvem. A nuvem não substitui o aparelho: o restore local é um arquivo JSON. Sem sessão, **Enviar para nuvem** abre Entrar (e-mail e senha). Não há cadastro no app. Depois de entrar, o snapshot que estava esperando segue, e o navegador fica nessa sessão até **Sair**. Sair não apaga a pelada local.

O servidor grava o snapshot só se o e-mail estiver em `EXPORT_ALLOWED_EMAILS`, segredo da função `export-snapshot`, com e-mails separados por vírgula. Lista vazia ou ausente recusa todo mundo. Essa variável não entra no build do site.

### ✍️ Onde está no ar

O site publicado está em [paulogrell.github.io/patron-team](https://paulogrell.github.io/patron-team/).

## 🚀 Uso

1. Em **Controles**, digite o nome e clique em **Adicionar**.
2. Clique em **Formar todos os times possíveis**.
3. Clique em **Agendar próxima partida** e, no card, grave **Time A venceu**, **Time B venceu** ou **Empate**. O botão fica desligado enquanto já houver uma partida agendada.
4. No time em campo, **Bloquear time** e **Desbloquear time** alternam na hora.
5. Com pelo menos um time em campo, abra **Rebalancear**. O botão pede confirmação e fica desligado até haver dois times em campo desbloqueados.

Se a fila for curta demais para o próximo jogo, a partida termina e o aviso diz que a próxima partida não foi criada. O mesmo aviso aparece no empate quando o único time em espera tem menos jogadores do que **Jogadores por time**: esse time continua em espera e não é completado pela fila.

**Importar dados** pede confirmação. Um arquivo que não tenha as listas `players`, `teams` e `matches` é recusado e a noite local fica. **Limpar cache local** também pede confirmação. Se outra aba ainda estiver aberta, o aviso diz que a limpeza termina quando essas abas fecharem.

## ⬇️ Instalação

Abra o [site](https://paulogrell.github.io/patron-team/) num navegador atual. Fora do localhost, o cache offline precisa de HTTPS.

## 🛠️ Desenvolvimento

```bash
git clone git@github.com:SarradaHub/patron-team.git
cd patron-team
npm install
npm test
npm run dev
```

O workflow [`.github/workflows/deploy-gh-pages.yml`](.github/workflows/deploy-gh-pages.yml) publica `dist/` no GitHub Pages a cada push em `main`.

Variáveis de ambiente, quando a nuvem estiver configurada:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

`EXPORT_ALLOWED_EMAILS` fica só na Edge Function, no painel do Supabase. Não use o prefixo `VITE_` nem `NEXT_PUBLIC_`, e não a coloque no workflow de GitHub Pages.

Os nomes do cliente também estão em [`.env.example`](.env.example).

## 💭 Feedback

Achou um erro ou quer uma mudança? Abra um issue em [SarradaHub/patron-team](https://github.com/SarradaHub/patron-team/issues).

## Licença

MIT
