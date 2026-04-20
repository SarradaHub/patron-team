# Arjen Queue IndexedDB ⚽

> Web app offline-first para gerenciar filas de jogadores e formar times usando IndexedDB.

## Visão Geral

O **Arjen Queue** é uma aplicação React que funciona completamente offline, usando IndexedDB como banco de dados local. Ideal para organizar peladas e jogos recreativos, a app gerencia uma fila FIFO (primeiro a chegar, primeiro a jogar) de jogadores, forma times automaticamente, trata lesões/substituições e registra resultados de partidas.

### Principais funcionalidades

- 📅 **Rodadas** — Várias rodadas locais; troca de rodada ativa e “Nova rodada”; times e partidas ficam escopados por `roundId`
- 📋 **Fila FIFO** — Jogadores entram na fila por ordem de chegada
- 👥 **Formação de times** — Um time por vez ou **vários times de uma vez** (N × jogadores por time)
- ⚖️ **Rebalancear** — Redistribui elencos entre times em campo não bloqueados (round-robin)
- 💡 **Próxima partida (MVP)** — Sugestão com dois primeiros times em campo; opção de **agendar** partida, editar **stats por partida**, depois **finalizar**
- 🔄 **Substituição inteligente** — Substitui jogadores lesionados/cansados atomicamente
- 🏆 **Registro de partidas** — Vitória, derrota ou empate com regras automáticas na rodada
- 📊 **Estatísticas** — Aba **globais** (`players.goals` / `assists`) e aba **da rodada** (somente `player_stats` das partidas finalizadas; alinhado conceitualmente ao SLF)
- 🔒 **Times bloqueados** — Excluídos do rebalanceamento MVP e da sugestão simples
- 💾 **Export/Import** — Backup JSON `schemaVersion: 3` (`rounds`, `meta`, `player_stats`)
- 📡 **Sincronização entre abas** — Via BroadcastChannel
- 📱 **PWA Offline** — Funciona sem internet após primeiro carregamento
- 🚀 **Deploy no GitHub Pages** — Workflow automático via GitHub Actions
- 🌙 **Modo escuro** — Tema claro/escuro persistido (`localStorage`) e detecção pelo sistema
- ⏱️ **Cronômetro da partida** — No painel **Controles**; atalhos iniciam na hora; várias agendadas: escolher qual

## Instalação

```bash
# Clone o repositório
git clone <url-do-repo>
cd team-queue-indexeddb

# Instale as dependências
npm install
```

## Comandos

```bash
# Desenvolvimento local com hot-reload
npm run dev

# Build de produção (gera pasta dist/)
npm run build

# Preview do build de produção
npm run preview

# Rodar testes unitários
npm run test

# Rodar testes em modo watch
npm run test:watch
```

## Uso

### 1. Adicionar jogadores
No painel **Controles**, digite o nome do jogador e clique em **➕ Adicionar**. Os jogadores aparecem na fila ordenados por chegada.

### 2. Rodada ativa
No painel **Rodada**, escolha a rodada ou crie uma nova. Todos os times e partidas exibidos pertencem à rodada ativa.

### 3. Formar times
Use **Formar todos os times possíveis** (FIFO, um clique esvazia a fila até não dar time completo) ou **Formar vários times** com quantidade de times e jogadores por time. **Rebalancear** redistribui só entre times em campo não bloqueados.

### 4. Registrar partidas
Com pelo menos 2 times em campo, use os botões para registrar o resultado:
- **🏆 Time A Venceu** — Time B volta para o fim da fila
- **🏆 Time B Venceu** — Time A volta para o fim da fila
- **🤝 Empate** — Ambos os times saem e voltam ao fim da fila

### 5. Partida agendada, cronômetro e stats
**Sugerir confronto** e **Agendar partida sugerida** criam uma partida agendada. No histórico, abra **Stats** para gols/assistências/gols contra/goleiro por jogador (validações tipo SLF); no mesmo modal, em **Resultado**, escolha quem venceu ou **Empate** (salva stats e finaliza — empate pode abrir desempate).

**Cronômetro:** no painel **Controles** (lateral), após agendar uma partida, use **5 / 10 / 15 min e iniciar** para começar na hora, ou edite os minutos (**Salvar duração** ou blur no campo) e **Iniciar**. **Zerar** interrompe sem mudar a duração salva. Várias partidas agendadas: escolha qual no menu **Partida agendada**. O tempo também aparece na faixa abaixo de **Rodada** quando houver countdown ativo.

