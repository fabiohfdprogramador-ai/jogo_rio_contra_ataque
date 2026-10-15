# Rio em Conquista

Jogo de estratégia em tempo real (RTS) ambientado em uma versão **fictícia** do Rio de Janeiro.
Escolha entre **Polícia**, **Milícia** ou **Bandido**, construa sua base, administre recursos,
produza unidades e dispute os bairros da cidade contra a inteligência artificial.

> Nome, territórios e organizações são fictícios. O cenário se inspira apenas na arquitetura e na
> geografia urbanas do Rio (malha de ruas, morros, orla com calçadão, canal com pontes). As mecânicas
> se inspiram no gênero RTS em geral, sem reproduzir elementos de outros jogos.

## Estado atual: versão 0.1 (MVP jogável)

Uma partida completa funciona do início ao fim: menu → escolha de equipe → partida → vitória ou
derrota → jogar novamente. Veja abaixo o que já funciona e o que ainda falta.

## Tecnologias

| Item | Escolha | Por quê |
| --- | --- | --- |
| Linguagem | TypeScript (strict) | Tipos claros para regras complexas |
| Build/servidor | Vite | Inicia em menos de 1 s, com recarga automática |
| Renderização | Three.js (3D com câmera inclinada) | Leve, sem motor pesado, bom para 2.5D/3D |
| Interface | DOM + CSS puro | Poucas telas; React traria uma camada sem ganho real |
| Testes | Vitest | Roda as regras do jogo direto no Node, sem navegador |

Não há dependências de rede para o jogo funcionar. Todos os gráficos são gerados por código. A única
coisa externa são as fontes do Google Fonts, com fonte local como alternativa.

## Requisitos

- Node.js 18 ou superior (testado com Node 22)
- Navegador moderno com WebGL (Chrome, Edge, Firefox)

## Instalação e execução

```bash
npm install
```

```bash
npm run dev
```

Abra `http://localhost:5173`.

Outros comandos:

```bash
npm test
```

```bash
npm run build
```

- `npm test`: roda os 49 testes automatizados.
- `npm run build`: verifica os tipos e gera a versão de produção em `dist/`.
- `npm run typecheck`: só a verificação de tipos.
- `npx vitest run --config scripts/vitest.sim.config.ts`: roda partidas IA × IA entre todas as
  equipes e imprime um relatório de balanceamento.

### Modo de teste (atalho)

`http://localhost:5173/?quick` inicia direto uma partida pequena contra uma IA, sem passar pelos
menus. Para escolher a equipe: `?quick=policia`, `?quick=milicia` ou `?quick=bandido`. No menu
principal existe o botão **Partida rápida (modo de teste)**.

## Controles

| Ação | Controle |
| --- | --- |
| Mover câmera | WASD / setas / cursor nas bordas da tela |
| Girar câmera | Q / E ou arrastar com o botão do meio |
| Zoom | Roda do mouse |
| Centralizar na base | Espaço ou H (ou botão **Base**) |
| Selecionar | Clique; arrastar para selecionar em área; Shift adiciona; duplo clique seleciona o mesmo tipo |
| Mover / atacar | Botão direito no chão / no inimigo |
| Seguir / reparar | Botão direito em unidade aliada / em construção aliada (engenheiros) |
| Ponto de reunião | Com uma construção de produção selecionada, botão direito no chão |
| Ataque em movimento | F + clique |
| Defender posição | G |
| Parar | X |
| Patrulhar | P + clique |
| Recuar para a base | V |
| Reparar | R + clique na construção |
| Menu de construção | B (Shift ao posicionar mantém o modo para construir várias) |
| Demolir construção selecionada | Delete |
| Grupos de controle | Ctrl+1..9 define; 1..9 seleciona (duas vezes centraliza) |
| Menu/pausa | Esc ou F10 |
| Info do território | Clique no terreno |
| Minimapa | Clique ou arraste para mover a câmera; botão direito envia as unidades |

## O que já funciona

**Partida e menus**
- Tela inicial com partida de demonstração entre 3 IAs ao fundo.
- Telas de Jogar, Continuar, Partida rápida, Carregar, Configurações e Créditos.
- Configuração da partida: modo **Um jogador** (1 ou 2 IAs) ou **Três equipes**, equipe, adversários,
  dificuldade, tamanho do mapa (9 ou 16 setores), recursos iniciais, posição inicial, limite de tempo,
  vitória por domínio e névoa de guerra.
