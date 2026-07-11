# Chronicle System — Roadmap de Modernização & Fundação

> Documento de referência para guiar a implementação via **speckit** após `/clear`.
> Consolida: estado atual do sistema, dívidas arquiteturais-raiz, plano de fundação
> sequenciado, backlog de features e referências de API do Foundry já verificadas.
>
> **Data-base:** 2026-06-10 · **Versão do system:** 0.7.0 · **Foundry:** v14 (verified) / min 12.
>
> **📋 Auditoria de implementação — 2026-07-11 · system `0.10.0`.** Marcações de status
> **✅ concluído / 🟡 parcial / ⬜ pendente** foram adicionadas por seção abaixo, **verificadas
> contra o código atual** (não apenas contra a existência das specs). Resumo executivo:
> **Passo 1–3 ✅**, **Passo 4 🟡** (só identidade por slug), **Passo 5 ⬜**, **Passo 6 ⬜**.
> Backlog: **dificuldade-alvo + grau de sucesso ✅** (specs 009/010/011), **consumo de
> `armorRating`/`DAMAGE_TAKEN` ✅**, **Intriga alvo→Composure ✅**, **dano/ferimentos 🟡**
> (calculado + botão de 1 clique, sem auto-aplicar), **Sorcery/Warfare/Casas ⬜**.

---

## 0. Como usar este documento

- A migração para **v14 + ApplicationV2** está concluída. Este doc é o "norte" para a
  fase seguinte: **fortalecer a fundação antes de implementar features novas**.
- Cada item da **§4 (Plano de Fundação)** é candidato a virar uma spec (`speckit.specify`).
- A **§5 (Backlog de Features)** depende da fundação E da consulta às regras via **NotebookLM**
  (caderno id `a151285b-6796-4d06-bea7-707fc16502ef`; MCP `notebooklm` configurado no escopo
  local — exige reiniciar a sessão para as tools `mcp__notebooklm__*` carregarem).
- A **§7 (Referências de API)** evita re-descobrir fatos do core Foundry já confirmados.

---

## 1. Estado atual (verificado)

> ⚠️ **Snapshot de 2026-06-10 — parcialmente superado (ver auditoria 2026-07-11).**
> Atualizações confirmadas no código: versão **`0.10.0`** (min **13** / verified 14, `system.json`);
> **Modificadores migrados p/ Active Effects** — coletor único (`module/effects/cs-effect-modifiers.js`)
> é o único escritor de `modifiers`/`penalties` (spec 007) → a linha "**0 `ActiveEffect`**" está **obsoleta**;
> **Testes existem** (Vitest, 23 arquivos / 364 testes, spec 005); **Linter funcional** (spec 004);
> **Especialidades com slug estável** (spec 008), porém ainda subdata/texto (não item);
> `template.json` e o **Proxy factory continuam presentes** (Passo 5 não iniciado).

| Aspecto | Situação |
|---------|----------|
| Versão / compat | `0.7.0`; min 12, verified/max 14 (`system.json`) |
| Sheets | Já em ApplicationV2 (`ActorSheetV2`/`ItemSheetV2` via `HandlebarsApplicationMixin`) |
| DataModels | Registrados p/ **todos** os tipos (`config.js:67-84`) — Actor: character/house/unit; Item: 11 tipos |
| Schema de dados | **Duplicado**: `template.json` (raiz) **e** DataModels definem o mesmo schema (violação de SSOT) |
| Modificadores | Sistema **caseiro** `modifiers`/`penalties` — **44 usos** em 6 arquivos, **0 `ActiveEffect`** |
| Especialidades | Texto bruto `Ability:Specialty` (não é item/referência) |
| Fórmulas (arma) | `specialty` e `damage @Ability+N` como texto aberto; dano via `eval()` |
| Localização | Só `lang/en.json`; templates de item e abas de character majoritariamente hardcoded |
| Testes | **Inexistentes** |
| Linter | **Inutilizado**: 4599/4644 erros são ruído de CRLF |
| Factory | Proxy sobre Actor/Item (`factory.js`) — passivo arquitetural |

---

## 2. Princípio orientador

> **Alvo = "idiomático Foundry, bem fatorado, com rede de testes" — NÃO "Clean Architecture de livro".**