### Tema (modo escuro)
Use o botão **lua / sol** no canto superior esquerdo do cabeçalho (ou no canto da tela de login). A escolha fica em `localStorage`; na primeira visita, usa a preferência do sistema (`prefers-color-scheme`).

### 6. Lesões e substituições
Para jogadores em campo:
- **🤕 Lesão** — Marca como lesionado e remove do time
- **😓 Cansado** — Marca como cansado
- **🔄 Substituir** — Substitui pelo próximo jogador disponível na fila

### 7. Estatísticas de jogadores (⚽ Gols & 👟 Assistências)
Clique na aba **📊 Estatísticas** no topo da aplicação para acessar o módulo de estatísticas. Neste painel você pode:
- Ver todos os jogadores com seus gols, assistências e total de participações
- Usar os botões **+** e **-** ao lado de cada jogador para registrar/corrigir gols e assistências
- Filtrar jogadores pelo nome usando o campo de busca
- Ordenar por nome, gols, assistências ou total clicando nos cabeçalhos das colunas
- Acompanhar o resumo geral (total de jogadores, gols, assistências e participações) no topo

### 8. Estatísticas da rodada
A terceira aba agrega vitórias/empates/derrotas e números por partida a partir de `player_stats` (não usa os totais globais da segunda aba).

### 9. Backup e restore
- **📤 Exportar** — Baixa um arquivo JSON com todos os dados (incluindo gols e assistências)
- **📥 Importar** — Carrega um arquivo JSON substituindo todos os dados

## Dataset de Exemplo

Para testes rápidos, importe o seguinte JSON (salve como `exemplo.json`):

```json
{
  "players": [
    { "id": "a1b2c3d4-0001-4000-8000-000000000001", "name": "Carlos", "status": "available", "joinedAt": "2026-01-01T10:00:00.000Z", "goals": 3, "assists": 1 },
    { "id": "a1b2c3d4-0002-4000-8000-000000000002", "name": "Ana", "status": "available", "joinedAt": "2026-01-01T10:01:00.000Z", "goals": 5, "assists": 2 },
    { "id": "a1b2c3d4-0003-4000-8000-000000000003", "name": "Bruno", "status": "available", "joinedAt": "2026-01-01T10:02:00.000Z", "goals": 0, "assists": 4 },
    { "id": "a1b2c3d4-0004-4000-8000-000000000004", "name": "Diana", "status": "available", "joinedAt": "2026-01-01T10:03:00.000Z", "goals": 2, "assists": 0 },
    { "id": "a1b2c3d4-0005-4000-8000-000000000005", "name": "Eduardo", "status": "available", "joinedAt": "2026-01-01T10:04:00.000Z", "goals": 1, "assists": 3 },
    { "id": "a1b2c3d4-0006-4000-8000-000000000006", "name": "Fernanda", "status": "available", "joinedAt": "2026-01-01T10:05:00.000Z", "goals": 0, "assists": 0 },
    { "id": "a1b2c3d4-0007-4000-8000-000000000007", "name": "Gabriel", "status": "available", "joinedAt": "2026-01-01T10:06:00.000Z", "goals": 4, "assists": 1 },
    { "id": "a1b2c3d4-0008-4000-8000-000000000008", "name": "Helena", "status": "available", "joinedAt": "2026-01-01T10:07:00.000Z", "goals": 0, "assists": 0 },
    { "id": "a1b2c3d4-0009-4000-8000-000000000009", "name": "Igor", "status": "available", "joinedAt": "2026-01-01T10:08:00.000Z", "goals": 2, "assists": 2 },
    { "id": "a1b2c3d4-0010-4000-8000-000000000010", "name": "Juliana", "status": "available", "joinedAt": "2026-01-01T10:09:00.000Z", "goals": 1, "assists": 1 }
  ],
  "teams": [],
  "matches": []
}
```

## Deploy

### GitHub Pages (Automático via GitHub Actions) 🚀

O projeto inclui um workflow completo em `.github/workflows/deploy-gh-pages.yml` para deploy automático.

**Passo a passo:**

1. **Crie um repositório no GitHub** com o nome desejado (ex.: `team-queue-indexeddb`)