- Pausa, salvar (3 espaços), carregar, reiniciar, sair (com salvamento automático), velocidade 1×–2×.
- Tela de resultado com estatísticas: territórios, conquistas, unidades, perdas, abates, construções,
  melhorias, recursos gastos e pontuação.

**Mapa e cidade**
- Mapa urbano procedural determinístico (mesma semente gera o mesmo mapa): malha de ruas, canal com
  pontes, praia com calçadão e coqueiros, parques e bairros com estilos próprios (torres comerciais,
  galpões industriais, casario colorido nos morros).
- 9 ou 16 setores com nomes fictícios e tipos diferentes: residencial, comercial, industrial,
  portuário, energia e posição elevada. Cada tipo gera renda própria; a posição elevada revela o setor.

**Economia**
- Dinheiro, materiais, combustível, energia (geração e consumo) e população.
- Renda contínua por territórios e construções, exibida por minuto na barra superior.
- Falta de energia reduz produção, pesquisa e defesas a 50%.

**Construção e demolição**
- Menu com custo, tempo, requisitos e motivo de indisponibilidade.
- Indicador de posicionamento tile a tile (verde/vermelho), com regras de território, colisão,
  espaçamento, acesso a vias e requisitos tecnológicos.
- Obras em etapas (andaime e crescimento); engenheiros aceleram a obra.
- Demolição com confirmação para estruturas importantes: cancelar uma obra devolve 100% do custo,
  demolir uma construção pronta devolve 25%.
- Construções destruídas viram **ruínas**, que podem ser reconstruídas por quem dominar o território
  (60% do custo e do tempo) ou limpas.

**Unidades e combate**
- Seleção individual, por área, por tipo e por grupos de controle.
- Pathfinding A* em grade com 8 direções, suavização de rota, formação em grupo, separação entre
  unidades e recálculo quando o caminho é bloqueado.
- Ordens: mover, ataque em movimento, atacar, parar, defender posição, patrulhar, seguir, reparar e
  recuar.
- Combate em tempo real com alcance, cadência, blindagem, perseguição, retaliação e defesas fixas.
- Efeitos: disparos, impactos, explosões e fumaça em construções danificadas.
- Cura (unidades de suporte), manutenção de veículos e regeneração perto de postos da Milícia.

**Três equipes com regras próprias** (valores em `src/config/`)

| | Polícia | Milícia | Bandido |
| --- | --- | --- | --- |
| Estilo | Reconhecimento e defesa | Fortificação e território | Mobilidade e bases leves |
| Vantagens | +25% de visão; −20% de dano recebido no próprio território; radar revela inimigos nos seus setores; blindado | Estruturas +20% de vida; +20% de renda em setores conectados ao QG; postos rápidos que regeneram unidades; unidade de manutenção | Unidades rápidas e baratas; captura 20% mais rápida; postos avançados baratos que treinam unidades e contam como base; pode reconstruir a base |
| Desvantagens | Construções caras e lentas | Setores isolados rendem só 50% | Estruturas −20% de vida; −10% de dano fora do território; sem blindado |

Cada equipe tem 7 a 8 construções, 7 a 8 unidades e 4 a 5 melhorias com efeito real.

**Territórios**
- Conquista por presença de unidades de combate no ponto de controle (engenheiros e suporte não
  capturam). Com duas equipes presentes, o setor fica em disputa.
- Setor inimigo precisa ser neutralizado antes de ser capturado; a conquista é reversível.
- O setor do QG não pode ser capturado enquanto o QG existir.
- Bandeiras, anéis de progresso, cores no mapa e no minimapa e notificações.

**Visão**: névoa de guerra com 3 estados (desconhecido, explorado e visível), configurável.
O minimapa respeita a visão.

**IA**: decisões estratégicas em intervalos, separadas do comportamento das unidades. Ela constrói
seguindo uma ordem de prioridades (energia e população têm urgência), reserva dinheiro para obras,
mantém engenheiros, produz composições variadas, pesquisa, explora com batedor, expande para setores
vizinhos, disputa setores inimigos pouco defendidos, defende a base (chamando o exército de volta se
preciso), ataca com vantagem estimada, recua quando desgastada, reconstrói ruínas e contra-ataca
quando alguém está perto da vitória por domínio. As dificuldades **Fácil, Normal e Difícil** mudam
frequência de decisão, tamanho e momento dos ataques, recuo, foco de fogo, reforços, pesquisas e um
modificador de renda explícito (0,8 / 1,0 / 1,1).