- Impor camadas/ports/adapters/use-cases sobre um system Foundry é *over-engineering* e briga
  com o framework. As primitivas certas **já existem**: Documents, DataModels, Active Effects, ApplicationV2.
- **Fundação estrutural ANTES das features. Polimento incremental DURANTE** (boy-scout rule).
- **Testes são a maior alavanca**: sem rede de segurança, todo refactor é aposta.
- **YAGNI**: não criar abstração antes da feature que a exige — as features revelam onde dói.

---

## 3. Dívidas arquiteturais-raiz (autodiagnóstico do autor)

Os 5 pontos levantados pelo autor têm uma **raiz comum** (exceto o async):

> **Representar dados como texto bruto e reinventar primitivas que o Foundry já oferece**,
> em vez de usar IDs/referências estruturadas e Documents/ActiveEffects nativos.

| # | Dívida | Verificado no código | Tam. | Vira → |
|---|--------|----------------------|:----:|--------|
| 1 | **async mal usado** em alguns pontos | Sem anti-padrões grosseiros: **0** `forEach(async)`, **1** `.then()` (`cs-chat.js:35`). Dívida menor que o temido | S–M | Passo 1–2 (auditoria) |
| 2 | **modifiers/penalties caseiros** em vez de **Active Effects** | 44 usos, 0 AE. AE oferece UI, transfer item→ator, duração, stacking, remoção automática | XL | **Passo 3 (spike)** |
| 3 | **especialidade como texto** em vez de **item arrastável** p/ habilidades | `Ability:Specialty` split (`handlebarsHelpers.js:65`) | M | Passo 4 |
| 5 | **fórmulas como texto aberto** (specialty + dano), sem sugerir opções | `damage @Ability+N` via `eval()` (`csWeaponItem.js:12`) | M | Passo 4 |
| 4 | **i18n complicada** | **Sintoma de 2/3/5**, não causa | — | Passo 6 |

> **Status (2026-07-11):** **#2 (modifiers→AE) ✅ RESOLVIDA** — go/no-go decidido em 2026-06-11
> (HÍBRIDO, `specs/006-spike-active-effects/decision-report.md`); épico entregue (specs 006/007/009).
> **#3 (especialidade como texto) 🟡 PARCIAL** — identidade por slug estável entregue (spec 008),
> mas a especialidade da arma ainda é texto cru `Ability:Specialty` (`handlebarsHelpers.js:65`) e não
> virou item arrastável. **#5 (fórmulas como texto) 🟡 PARCIAL** — `@Ability` resolve por slug, mas o
> **`eval()` do dano permanece** (`csWeaponItem.js:22`); sem parser explícito nem autocomplete.
> **#1 (async) ✅** — auditoria absorvida nos Passos 1–2 (sem anti-padrões).

### O insight de ordem (crítico)

A armadilha de i18n — `CS.constants.*` (habilidades) são **chaves de lookup**: o código localiza
a constante e compara com `item.name` (`csCharacterActor.js:45,75,283`). Traduzir
`endurance`→`resistência` **zera Saúde/Composição/Movimento silenciosamente**.

