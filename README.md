# lps-performance-shared

JS unificado das **15 LPs** do portfólio Performance Digital / Salyd, servido via [jsDelivr CDN](https://www.jsdelivr.com/). Manter aqui = atualização única propaga pra todas as LPs.

> 📦 **Por que separado de [`lps-salyd`](https://github.com/webtulio/lps-salyd)?** O repo `lps-salyd` é privado (docs operacionais + playbooks internos). jsDelivr só serve repos públicos. Este repo contém apenas o código JS que já é público de fato (qualquer DevTools nas LPs mostra).

## Arquivos

- `lp.js` — bundle único (vanilla JS, sem build). Phone mask, UTM capture, IP lookup, IBGE datalist, anti-bot, submit handler, tela de sucesso.

## URL do CDN

```
https://cdn.jsdelivr.net/gh/webtulio/lps-performance-shared@main/lp.js
```

> ⚠️ jsDelivr cacheia branches por **até 7 dias** (`@main`). Pra ver mudança propagar mais rápido, use o purge endpoint (abaixo) ou versione com tag (`@v1.0.0`).

## Como usar nas LPs

```html
<form id="leadForm"
      method="POST"
      data-operadora="Humana"
      data-form-id="lp-humana"
      data-button-default="Baixar Tabela"
      data-button-bg="#ff9c1b">

  <input type="hidden" name="operadora" value="Humana">
  <!-- demais campos: nome, fone, email, estado, cidade, tipodeplano -->
  <!-- honeypot: <input name="website"> escondido visualmente -->
  <!-- datalist opcional: <datalist id="cidades-ibge"></datalist> -->
</form>

<script src="https://cdn.jsdelivr.net/gh/webtulio/lps-performance-shared@main/lp.js" defer></script>
```

### Data-attrs do `<form>`

| Atributo | Obrigatório | Default | Descrição |
|---|---|---|---|
| `data-operadora` | ✅ | — | Ex: `"Humana"`, `"Promédica"`, `"Unimed"`. Vai pro `contexto.operadora` do payload. |
| `data-form-id` | ✅ | — | Ex: `"lp-humana"`, `"lp-unimed-bh"`. Vai pro `meta.form_id`. |
| `data-button-default` | — | `"Baixar Tabela"` | Texto pra restaurar o botão após erro/anti-bot. |
| `data-button-bg` | — | `"#ff9c1b"` | Cor de fundo pra restaurar o botão. |
| `data-button-color` | — | — | Cor de texto pra restaurar o botão. |
| `data-unidade` | — | — | Usado no dataLayer (ex: `"bh"`, `"recife"`). |

### Elementos esperados no HTML

| Seletor | Obrigatório | O que ativa |
|---|---|---|
| `<form id="leadForm">` | ✅ | Inicialização |
| `<input name="nome">` | ✅ | Validação anti-bot |
| `<input name="fone">` | ✅ | Máscara + scoring |
| `<input name="email">` | ✅ | Validação |
| `<select name="estado">` | ✅ | UF obrigatória + IBGE |
| `<input name="cidade">` | ✅ | Scoring |
| `<input name="tipodeplano" type="radio">` | ✅ | Vai pro payload |
| `<input name="website">` (honeypot) | ✅ | Anti-bot |
| `<input name="operadora" type="hidden">` | ✅ | Identifica LP no payload |
| `<button class="btn-submit">` | ✅ | Estados de envio/erro |
| `<datalist id="cidades-ibge">` | — | Ativa autocomplete IBGE |
| `<div id="formSuccess">` + `<div id="formHeader">` | — | Ativa tela de sucesso animada |

## Workflow de update

### 1. Edita o `lp.js`

### 2. Commit + push

```bash
cd /c/Users/Tulio/lps-performance-shared
git add lp.js
git commit -m "<descrição>"
git push origin main
```

### 3. Invalida o cache jsDelivr

```bash
curl -X POST "https://purge.jsdelivr.net/gh/webtulio/lps-performance-shared@main/lp.js"
```

Propaga em segundos.

### 4. Valida em uma LP

Abrir uma LP no browser → DevTools Network → confirmar `lp.js` veio com o conteúdo novo.

## Versionamento

Por enquanto usamos `@main`. Update = 1 push + 1 purge. Não precisa atualizar URL em 15 LPs cada vez.

Quando uma mudança for **destrutiva**, considerar tag `v2.0.0` e migrar as LPs uma a uma.

## Rollback de emergência

```bash
cd /c/Users/Tulio/lps-performance-shared
git revert <hash-do-commit-quebrado>
git push origin main
curl -X POST "https://purge.jsdelivr.net/gh/webtulio/lps-performance-shared@main/lp.js"
```

Em até 1 min as 15 LPs voltam pra versão anterior.

## LPs que consomem este script

| LP | operadora | form_id |
|---|---|---|
| redehumanasaude.com | Humana | lp-humana |
| redepromedica.com | Promédica | lp-promedica |
| redesamel.com | Samel | lp-samel |
| redesmile.net | Smile | lp-smile |
| redeunihosp.com | Unihosp | lp-unihosp |
| redebestsenior.com.br | Best Senior | lp-bestsenior |
| livsaudeplanos.com.br | Liv Saúde | lp-livsaudeplanos |
| redeunimed.com | Unimed | lp-unimed |
| redeunimed.com/bh/ | Unimed | lp-unimed-bh |
| redeunimed.com/cnu/ | Unimed | lp-unimed-cnu |
| redeunimed.com/maceio/ | Unimed | lp-unimed-maceio |
| redeunimed.com/recife/ | Unimed | lp-unimed-recife |
| redeunimed.com/rio/ | Unimed | lp-unimed-rio |
| redeunimed.com/uberlandia/ | Unimed | lp-unimed-uberlandia |
| redeunimed.com/vitoria/ | Unimed | lp-unimed-vitoria |

## Schema do payload enviado

Ver `docs/payload-schema.md` no repo `lps-salyd` (privado). Versão atual: `2.0.0`.