**Vitória e derrota**: eliminar as bases adversárias, domínio de X% dos setores por 90 s ou maior
pontuação ao fim do tempo. A derrota do jogador encerra a partida.

**Salvamento**: JSON no armazenamento local do navegador, com validação e mensagem de erro para
arquivos inválidos. Há salvamento automático a cada 60 s e ao sair para o menu.

## Testes automatizados

```bash
npm test
```

São 49 testes, todos passando, cobrindo:
- **Economia**: gastos e devoluções, renda contínua, custo de construção, cancelar e demolir,
  falta de energia.
- **Posicionamento**: território, colisão, espaçamento, ruas, requisitos e posse.
- **Produção**: tempo, custo, ponto de reunião, cancelamento, limite de população, melhorias
  exigidas e efeito de pesquisas.
- **Combate**: blindagem, regras das equipes, dano e abates, perseguição, reação automática, ruínas.
- **Territórios**: captura, disputa, reversão, engenheiros não capturam, QG protegido.
- **Vitória**: eliminação, derrota do humano, posto do Bandido como base, domínio, limite de tempo.
- **Salvamento**: o estado restaurado é idêntico, a partida continua igual após carregar, e arquivos
  inválidos são rejeitados.
- **Mapa e navegação**: mapa determinístico, todos os setores alcançáveis, pontes, movimento em grupo.
- **IA**: as três equipes constroem, produzem e expandem; a dificuldade muda a economia; uma partida
  IA × IA termina com vencedor; a simulação é determinística.

## Limitações conhecidas (honestamente)

- **O multiplayer online não está implementado.** A simulação já foi pensada para ele (veja
  `docs/ARQUITETURA.md`), mas não existem servidor, salas nem sincronização em rede. Os modos "Um
  contra um online" aparecem desativados no menu.
- O helicóptero de observação e o veículo de transporte (com embarque de unidades) ainda não existem.
- Os gráficos são provisórios, feitos com geometria simples gerada por código; não há modelos glTF,
  texturas finais nem animação de personagens.
- Os edifícios decorativos da cidade não podem ser destruídos; só as estruturas dos jogadores.
- Construções inimigas já exploradas aparecem com o estado atual, não com o "último estado visto".
- O áudio é básico, sintetizado: alertas e confirmações, sem música nem sons de disparo.
- O determinismo foi verificado no mesmo motor JavaScript. Entre navegadores ou máquinas diferentes,
  pode exigir aritmética de ponto fixo antes do multiplayer.
- O balanceamento foi ajustado com partidas IA × IA (cerca de 40 partidas por rodada). Ainda falta
  teste com jogadores humanos.
- Desempenho medido com cerca de 50 unidades: aproximadamente 1 ms de CPU por quadro de renderização
  e 0,2 ms por tick de simulação. Não foi medido com centenas de unidades.
- Mapas de 9 ou 16 setores; ainda não existe editor nem mapas maiores.

## Próximos passos sugeridos

1. Multiplayer 1×1: servidor Node com WebSocket, lockstep de comandos, salas e reconexão.
2. Mais conteúdo: helicóptero, transporte, eventos dinâmicos na cidade e mapas maiores.
3. Assets definitivos (glTF) usando as funções de `src/render/models.ts` como ponto de troca.
4. Música e efeitos sonoros licenciados.
5. Rodadas de balanceamento com jogadores humanos.

## Estrutura

```
src/
  config/      Balanceamento centralizado: unidades, construções, melhorias, equipes, setores, IA, regras
  game/        Simulação (sem renderização): mundo, comandos, regras
    map/         Geração do mapa, grade de navegação
    pathfinding/ A*
    units/       Ordens, comportamento, grade espacial
    buildings/   Posicionamento, obras, produção, pesquisas, defesas
    combat/      Dano
    economy/     Renda
    territories/ Captura de setores e visão
    ai/          IA (contexto, economia, militar)
    save.ts      Salvamento/carregamento
    victory.ts   Eliminação e condições de vitória
    simulation.ts  Ciclo de simulação em passo fixo
  render/      Three.js: cidade, modelos, efeitos, câmera, névoa
  ui/          HUD, menus, entrada, minimapa, áudio, configurações
  core/        Sessão de partida (liga simulação, renderização e interface)
tests/         Testes automatizados (Vitest)
scripts/       Simulações IA × IA para balanceamento
docs/          Documentação de arquitetura
```

Para trocar o nome do jogo, altere `GAME_TITLE` em `src/config/game.ts`.