➡️ **A cura da i18n não é traduzir melhor — é dar IDs/slugs estáveis aos dados (resolver #3 e #5).**
Por isso **arquitetura de dados vem ANTES de i18n**. Traduzir antes = retrabalho + bugs silenciosos.

### Nota de honestidade sobre Active Effects (#2)

AE é mais poderoso, mas **não é migração 1:1**: brilha em mudanças *declarativas*
(`armadura → -1 Agility` via mode `ADD`). Modificadores **dinâmicos/condicionais** (dependem de
outro valor calculado) exigem `CUSTOM` mode ou permanecer em `prepareDerivedData`. O sistema atual
provavelmente tem desses casos → por isso o **spike** (migrar 1 modificador) antes de comprometer o épico.

---

## 4. Plano de Fundação (sequenciado por dependência)

> Cada passo é candidato a uma spec speckit. Ordem reflete dependências reais.

### Passo 1 — Linter funcional (CRLF)  ✅ CONCLUÍDO (spec 004)
> **Verificado:** `.gitattributes` (`* text=auto eol=lf`), `.prettierrc` (`endOfLine: lf`), `.editorconfig`;
> husky **v8** (`.husky/pre-commit` → `npx lint-staged`); `package.json` com `"lint": "eslint module/"`,
> `"prepare": "husky install"` e `lint-staged` sobre `module/**/*.js`.
- **Objetivo:** tornar o ESLint utilizável (hoje 99% do output é ruído de CRLF).
- **Escopo:** `.gitattributes` (`* text=auto eol=lf`), `.prettierrc` (`{ "endOfLine": "lf" }`),
  `.editorconfig`; `git add --renormalize .` (commit isolado — toca 54 arquivos).
- **Depois:** reativar husky v8 (`.husky/pre-commit`) + adicionar `"scripts": { "lint": "eslint module/" }`
  (hoje a config husky é v4 legada e inerte; `npm run lint` nem existe).
- **Esforço:** S · **Risco:** baixo (mas commit de renormalização grande — fazer isolado).
- **Pronto quando:** `eslint module/` mostra só erros reais (~45); pre-commit bloqueia erro novo.

### Passo 2 — Testes da lógica pura (Vitest)  ✅ CONCLUÍDO (spec 005)
> **Verificado:** `vitest.config.mjs` + `"test": "vitest run"`; **23 arquivos / 364 testes verdes**.
> Cobre os 4 grupos: `DiceRollFormula` (`tests/dice-roll-formula.test.js`), parsing specialty/dano
> (`tests/weapon-formula.test.js`), `migrateData` com null/NaN/legado (`tests/migrations.test.js`),
> deriváveis puros — Saúde=Endurance×3, defesas (`tests/derived-stats.test.js`).
- **Objetivo:** rede de segurança que torna todos os refactors seguros.
- **Escopo (lógica testável sem Foundry):** `DiceRollFormula` (pool/bonusDice/modifier),
  parsing de specialty/dano de arma, os `migrateData` dos DataModels (fixtures com null/NaN/legado),
  cálculos derivados puros (Health = Endurance×3, defesas).
- **Stack:** Vitest (ESM-nativo, zero-config). `"test": "vitest"`. Stubs mínimos p/ globais (`game`/`CONFIG`).
- **Não testar:** sheets/UI de início — ROI está na lógica de regras.
- **Esforço:** M · **Risco:** baixo · **Pronto quando:** suíte verde cobrindo os 4 grupos acima.

### Passo 3 — Spike Active Effects → decisão go/no-go (dívida #2)  ✅ CONCLUÍDO (specs 006/007/009)
> **Verificado:** go/no-go decidido em 2026-06-11 (HÍBRIDO — `specs/006-spike-active-effects/decision-report.md`)
> e o **épico entregue**: `module/effects/` (10 arquivos) com coletor único (`cs-effect-modifiers.js`) que
> reescreve `modifiers`/`penalties` a cada `prepareData`, lendo AE autorados (`actor.appliedEffects`) +
> itens vivos + condições. `csArmorItem.js` é classe vazia (penalidade lida ao vivo — spike). UI de autoria
> em cascata (`cs-effect-config-sheet.js`) registrada. Migração 0.8.0 (`task080-ae-unification.js`).
- **Objetivo:** medir esforço×ganho de migrar `modifiers`/`penalties` p/ Active Effects.
- **Escopo do spike:** migrar **1** modificador (sugestão: penalidade de armadura, `csArmorItem.js:12`)
  para AE com mode adequado; comparar com o caminho caseiro; mapear quais casos são declarativos
  (ADD/MULTIPLY) vs dinâmicos (CUSTOM/prepareDerivedData).
- **Saída:** decisão documentada (migrar tudo / híbrido / manter) + estimativa do épico.
- **Apoio:** NotebookLM p/ mapear como cada regra de modificador vira AE.
- **Esforço:** M (spike) / XL (épico, se go) · **Risco:** alto (é a maior decisão arquitetural).
- **Pronto quando:** existe um AE funcional + relatório de decisão.

### Passo 4 — Modelagem de dados: especialidades + fórmulas (dívidas #3 e #5)  🟡 PARCIAL
> **Feito (spec 008):** identidade por **slug estável** — `cs-slugify.js`, `getAbilityValueBySlug`,
> especialidades de ability como subdata com slug escopado; migração 0.9.0 (`task090-slug-identity.js`).
> **Pendente:** especialidade **não** virou item arrastável (segue subdata; a arma usa texto
> `Ability:Specialty` em `handlebarsHelpers.js:65`); o **`eval()` do dano permanece** (`csWeaponItem.js:22`),
> sem parser explícito nem autocomplete/validação.
- **Objetivo:** trocar texto bruto por **referências estruturadas com IDs estáveis**.
- **Escopo:**
  - Especialidade como **item** (ou subdado com id) arrastável p/ habilidades, em vez de `Ability:Specialty`.
  - `specialty`/`damage` da arma: schema estruturado + **autocomplete/validação** (parar de usar `eval`;
    substituir por parser explícito com fallback — `csWeaponItem.js:12-17`).
- **Pré-condição:** Passo 2 (testes) no lugar.
- **Impacto colateral positivo:** destrava a i18n (Passo 6) ao eliminar comparação por nome localizado.
- **Esforço:** M (cada) · **Risco:** médio (migração de dados de mundos existentes → `migrateData`).

### Passo 5 — SSOT: `template.json` → DataModels-only + eliminar Proxy  ⬜ NÃO INICIADO
> **Verificado:** `template.json` **ainda existe** na raiz; `system.json` **sem** bloco `documentTypes`;
> `lang/en.json` **sem** chaves `TYPES.Actor.*`/`TYPES.Item.*`; **Proxy factory intacto**
> (`module/utils/factory.js`, trap `getPrototypeOf`; usado em `config.js:74-75`). DataModels **estão**
> registrados p/ todos os tipos (`config.js:86-103`), mas **`unit-data.js` segue sem `nullable`/`migrateData`**
> (único DataModel sem `migrateData` — pré-req do 5a ainda aberto).
- **5a — Remover `template.json`** (deprecado `@deprecated until v16`):
  1. Declarar tipos em `system.json` → bloco `documentTypes` (ver §7).
  2. **Auditar** que cada DataModel cobre 100% dos campos/defaults do `template.json`
     (atenção ao `Actor.templates.common`).
  3. Adicionar chaves `TYPES.Actor.*` / `TYPES.Item.*` em `lang/en.json` (necessárias p/ diálogo de criação).
  4. `migrateData` em **todos** os DataModels — **novo requisito v14: deve RETORNAR valor**.
  5. Deletar `template.json`.
- **5b — Eliminar Proxy factory** (`factory.js`): migrar p/ document class **única** registrada em
  `CONFIG.Actor.documentClass`/`CONFIG.Item.documentClass`, com despacho por `this.type` (ou lógica
  nos DataModels). Remove o trap `getPrototypeOf` e o risco contra checagens internas do core.
  Fazer **Item primeiro** (hierarquia mais simples), depois Actor.
- **Esforço:** M (5a) + L (5b) · **Risco:** médio — persistência não muda SE feito na ordem.
- **Pronto quando:** sem `template.json`; tipos via `documentTypes`; instanceof e tokens não-linkados OK.

### Passo 6 — Localização pt-BR (dívida #4 — só agora é segura)  ⬜ NÃO INICIADO
> **Verificado:** **não** existe `lang/pt-BR.json`; `system.json` registra só `en`; strings ainda hardcoded
> em templates de item (weapon/armor/ability) e abas de personagem. **Pré-requisito já destravado:** o
> acoplamento `CS.constants.*` por nome localizado foi resolvido via slugs estáveis (spec 008) — a i18n
> agora é segura; falta só o trabalho de extração/tradução.
- **Pré-condição:** Passos 4/5 (IDs estáveis) — senão cai na armadilha `CS.constants`.
- **Escopo:** extrair ~150 strings hardcoded (templates de item + abas de character) p/ chaves;
  manter `CS.constants.*` **idênticas ao inglês** OU desacoplar lookup de rótulo (slug estável);
  criar `lang/pt-BR.json` (UTF-8) e registrar em `system.json` (bloco `languages`, modelo: street-fighter).
- **Esforço:** L · **Risco:** alto se feito antes da modelagem; baixo depois.

### Auditoria de async (dívida #1) — encaixa nos Passos 1–2  ✅ (sem anti-padrões)
- Sem padrões grosseiros. Procurar: `async` desnecessário, `update()`/`create()` não-aguardados pontuais,
  `await` sequenciais que poderiam ser `Promise.all`. Esforço S–M.

---

## 5. Backlog de Features (pós-fundação — dependem do NotebookLM)

> Implementar **em cima da base limpa**, validando regras pelo caderno. Ordenado por impacto em mesa.

### Combate
| Feature | Arquivos-âncora | Imp. | Esf. |
|---------|-----------------|:----:|:----:|
| **Aplicação automática de dano + ferimentos** (hoje 100% manual) | `cs-roll.js:12`, `csWeaponItem.js`, `cs-base-rollcard.hbs` | alto | XL |
| **Consumir `armorRating`/`DAMAGE_TAKEN`** (registrado mas nunca lido) | `csCharacterActor.js:36`, `csArmorItem.js:12` | alto | M |
| **Qualidades de arma** (só adaptable/two-handed/bulk funcionam; `onEquippedChanged` vazio) | `csWeaponItem.js:6` | alto | L |
| **Grau de sucesso no CSRoll** (sem dificuldade-alvo) + remover `dieroll.js` morto | `cs-roll.js:12` | médio | L |

> **Status Combate (2026-07-11):**
> - ✅ **Grau de sucesso + dificuldade-alvo** — escada de dificuldade + faixas de grau (`cs-difficulty.js`),
>   `degreesOfSuccess` (`cs-conflict.js`), alvo→dificuldade (specs 009/010); **`dieroll.js` removido**;
>   card de roll redesenhado (spec 011 — `cs-base-rollcard.hbs`/`difficulty-result.hbs` removidos).
> - ✅ **Consumir `armorRating`/`DAMAGE_TAKEN`** — lido via coletor (`cs-effect-modifiers.js:397`) e
>   subtraído no dano (`cs-conflict.js:108`, `cs-targeting.js`).
> - 🟡 **Aplicação automática de dano + ferimentos** — dano/influência são **calculados** no acerto e há
>   **botão "Aplicar" de 1 clique** (permission-gated, `cs-conflict-apply.js`), mas **não auto-aplica**
>   (FR-019, por design) e **ferimentos/wounds seguem manuais**.
> - 🟡 **Qualidades de arma** — alcance (close/long) e concessão de qualidades via AE funcionam; `bulk`/
>   `adaptable` lidos ao vivo; mas `onEquippedChanged` segue stub vazio (`csItem.js:12`) e a maioria das
>   qualidades ainda não tem efeito mecânico dedicado.

### Casas / Intriga / Sorcery / Warfare
| Feature | Imp. | Esf. |
|---------|:----:|:----:|
| **Intriga**: disputa vs Intrigue Defense + dano à Composure (calculado, nunca usado) | alto | L |
| **Sorcery**: consumir Sorcery Points + TechniqueCost (hoje só exibição) | alto | L |
| **Warfare**: ator+sheet `unit`, consumir `trainingLevel`/`disciplineModifier`/`disorganizedPenalties`; re-registrar item `unitType` com template | alto | XL |
| **Fortune** de casa com consequência de recurso | médio | M |
| Eventos: regenerar/editar modifiers pós-drop | baixo | M |
| Holdings: automação de `features` sobre recursos da casa | baixo | L |

> **Status Casas/Intriga/Sorcery/Warfare (2026-07-11):**
> - ✅ **Intriga** — disputa alvo vs **Intrigue Defense** (`cs-targeting.js:46`) e dano à **Composure**
>   (`cs-roll.js:83`, `computeInfluence` em `cs-conflict.js`), aplicado pelo card (mesma ressalva do
>   dano: 1 clique, não auto) — antes era "calculado, nunca usado".
> - ⬜ **Sorcery** — só schema (`sorceryPoints`) + aba de exibição; `technique-data.js` **sem campo de custo**;
>   **nenhum consumo** de pontos/custo.
> - ⬜ **Warfare** — ator `unit` reusa `CSCharacterActor` como placeholder (`actorConstructor.js:8`), sem
>   sheet dedicada; item `unitType` tem DataModel mas **não** é registrado como sheet (`config.js`). Segue *stub*.
> - 🟡 **Fortune de casa** — a **rolagem** existe (pré-roadmap; `csHouseActorSheet.js`), mas **sem
>   consequência de recurso** automatizada. ⬜ **Eventos: regenerar modifiers pós-drop** (só no drop) ·
>   ⬜ **Holdings: automação de `features`** — não implementados.

> **Warfare** = épico que reúne: ator `unit` + item `unitType` (re-registrar sheet, `config.js:97`)
> + `unit-data` hardening + sheet dedicada. `unit`/`unitType` são *stubs* deixados para o futuro.

---

## 6. Achados verificados do levantamento

### Lote 0 — JÁ APLICADO E COMMITADO ✅ (confirmado 2026-07-11)
> Verificado no HEAD atual: `splice(index, 1)` (`csHouseActor.js:180`), `unitType` fora do registro de
> sheet (`config.js`), `data-action="editImage"` nos dois headers, `dataType` nos 16 inputs de `event.hbs`,
> `console.log`/`{{csTrace}}` removidos. **Exceção:** o item `task030` ficou **obsoleto** — a migração
> `task030.js` foi **aposentada/removida** por completo (`migration.js:39`), então aquele `import` não existe mais.
- `csHouseActor.js:190` `splice(index)` → `splice(index, 1)` (não apaga membros seguintes)
- `config.js:97` — `unitType` removido do registro de sheet (volta com Warfare)
- `header.hbs` + `header-delete.hbs` — add `data-action="editImage"`
- `task030.js` — add `import { ChronicleSystem }`
- `event.hbs:33` — `systemType` → `dataType`
- `csEventItem.js:11` — `console.log` removido + 4 `{{csTrace}}` limpos nos templates de technique

### FALSOS POSITIVOS descartados (não mexer)
- ❌ "Editores de item travados (`context.editable`)" — `editable` é herdado de
  `DocumentSheetV2._prepareContext` (`foundry.mjs:38010`). Edição funciona (confirmado em mesa).
- ❌ "`_getInitiativeFormula()` inexistente" — herdado do core `Combatant` (`foundry.mjs:59609`).
  Resíduo cosmético: `CONFIG.Combat.initiative.formula = "1d20"` (`config.js:53`) nunca é usado.
- 🟡 "`task030` sem import" — era inócuo (resolvia via `window`), mas corrigido por robustez.

### UX/Qualidade reais ainda abertos (fora da fundação — fazer durante features)
> **Status parcial (2026-07-11):** ✅ **drop de itens na ficha já funciona** — `_onDropItem` override
> (`csActorSheet.js:184`) cria o item embutido + `onObtained` (o V2 despacha nativamente). Ainda abertos:
> ⬜ **`deleteItem` genérico na ficha de personagem** (só há delete de wound/injury); ⬜ `unit-data` sem
> `nullable`/`migrateData` (pré-req do Passo 5a); ⬜ `CLAUDE.md` ainda cita classes inexistentes
> (`CsAbstractCombatActor`/`CsHouseUnitActor`). Demais (CSS, acessibilidade, `csFormGroup`) seguem abertos.
- **UX actor:** sem `deleteItem` na ficha de personagem (M/alto); `dragDrop` não configurado (M/alto);
  fallback CSS `.tab{display:none}` (S/médio); acessibilidade (M/médio); feedback drag-over + confirmação
  destrutiva (M/médio); `resizable`/`data-base-size` órfão (S/baixo).
- **UX item:** form-group manual vs `csFormGroup` (M/médio); specialty/dano sem dica de formato (S/médio);
  cabeçalhos de coluna em listas (S/baixo).
- **Qualidade:** `unit-data` sem `nullable`/`migrateData` (S/médio — **pré-req do Passo 5a**);
  nomenclatura de arquivos camelCase vs kebab (M/baixo); `CLAUDE.md` desatualizado cita classes
  inexistentes — `CsAbstractCombatActor`/`CsHouseUnitActor` não existem (S/baixo);
  `no-unused-vars` em hooks virtuais (`argsIgnorePattern: "^_"`); `no-case-declarations` em `csHouseActor`.

---

## 7. Referências de API Foundry v14 (confirmadas em `foundry.mjs`, build 14.363.0)

> Já verificado pelo foundry-api-expert — não re-descobrir.

- **`editable` no contexto de item sheet:** herdado de `DocumentSheetV2._prepareContext`
  (`foundry.mjs:38010`, `editable: this.isEditable`). `ItemSheetV2` não sobrescreve.
- **Edição de imagem V2:** trigger é `data-action="editImage"` (action registrada em
  `foundry.mjs:37891`); handler `#onEditImage` em `foundry.mjs:38213-38239` lê `target.dataset.edit`
  como **payload** (qual campo). `data-edit` sozinho **não** dispara nada no V2.
- **`_getInitiativeFormula()`:** definido na base `Combatant` (`foundry.mjs:59609-59611`),
  retorna `String(CONFIG.Combat.initiative.formula || game.system.initiative)`.
- **`template.json` deprecado:** `@deprecated since v14 until v16` (`foundry.mjs:12976-12982`).
  Só consultado como **fallback quando NÃO há DataModel** (`foundry.mjs:12964-12972`).
  *(Não há string de toast em runtime no bundle client — o aviso visto vem provavelmente do servidor.)*
- **`documentTypes` no manifest:** campo `AdditionalTypesField` (`foundry.mjs:82703`).
  Estrutura: `"documentTypes": { "Actor": { "character": {}, "house": {}, "unit": {} }, "Item": { ... } }`
  (exemplo core `foundry.mjs:16243-16263`; validação `82318-82362`; `game.documentTypes` `204605-204609`).
- **`migrateData` deve RETORNAR valor (novo v14):** `foundry.mjs:12941-12948` (retorno `undefined` → warning, não suportado).
- **Registro de dataModels no `init`:** exemplo core `foundry.mjs:16267-16276`; `HTMLField` `16282`.

---

## 8. Armadilhas conhecidas (do levantamento + memória do projeto)

- **`CS.constants.*` são chaves de lookup** (não traduzir sem refatorar p/ slugs) — ver §3.
- **v13+ submete inputs `readonly`**: stats derivados NÃO podem ter `name` (vira NumberField inválido).
- **Templates V2 não podem ter `<form>` raiz** nem `root: true` em PARTS (quebra editores).
- **`migrateData` + `nullable: true`** para coagir dados legados (null/NaN/string) antes da validação v13+.
- **Helpers/partials não podem colidir com nomes internos do Foundry** (prefixo `cs`).
- **Cache do browser:** Ctrl+Shift+R após mudanças.

---

## 9. Sistemas de referência & recursos

- **`street-fighter`** (prioridade) e **`foundry-fe2`** em `Data\systems\` — padrões idiomáticos V2,
  delete de item via `DialogV2.confirm`, `dragDrop`, multi-idioma (street-fighter tem pt-BR completo).
- **NotebookLM** (regras do Chronicle System): `https://notebooklm.google.com/notebook/a151285b-6796-4d06-bea7-707fc16502ef`.
- **foundry-api-expert** (agente): consultar ANTES de escrever código que toque a API do Foundry.

---

## 10. Ordem recomendada de execução

```
Passo 1 (linter)  →  Passo 2 (testes)  →  Passo 3 (spike AE → go/no-go)
   →  Passo 4 (especialidades/fórmulas)  →  Passo 5 (SSOT: template.json + Proxy)
   →  Passo 6 (i18n pt-BR)  →  Backlog de Features (§5, com NotebookLM)
```

> **Progresso (2026-07-11):** ✅ Passo 1 · ✅ Passo 2 · ✅ Passo 3 · 🟡 Passo 4 (só slug) ·
> ⬜ Passo 5 · ⬜ Passo 6. **Próximo pela ordem:** concluir Passo 4 (parser de dano + especialidade
> estruturada) e então Passo 5 (SSOT/Proxy). Já entregues fora da ordem original via specs 009/010/011:
> dificuldade-alvo, grau de sucesso, consumo de armadura e Intriga alvo→Composure.

Auditoria de async corre junto de 1–2. UX/qualidade da §6 entram oportunisticamente (boy-scout)
ao tocar cada área durante as features.