2. **Ajuste o `base` path** — No arquivo `.github/workflows/deploy-gh-pages.yml`, altere o valor de `VITE_BASE_PATH` para o nome do seu repositório:
   ```yaml
   VITE_BASE_PATH: /nome-do-seu-repo/
   ```

3. **Faça push para o branch `main`:**
   ```bash
   git init
   git add .
   git commit -m "first commit"
   git branch -M main
   git remote add origin https://github.com/<seu-usuario>/<seu-repo>.git
   git push -u origin main
   ```

4. **Configure o GitHub Pages:**
   - Vá em **Settings → Pages**
   - Em **Source**, selecione **GitHub Actions**

5. O workflow será executado automaticamente a cada push no `main`. O site ficará disponível em:
   ```
   https://<seu-usuario>.github.io/<seu-repo>/
   ```

### GitHub Pages (Manual via gh-pages)

```bash
# Ajuste o base path para seu repositório
VITE_BASE_PATH=/nome-do-repo/ npm run build

# Deploy usando o pacote gh-pages
npm run deploy
```

### Vercel

```bash
# Instale a CLI da Vercel
npm i -g vercel
vercel
# Siga as instruções (framework: Vite, output: dist)
```

### Netlify

1. Faça build local: `npm run build`
2. Arraste a pasta `dist/` para o painel da Netlify
3. Ou conecte o repositório e configure:
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`

> ⚠️ **Importante**: Para PWA funcionar corretamente, o app deve estar em **HTTPS**. GitHub Pages, Vercel e Netlify já fornecem HTTPS por padrão.

## Testando PWA e Sincronização

### PWA Offline
1. Faça `npm run build` e depois `npm run preview`
2. Abra no navegador e adicione alguns jogadores
3. Desconecte da internet (ou use DevTools → Network → Offline)
4. Recarregue a página — os dados devem persistir

### Sincronização entre abas
1. Abra a app em duas abas do mesmo navegador
2. Adicione um jogador na primeira aba
3. A segunda aba deve atualizar automaticamente

### Export/Import
1. Adicione jogadores e forme times
2. Clique em **📤 Exportar** e salve o arquivo
3. Limpe os dados (ou abra em outro navegador)
4. Clique em **📥 Importar** e selecione o arquivo salvo

## Limitações

- IndexedDB tem limite de armazenamento variável por navegador (~50MB-unlimited)
- BroadcastChannel não funciona entre navegadores diferentes, apenas entre abas do mesmo
- PWA requer HTTPS em produção (localhost funciona para desenvolvimento)
- Não há sincronização remota (cloud) — dados ficam apenas no navegador local

## Próximos Passos

- [ ] Sincronização em nuvem (Firebase/Supabase)
- [ ] Notificações push quando é hora de jogar
- [x] ~~Estatísticas de gols e assistências por jogador~~
- [x] ~~Modo escuro~~ (`data-theme`, `src/theme.js`, `src/components/ThemeToggle.jsx`)
- [x] ~~Timer de partida integrado~~ (countdown persistido: `timerDurationMinutes`, `countdownEndsAt` em `indexeddb.js`)
- [x] ~~Reordenação manual da fila de jogadores disponíveis~~ (persistida via `reorderLinePlayersInQueueOrder` na API IndexedDB; sem UI dedicada)
- [x] ~~Estatísticas de vitórias/derrotas por jogador~~ (aba da rodada + globais com V/E/D)
- [x] ~~Garbage collector mantendo lista e stats~~ (manutenção em Controles)
- [x] ~~Botões + e - nos gols e assistências~~ (rótulos nos botões; modal de stats e aba global)
- [x] ~~Lista separada de goleiro~~
- [x] ~~Fila de times em espera: FIFO + desempate por data (`enteredWaitingAt` / `createdAt`)~~ — ver `src/domain/waitingQueueOrder.js`
- [ ] Ordenação da fila de times **só** por data — toggle ou vista alternativa na UI (opcional)

## Tecnologias

- **React 18** + **Vite** — Framework e bundler
- **IndexedDB** — Banco de dados local (sem dependências externas)
- **BroadcastChannel API** — Sincronização entre abas
- **Service Worker** — Cache offline (PWA)
- **Vitest** — Testes unitários
- **react-hot-toast** — Notificações toast

## Licença

MIT

# arjen-pro
