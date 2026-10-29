# RelojoariaVR

Relojoaria: quebra-cabeça de engrenagens em VR para o Meta Quest 3, no navegador do óculos
(WebXR), sem instalar nada. Na oficina de um velho relojoeiro há um painel de madeira com pinos
de latão; o jogador pega engrenagens da bandeja e encaixa nos pinos para que cada mostrador gire
no sentido e na velocidade pedidos (ex.: "1 volta a cada 2 voltas do motor, horário"). 20 fases
em 4 grupos de 5, com uma fase mestre no fim de cada grupo. Também joga no PC com o mouse. Tudo
em português.

## Como rodar / jogar

**No Quest:** abrir no navegador do óculos **https://parappathe.github.io/RelojoariaVR/** (ou a
página inicial https://parappathe.github.io/) e apertar "Entrar em VR". Para atualizar o site:
commitar e rodar `python publicar.py RelojoariaVR` na pasta `C:\claude code`.

**No PC:** `python serve.py` nesta pasta e abrir `http://localhost:8803` (o painel de
visualização usa `.claude/launch.json`). O `serve.py` manda o navegador não guardar cache;
`python serve.py --https` serve para abrir no Quest pela rede de casa.

### Controles

| | VR (Quest) | PC |
|---|---|---|
| Pegar peça | Apontar e segurar o gatilho (a peça corre pelo raio até o painel), ou botão lateral com a mão perto da peça | Clicar e arrastar |
| Encaixar | Soltar perto de um pino: o ímã puxa para o pino mais próximo (anel verde = cabe, vermelho = não cabe) | Soltar o botão |
| Tirar do painel | Pegar a peça no painel (vai para a mão) | Clicar e arrastar; botão direito devolve direto para a bandeja |
| Trocar a camada (frente/fundo) | A ou X (segurando a peça ou apontando para ela) | R |
| Motor | Thumbstick para o lado gira a manivela; apertar o thumbstick liga/desliga; ou apontar para a alavanca/manivela e gatilho | Espaço, ou clicar na alavanca/manivela; setas ←/→ giram a manivela |
| Pausa | B ou Y | Esc ou P |
| Menu | Apontar e gatilho | Clique |
| FPS | Menu → FPS | F |

O controle vibra ao mirar um pino, ao encaixar, ao travar e na vitória. "Recentralizar" (na
pausa) põe o jogador de frente para o painel e ajusta a altura (dá para jogar sentado).

### Regras

- Cada pino tem duas camadas: 0 (junto da madeira) e 1 (na frente). Engrenagens só engrenam na
  mesma camada. Duas que se tocam giram em sentidos opostos; velocidade inversamente
  proporcional aos dentes (ωb = -ωa·Ta/Tb).
- Geometria: pinos a 12 módulos na horizontal e 16 na vertical (diagonal 20). Engrenam quando a
  soma dos dentes é 24 (lado: 8+16, 12+12), 32 (cima: 8+24, 12+20, 16+16), 40 (diagonal: 16+24,
  20+20) ou 48 (dois pinos ao lado: 24+24). Se a soma passar disso, batem e não cabe.
- Peças: simples (8, 12, 16, 20, 24 dentes) e duplas coaxiais (ex.: `24x8`: 24 numa camada e 8
  na outra, presas no mesmo eixo). Trocar a camada da dupla inverte qual roda fica na frente.
- Motor, mostradores e proibidos têm a própria engrenagem e não aceitam peça (na frente fica a
  manivela ou o ponteiro). Correia: as duas polias são um eixo só (mesma velocidade, mesmo
  sentido) e aceitam peças nas duas camadas.
- Travou: laço ímpar ou velocidades que brigam. O mecanismo treme, range e não gira; as duas
  rodas onde o laço não fecha ganham um anel vermelho.
- Vitória: tudo certo e o motor dá 3/4 de volta. O relógio da fase (cuco ou carrilhão) toca e
  ganha vida. Estrelas: 3 com o mínimo de peças do robô (`par`), 2 com uma a mais, 1 com mais.
  Passar uma fase libera a próxima. Progresso salvo no navegador (localStorage,
  chave `relojoariavr.v1`).

### Fases (em `js/levels.js`)

Aprendiz: 1 Primeiro encaixe, 2 Corrente, 3 Ao contrário, 4 Desvio, 5 A volta por cima (mestre).
Oficial: 6 Não acorde o cuco (proibido), 7 Travou! (começa travada), 8 Dois ponteiros, 9 Um gira,
outro dorme, 10 Oficina bagunçada (mestre). Duplas: 11 Engrenagem dupla, 12 Camada da frente,
13 Ao avesso, 14 Duas duplas, 15 O relógio do avô (mestre). Correias: 16 Correia, 17 Correia que
acelera, 18 Polia e proibido, 19 Três ponteiros, 20 Obra-prima (grande mestre).

O menu mostra a fase 15 já montada girando sozinha (`MENU_LEVEL`).

## Como testar

- `node tests/run.js` (ou `npm test`): frações, geometria do engrenamento, sentido, razão,
  dupla coaxial e camadas, correia, travamento (triângulo e correia com razões que brigam),
  regras de encaixe, o `Game` (bandeja, tirar, trocar camada, manivela, vitória) e, para cada
  fase: peças fixas não batem, não começa resolvida, o robô (`tests/robot.js`) acha solução só
  com as peças da bandeja, o `par` é o mínimo, sem a correia não dá (fases de correia) e o
  relógio ganha vida. Tem que terminar com "Tudo certo". Não toca som.
