# Arquitetura — Rio em Conquista

## Princípio central: simulação separada de apresentação

```
 Entrada (mouse/teclado)  ─┐
 IA                        ├──► Comandos ──► Simulação (passo fixo, 10 ticks/s) ──► Eventos
 (futuro) Rede             ─┘                     │                                   │
                                                  ▼                                   ▼
                                       Estado (dados JSON)          Renderização / HUD / Áudio
```

- **`src/game/`** contém só regras e dados. Não importa Three.js nem DOM e roda igual no navegador
  e no Node, onde ficam os testes e as partidas IA × IA.
- **Comandos** (`src/game/commands.ts`) são a **única** forma de alterar o jogo. Cada comando é
  validado ali: posse das entidades, recursos, território e requisitos. O jogador humano, a IA e,
  no futuro, a rede usam exatamente a mesma porta de entrada.
- **Eventos** (`GameEvent`) informam a apresentação sobre o que aconteceu: disparos, mortes,
  capturas, erros. A renderização e a interface **leem** o estado e nunca o alteram.

## Ciclo de jogo

`Simulation.step()` executa um tick, nesta ordem:

1. aplica os comandos enfileirados;
2. economia (renda por tick, recalculada a cada segundo);
3. construções: obras, demolições, produção, pesquisas e defesas;
4. unidades: ordens, movimento, combate, cura e separação;
5. remoção de destruídos (ruínas, estatísticas);
6. captura de territórios;
7. visão e névoa (a cada 3 ticks);
8. IA (cada IA decide em intervalos configuráveis, escalonados);
9. condições de vitória (a cada segundo).

A sessão (`src/core/session.ts`) acumula o tempo real e chama `step()` em passo fixo. A
renderização interpola a posição das unidades entre ticks (`px/py → x/y`).

## Módulos

| Módulo | Responsabilidade |
| --- | --- |
| `config/*` | Todos os números de balanceamento: unidades, construções, melhorias, equipes, setores, perfis de IA e regras gerais |
| `game/types.ts` | Tipos do estado (somente dados) |
| `game/world.ts` | Criação do mundo, entidades, recursos e modificadores |
| `game/map/mapgen.ts` | Mapa procedural determinístico (ruas, canal, pontes, orla, bairros e setores) |
| `game/map/grid.ts` | Caminhabilidade e terreno construível |
| `game/pathfinding/astar.ts` | A* com heap binário, buffers reaproveitados e suavização por linha de visada |
| `game/units/*` | Ordens, formação, comportamento por ordem, grade espacial para vizinhança |
| `game/buildings/*` | Regras de posicionamento e sistema de construções |
| `game/combat/damage.ts` | Fórmula de dano (blindagem, modificadores e regras das equipes) |
| `game/economy/economy.ts` | Renda e conectividade territorial (Milícia) |
| `game/territories/*` | Captura de setores e névoa de guerra |
| `game/ai/*` | IA em camadas: contexto (o que a IA sabe), economia e militar |
| `game/victory.ts` | Eliminação, domínio, limite de tempo e pontuação |
| `game/save.ts` | Serialização validada e armazenamento local |
| `render/*` | Cena Three.js, cidade (malha mesclada), modelos provisórios, efeitos, câmera e névoa via shader |
| `ui/*` | HUD, menus, entrada, minimapa, camada 2D de barras e áudio sintetizado |

## Inteligência artificial

- A **estratégia** (`ai/aiEconomy.ts`, `ai/aiMilitary.ts`) decide **o que** fazer em intervalos
  (4 s no Fácil, 2 s no Normal, 1 s no Difícil).
- A **tática individual** (perseguir, atacar no alcance, reagir a ataques) fica em
  `units/behavior.ts` e vale igualmente para unidades do jogador e da IA.
- A IA só conhece o que é visível para ela e a posse dos setores, que é informação pública.
- A dificuldade não dá recursos infinitos: as diferenças estão em `config/ai.ts`, com um modificador
  de renda explícito e pequeno.

## Renderização

- A cidade é uma única malha mesclada, com UVs em unidades de mundo para as janelas não esticarem.
  Árvores e coqueiros usam instancing.
- A névoa de guerra é aplicada por injeção de shader (`render/fogMaterial.ts`): cada fragmento
  consulta uma textura de visibilidade pela posição no mundo. Terreno e prédios escurecem juntos.
- Os modelos de unidades e construções vêm de `render/models.ts`. Para usar assets definitivos,
  basta trocar essas funções mantendo as assinaturas.

## Multiplayer (planejado, não implementado)

A arquitetura escolhida é **lockstep de comandos com servidor autoritativo leve**:

1. Cada cliente envia apenas **comandos** (ex.: `{type:'move', unitIds, x, y}`), nunca o estado.
2. O servidor valida cada comando com as mesmas regras de `applyCommand`, carimba o número do tick
   de execução (atraso de 2 a 4 ticks) e retransmite para todos.
3. Todos os clientes executam os mesmos comandos nos mesmos ticks. Como a simulação é
   determinística (teste `ai.test.ts`), o estado permanece idêntico.
4. Um *hash* do estado a cada N ticks detecta dessincronização.
5. Reconexão: o servidor envia o último salvamento (`serializeWorld`) mais os comandos posteriores.

O que já está pronto:
- simulação em passo fixo, sem dependência do relógio de quadros;
- RNG determinístico salvo no estado;
- comandos serializáveis e validados;
- salvamento e carregamento exatos (testados).

O que falta:
- servidor (Node + WebSocket), salas, seleção de equipe em rede, atraso de entrada, detecção de
  dessincronização e tratamento de desconexão;
- avaliar aritmética de ponto fixo para garantir determinismo entre navegadores diferentes.

Requisitos de hospedagem previstos: um processo Node com WebSocket (VPS pequena ou serviço como
Fly.io ou Render). O tráfego é baixo, porque trafegam só comandos.

## Desempenho (medido)

Partida 1×1 no navegador, com cerca de 50 unidades e construções:
- renderização: cerca de 0,8 ms de CPU por quadro (67 chamadas de desenho, cerca de 8 mil triângulos);
- simulação: cerca de 0,2 ms por tick;
- partida IA × IA de 17 minutos simulada sem gráficos em cerca de 2,4 s.

Otimizações já aplicadas: cidade mesclada, árvores instanciadas, grade espacial para vizinhança,
A* com buffers reaproveitados, IA e visão em intervalos, efeitos em pool e qualidade gráfica
configurável (sombras, resolução e efeitos).
