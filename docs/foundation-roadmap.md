# Chronicle System — Roadmap de Modernização & Fundação

> Documento de referência para guiar a implementação via **speckit** após `/clear`.
> Consolida: estado atual do sistema, dívidas arquiteturais-raiz, plano de fundação
> sequenciado, backlog de features e referências de API do Foundry já verificadas.
>
> **Data-base:** 2026-06-10 · **Versão do system:** 0.7.0 · **Foundry:** v14 (verified) / min 12.

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

### Passo 1 — Linter funcional (CRLF)
- **Objetivo:** tornar o ESLint utilizável (hoje 99% do output é ruído de CRLF).
- **Escopo:** `.gitattributes` (`* text=auto eol=lf`), `.prettierrc` (`{ "endOfLine": "lf" }`),
  `.editorconfig`; `git add --renormalize .` (commit isolado — toca 54 arquivos).
- **Depois:** reativar husky v8 (`.husky/pre-commit`) + adicionar `"scripts": { "lint": "eslint module/" }`
  (hoje a config husky é v4 legada e inerte; `npm run lint` nem existe).
- **Esforço:** S · **Risco:** baixo (mas commit de renormalização grande — fazer isolado).
- **Pronto quando:** `eslint module/` mostra só erros reais (~45); pre-commit bloqueia erro novo.

### Passo 2 — Testes da lógica pura (Vitest)
- **Objetivo:** rede de segurança que torna todos os refactors seguros.
- **Escopo (lógica testável sem Foundry):** `DiceRollFormula` (pool/bonusDice/modifier),
  parsing de specialty/dano de arma, os `migrateData` dos DataModels (fixtures com null/NaN/legado),
  cálculos derivados puros (Health = Endurance×3, defesas).
- **Stack:** Vitest (ESM-nativo, zero-config). `"test": "vitest"`. Stubs mínimos p/ globais (`game`/`CONFIG`).
- **Não testar:** sheets/UI de início — ROI está na lógica de regras.
- **Esforço:** M · **Risco:** baixo · **Pronto quando:** suíte verde cobrindo os 4 grupos acima.

### Passo 3 — Spike Active Effects → decisão go/no-go (dívida #2)
- **Objetivo:** medir esforço×ganho de migrar `modifiers`/`penalties` p/ Active Effects.
- **Escopo do spike:** migrar **1** modificador (sugestão: penalidade de armadura, `csArmorItem.js:12`)
  para AE com mode adequado; comparar com o caminho caseiro; mapear quais casos são declarativos
  (ADD/MULTIPLY) vs dinâmicos (CUSTOM/prepareDerivedData).
- **Saída:** decisão documentada (migrar tudo / híbrido / manter) + estimativa do épico.
- **Apoio:** NotebookLM p/ mapear como cada regra de modificador vira AE.
- **Esforço:** M (spike) / XL (épico, se go) · **Risco:** alto (é a maior decisão arquitetural).
- **Pronto quando:** existe um AE funcional + relatório de decisão.

### Passo 4 — Modelagem de dados: especialidades + fórmulas (dívidas #3 e #5)
- **Objetivo:** trocar texto bruto por **referências estruturadas com IDs estáveis**.
- **Escopo:**
  - Especialidade como **item** (ou subdado com id) arrastável p/ habilidades, em vez de `Ability:Specialty`.
  - `specialty`/`damage` da arma: schema estruturado + **autocomplete/validação** (parar de usar `eval`;
    substituir por parser explícito com fallback — `csWeaponItem.js:12-17`).
- **Pré-condição:** Passo 2 (testes) no lugar.
- **Impacto colateral positivo:** destrava a i18n (Passo 6) ao eliminar comparação por nome localizado.
- **Esforço:** M (cada) · **Risco:** médio (migração de dados de mundos existentes → `migrateData`).

### Passo 5 — SSOT: `template.json` → DataModels-only + eliminar Proxy
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

### Passo 6 — Localização pt-BR (dívida #4 — só agora é segura)
- **Pré-condição:** Passos 4/5 (IDs estáveis) — senão cai na armadilha `CS.constants`.
- **Escopo:** extrair ~150 strings hardcoded (templates de item + abas de character) p/ chaves;
  manter `CS.constants.*` **idênticas ao inglês** OU desacoplar lookup de rótulo (slug estável);
  criar `lang/pt-BR.json` (UTF-8) e registrar em `system.json` (bloco `languages`, modelo: street-fighter).
- **Esforço:** L · **Risco:** alto se feito antes da modelagem; baixo depois.

### Auditoria de async (dívida #1) — encaixa nos Passos 1–2
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

### Casas / Intriga / Sorcery / Warfare
| Feature | Imp. | Esf. |
|---------|:----:|:----:|
| **Intriga**: disputa vs Intrigue Defense + dano à Composure (calculado, nunca usado) | alto | L |
| **Sorcery**: consumir Sorcery Points + TechniqueCost (hoje só exibição) | alto | L |
| **Warfare**: ator+sheet `unit`, consumir `trainingLevel`/`disciplineModifier`/`disorganizedPenalties`; re-registrar item `unitType` com template | alto | XL |
| **Fortune** de casa com consequência de recurso | médio | M |
| Eventos: regenerar/editar modifiers pós-drop | baixo | M |
| Holdings: automação de `features` sobre recursos da casa | baixo | L |

> **Warfare** = épico que reúne: ator `unit` + item `unitType` (re-registrar sheet, `config.js:97`)
> + `unit-data` hardening + sheet dedicada. `unit`/`unitType` são *stubs* deixados para o futuro.

---

## 6. Achados verificados do levantamento

### Lote 0 — JÁ APLICADO (working tree, sem commit) ✅
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

Auditoria de async corre junto de 1–2. UX/qualidade da §6 entram oportunisticamente (boy-scout)
ao tocar cada área durante as features.