- No navegador (console), objeto `relo.dev`:
  - `relo.dev.loadLevel(3)` abre a fase 3 (1 a 20);
  - `relo.dev.solve()` monta a solução do robô e liga o motor;
  - `relo.dev.advance(7)` roda 7 s de jogo na hora (o painel escondido não anima);
  - `relo.dev.state()` resumo (pedido x atual, travado, peças, bandeja);
  - `relo.dev.place('16', i, j, camada)`, `relo.dev.remove(índice)`, `relo.dev.motor(true)`.
- **Só dá para testar no óculos:** pegar com raio e com o botão lateral, ímã, vibração,
  thumbstick como manivela, distância do painel, legibilidade dos números, FPS.

## Estrutura

| Arquivo | O que tem |
|---|---|
| `index.html`, `css/style.css` | Página e botão "Entrar em VR" |
| `js/frac.js` | Frações exatas. Sem navegador |
| `js/gears.js` | Geometria (grade, camadas), encaixe (`canPlace`, `layerOptions`), grafo e propagação por busca em largura (`analyze`: velocidade de cada roda, travamento, pedidos), textos de razão, contorno dos dentes e alinhamento dos dentes para o desenho. Sem navegador |
| `js/levels.js` | As 20 fases e a vitrine do menu. Sem navegador |
| `js/game.js` | `Game`: bandeja, peças no painel, motor/manivela, tremida, eventos (encaixe, trava, tique, vitória). Sem navegador |
| `js/main.js` | Liga tudo: render, VR (raio, botão lateral, botões, vibração), mouse, menus, quadro de pedidos, depuração `relo.dev` |
| `js/scene.js` | Oficina: bancada, painel, luminária (única luz com sombra), lupa, poeira, prateleira, relógio da fase, engrenagens extrudadas, mostradores, manivela |
| `js/ui.js` | Painel de menu 3D (mesmo do TeatroSombras, cores de madeira e latão) |
| `js/audio.js` | Sons sintetizados (tique-taque, catraca, rangido, cuco, carrilhão) |
| `js/save.js` | Progresso e opções |
| `tests/run.js`, `tests/robot.js` | Testes e o relojoeiro robô (busca em largura, menor solução) |
| `serve.py` | Servidor local sem cache (porta 8803; `--https` para o Quest) |
| `vendor/three/three.module.js` | Three.js r170 (cópia local) |

Coordenadas (metros): jogador em x = 0, z = 0; painel em z = -0,62, centro da grade em
x = -0,2, y = 1,32; 1 módulo = 1,25 cm (pinos a 15 cm de lado e 20 cm de altura). Camadas a
1,8 cm e 4 cm da madeira. Quadro de pedidos à direita do painel, bandeja inclinada na bancada.

## Regras e convenções do projeto

- `frac.js`, `gears.js`, `levels.js` e `game.js` não podem usar navegador nem Three.js: os testes
  rodam no Node. A lógica é toda em frações inteiras, nada de ponto flutuante.
- Fase nova ou mudada: rodar `node tests/run.js`; o robô tem que achar solução e o `par` tem que
  bater com o mínimo dele. Grade de no máximo 6 colunas e 4 linhas.
- Testes não tocam som e terminam sozinhos.

## Decisões

- Grade 12 x 16 módulos (triângulo 3-4-5): dá vizinho do lado, de cima, diagonal e dois pinos ao
  lado com somas de dentes inteiras, e o triângulo lado+cima+diagonal (16, 8, 24) cria o laço
  ímpar natural que trava.
- Duas camadas por pino em vez de engrenagens grossas: é o que deixa a dupla coaxial servir para
  multiplicar a razão. Ao soltar, a camada é escolhida sozinha (a que engrena com o que já gira);
  R / A ou X troca.
- Motor e mostradores não aceitam peça no próprio eixo (senão o eixo do motor virava uma dupla
  de graça e as fases perdiam o sentido).
- Para ganhar o motor precisa girar com tudo certo: o jogador vê o resultado antes do relógio
  tocar. Com tudo certo e motor desligado, o quadro avisa para ligar.
- Desempenho de Quest: uma luz com sombra (spot da luminária, mapa 512 no Quest e 1024 no PC),
  luz ambiente e um ponto sem sombra, materiais Lambert/Phong, sem pós-processamento.
- Fases desenhadas com ajuda de um gerador + o robô: cada uma tem solução mínima única (exceto as
  que começam com peças) e quase todas têm um "atalho" que dá o sentido ou a velocidade errada.

## Pendências / problemas conhecidos

- Nada foi testado no Quest ainda: pegar pelo raio e pelo botão lateral, ímã, thumbstick como
  manivela, vibração, conforto, tamanho dos números, FPS.
- Também não foi aberto num navegador de verdade: o `main.js` foi testado no Node com um
  renderizador falso (montar as 20 fases, solução do robô, arrastar com o mouse, R, botão
  direito, Espaço, Esc). Visual (luz, sombras, setas, quadro de pedidos) não foi conferido.
- Fases com peças já montadas (7 e 10): o `par` é o do robô, que procura o menor número de
  peças acrescentadas, não necessariamente o menor total.
