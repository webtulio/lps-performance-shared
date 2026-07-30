/*!
 * lp.js — JS unificado para as 15 LPs do portfólio Performance Digital / Salyd
 * Repo: https://github.com/webtulio/lps-performance-shared
 * CDN:  https://cdn.jsdelivr.net/gh/webtulio/lps-performance-shared@main/lp.js
 *
 * Auto-init no DOMContentLoaded. Procura por <form id="leadForm">.
 * Configuração lida das data-attrs do form:
 *   data-operadora      (obrigatório) — ex: "Humana", "Promédica", "Unimed"
 *   data-form-id        (obrigatório) — ex: "lp-humana", "lp-unimed-bh"
 *   data-button-default (opcional)    — texto do botão pra restaurar após erro/anti-bot. Default: "Baixar Tabela"
 *   data-button-bg      (opcional)    — cor de fundo do botão pra restaurar. Default: "#ff9c1b"
 *   data-button-color   (opcional)    — cor do texto do botão pra restaurar. Default: "" (não modifica)
 *   data-unidade        (opcional)    — usado no dataLayer (ex: "bh", "recife"). Útil pras LPs do redeunimed multi-cidade.
 *
 * O HTML do form precisa ter os campos:
 *   <input name="nome">, <input name="fone">, <input name="email">
 *   <select name="estado">, <input name="cidade" list="cidades-ibge">
 *   <input name="tipodeplano" type="radio"> (Empresarial/Familiar/Individual)
 *   <input name="website"> (honeypot, escondido visualmente)
 *   <input name="operadora" type="hidden" value="<operadora>"> (entra no FormData)
 *   <datalist id="cidades-ibge"></datalist> (opcional, ativa IBGE)
 *   <div id="formSuccess"> + <div id="formHeader"> (opcional, ativa tela de sucesso)
 *
 * Endpoint do webhook unificado: https://n8n.salyd.com.br/webhook/salyd-lps-global
 * Schema do payload: docs/payload-schema.md no repo
 */
(function(){
  'use strict';

  var WEBHOOK_URL   = 'https://n8n.salyd.com.br/webhook/salyd-lps-global';
  var FORM_VERSION  = '2.0.0';
  var PAGE_LOADED_AT = Date.now();

  // ===== A/B test: form em 2 passos (bundle) =====
  // Kill switch MESTRE. false = todas as LPs voltam ao form single-step (controle),
  // mesmo com o snippet de sorteio no <head>. Rollback = flip + bump SHA.
  // O sorteio 50/50 + data-ab-form2step no <html> vive no <head> de cada LP (cache-safe);
  // aqui só LEMOS o atributo. Variante vencedora do tabelasaude: 2 passos + prova social +
  // progresso + copy 30s + e-mail opcional recolhido + geo prefill.
  var AB2 = {
    enabled:     true,
    socialProof: '1.217 famílias receberam a tabela nos últimos 30 dias'
  };

  function init(){
    var form = document.getElementById('leadForm');
    if(!form){ return; }

    var cfg = {
      operadora:     form.dataset.operadora     || '',
      formId:        form.dataset.formId        || '',
      buttonDefault: form.dataset.buttonDefault || 'Baixar Tabela',
      buttonBg:      form.dataset.buttonBg      || '#ff9c1b',
      buttonColor:   form.dataset.buttonColor   || '',
      unidade:       form.dataset.unidade       || '',
      typebotId:     form.dataset.typebotId     || '',    // ex: "salyd-humana" — se presente, injeta bubble Typebot
      typebotHost:   form.dataset.typebotHost   || 'https://viewer.salyd.com.br',
      exitIntent:    form.dataset.exitIntent !== 'off'    // exit-intent popup desktop (default ligado; "off" desativa)
    };

    if(!cfg.operadora || !cfg.formId){
      console.warn('[lp.js] data-operadora e data-form-id são obrigatórios no <form id="leadForm">');
    }

    // Variante A/B lida do atributo setado pelo snippet no <head> ('' se experimento off na LP)
    var abVariant = '';
    try { abVariant = document.documentElement.getAttribute('data-ab-form2step') || ''; } catch(_){}

    // ===== Typebot bubble com header customizado estilo Leadster =====
    // Carrega o widget Typebot self-hosted + injeta header HTML DENTRO do popup
    // (shadow DOM): avatar WhatsApp + nome "Marina - Planos {operadora}" + "Online agora".
    // Payload do Typebot é IDÊNTICO ao do form (mesmo webhook salyd-lps-global).
    if(cfg.typebotId){
      loadTypebotWidget(cfg);
    }

    // ===== Exit-intent popup (somente desktop) =====
    if(cfg.exitIntent){
      initExitIntent(cfg, form);
    }

    // ===== A/B: form em 2 passos (bundle) =====
    // Só roda se o <head> setou data-ab-form2step (LP no experimento) E kill switch ligado.
    // Eventos disparam nos DOIS braços; reestruturação só na variante 'b'. Fail-open total.
    if(AB2.enabled && abVariant){
      initABForm2Step(cfg, form, abVariant);
    }

    function initExitIntent(cfg, form){
      // Guards: só desktop com mouse, 1× por sessão, não se já converteu
      var isDesktop = window.matchMedia('(hover: hover) and (pointer: fine)').matches && window.innerWidth > 768;
      if(!isDesktop) return;
      if(new URLSearchParams(window.location.search).get('envio') === 'sucesso') return;
      try { if(sessionStorage.getItem('lps_exit_shown')) return; } catch(_){}

      var accent = cfg.buttonBg || '#ff9c1b';
      var shown = false;

      // CSS isolado (1×)
      if(!document.getElementById('lps-exit-styles')){
        var css =
          '.lps-exit-overlay{position:fixed;inset:0;background:rgba(10,20,18,.55);z-index:42999999;'+
            'display:none;align-items:center;justify-content:center;padding:20px;'+
            'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}'+
          '.lps-exit-overlay.is-open{display:flex;animation:lpsExitFade .2s ease-out}'+
          '@keyframes lpsExitFade{from{opacity:0}to{opacity:1}}'+
          '.lps-exit-card{background:#fff;border-radius:16px;max-width:440px;width:100%;'+
            'overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.3);animation:lpsExitPop .25s cubic-bezier(.18,.89,.32,1.1)}'+
          '@keyframes lpsExitPop{from{transform:translateY(12px) scale(.97);opacity:0}to{transform:none;opacity:1}}'+
          '.lps-exit-head{background:#15302b;color:#fff;padding:20px 22px;position:relative}'+
          '.lps-exit-tag{font-size:.82rem;opacity:.85;margin-bottom:6px}'+
          '.lps-exit-head h3{font-size:1.3rem;line-height:1.25;margin:0;color:#fff;font-weight:700}'+
          '.lps-exit-close{position:absolute;top:14px;right:14px;width:30px;height:30px;border:0;'+
            'border-radius:50%;background:rgba(255,255,255,.18);color:#fff;font-size:18px;cursor:pointer;line-height:1}'+
          '.lps-exit-close:hover{background:rgba(255,255,255,.3)}'+
          '.lps-exit-body{padding:20px 22px 24px}'+
          '.lps-exit-body>p{margin:0 0 16px;color:#444;font-size:.98rem;line-height:1.5}'+
          '.lps-exit-list{list-style:none;margin:0 0 20px;padding:0}'+
          '.lps-exit-list li{position:relative;padding-left:24px;margin-bottom:10px;color:#1f2937;font-size:.95rem}'+
          '.lps-exit-list li::before{content:"";position:absolute;left:0;top:6px;width:9px;height:9px;'+
            'border-radius:50%;background:#22c55e}'+
          '.lps-exit-cta{display:block;width:100%;padding:15px;border:0;border-radius:30px;'+
            'color:#fff;font-weight:700;font-size:1.02rem;cursor:pointer;font-family:inherit;'+
            'transition:filter .15s}'+
          '.lps-exit-cta:hover{filter:brightness(1.07)}'+
          '.lps-exit-dismiss{display:block;width:100%;margin-top:10px;padding:8px;background:none;'+
            'border:0;color:#8a909c;font-size:.9rem;cursor:pointer;font-family:inherit}'+
          '.lps-exit-dismiss:hover{color:#555}';
        var st = document.createElement('style');
        st.id = 'lps-exit-styles';
        st.textContent = css;
        document.head.appendChild(st);
      }

      // Markup
      var ov = document.createElement('div');
      ov.className = 'lps-exit-overlay';
      ov.setAttribute('role','dialog');
      ov.setAttribute('aria-modal','true');
      ov.innerHTML =
        '<div class="lps-exit-card">'+
          '<div class="lps-exit-head">'+
            '<button class="lps-exit-close" type="button" aria-label="Fechar">&times;</button>'+
            '<div class="lps-exit-tag">Espere! &#128075;</div>'+
            '<h3>Antes de sair, receba a cota&ccedil;&atilde;o dos melhores planos</h3>'+
          '</div>'+
          '<div class="lps-exit-body">'+
            '<p>Comparamos as principais operadoras pra voc&ecirc; pagar menos.</p>'+
            '<ul class="lps-exit-list">'+
              '<li>Gr&aacute;tis e sem compromisso</li>'+
              '<li>Especialista de verdade no WhatsApp</li>'+
              '<li>Resposta em ~2 minutos</li>'+
            '</ul>'+
            '<button class="lps-exit-cta" type="button" style="background:'+accent+'">Quero minha cota&ccedil;&atilde;o gr&aacute;tis</button>'+
            '<button class="lps-exit-dismiss" type="button">Agora n&atilde;o</button>'+
          '</div>'+
        '</div>';
      document.body.appendChild(ov);

      function open(){
        if(shown) return;
        shown = true;
        try { sessionStorage.setItem('lps_exit_shown','1'); } catch(_){}
        ov.classList.add('is-open');
        if(window.dataLayer){ window.dataLayer.push({event:'exit_intent_shown', form_id:cfg.formId}); }
      }
      function close(){ ov.classList.remove('is-open'); }

      // CTA → fecha, rola pro form, foca no nome
      ov.querySelector('.lps-exit-cta').addEventListener('click', function(){
        close();
        if(window.dataLayer){ window.dataLayer.push({event:'exit_intent_cta', form_id:cfg.formId}); }
        var alvo = document.getElementById('form') || form;
        if(alvo){ alvo.scrollIntoView({behavior:'smooth', block:'center'}); }
        var nome = form.querySelector('input[name="nome"]');
        if(nome){ setTimeout(function(){ try{ nome.focus({preventScroll:true}); }catch(e){} }, 450); }
      });
      ov.querySelector('.lps-exit-close').addEventListener('click', close);
      ov.querySelector('.lps-exit-dismiss').addEventListener('click', close);
      ov.addEventListener('click', function(e){ if(e.target === ov) close(); });
      document.addEventListener('keydown', function(e){ if(e.key === 'Escape') close(); });

      // Trigger: mouse saindo pelo topo da viewport (barra de endereço / fechar aba)
      document.addEventListener('mouseout', function(e){
        if(!e.relatedTarget && e.clientY <= 0){ open(); }
      });
    }

    // ===================================================================
    // A/B — form em 2 passos (bundle). Módulo isolado, fail-open.
    // Braço 'a' = controle intocado (só eventos). Braço 'b' = reestrutura o DOM
    // POR CIMA: move os campos existentes pra 2 containers dentro do <form>.
    // FormData/payload/webhook 100% intactos (mesmos nós, mesmos name).
    // ===================================================================
    function initABForm2Step(cfg, form, variant){
      var dl = window.dataLayer = window.dataLayer || [];
      function abPush(ev, extra){
        var o = { event: ev, ab_test:'form2step', ab_variant: variant, form_id: cfg.formId, operadora: cfg.operadora };
        if(extra){ for(var k in extra) o[k] = extra[k]; }
        dl.push(o);
      }
      function reveal(){ try { form.style.visibility = 'visible'; } catch(_){} } // 'visible' vence o CSS anti-flicker

      // --- Eventos nos DOIS braços (denominador honesto) ---
      try {
        var seenView = false;
        if('IntersectionObserver' in window){
          var io = new IntersectionObserver(function(ents){
            ents.forEach(function(en){ if(en.isIntersecting && !seenView){ seenView = true; abPush('lps_form_view'); io.disconnect(); } });
          }, { threshold: 0.4 });
          io.observe(form);
        } else { abPush('lps_form_view'); }
      } catch(_){}
      form.addEventListener('submit', function(){ abPush('lps_form_submit_attempt'); }, true);

      // Controle: nada além dos eventos. Revela e sai.
      if(variant !== 'b'){ reveal(); return; }

      // Variante B: reestrutura. Qualquer erro => form original intacto e visível.
      try { buildTwoStep(); } catch(e){ reveal(); }

      function elc(tag, cls, html){ var e = document.createElement(tag); if(cls) e.className = cls; if(html != null) e.innerHTML = html; return e; }

      function buildTwoStep(){
        if(form.getAttribute('data-ab-built')){ reveal(); return; }
        var accent = cfg.buttonBg || '#ff9c1b';
        var q = function(s){ return form.querySelector(s); };

        var elNome = q('input[name="nome"]');
        var elFone = q('input[name="fone"]');
        var elMail = q('input[name="email"]');
        var elUf   = q('select[name="estado"]');
        var elCid  = q('input[name="cidade"]');
        function cell(n){ return n ? (n.closest('.input-icon') || n.parentElement) : null; }
        var cNome = cell(elNome), cFone = cell(elFone), cMail = cell(elMail), cUf = cell(elUf), cCid = cell(elCid);
        var fgCnpj  = q('input[name="cnpj"]');  fgCnpj  = fgCnpj  && fgCnpj.closest('.field-group');
        var fgVidas = q('input[name="vidas"]'); fgVidas = fgVidas && fgVidas.closest('.field-group');
        var btn = q('.btn-submit') || q('button[type="submit"]');

        // Faltou peça essencial => aborta (fail-open, form original)
        if(!cNome || !cFone || !elUf || !cUf || !elCid || !cCid || !fgCnpj || !fgVidas || !btn){ reveal(); return; }

        form.setAttribute('data-ab-built','1');
        injectABStyles();

        var proof = elc('div','lps-ab-proof','<span class="lps-ab-dot"></span>'+ AB2.socialProof);
        var prog  = elc('div','lps-ab-prog','<i></i>');
        var lab   = elc('p','lps-ab-steplab','Passo 1 de 2 · leva 10 segundos');
        var s1 = elc('div','lps-ab-s1');
        var s2 = elc('div','lps-ab-s2 lps-ab-hid');

        // PASSO 1 — só cliques (cnpj + vidas já são radio-cards existentes)
        s1.appendChild(fgCnpj);
        s1.appendChild(fgVidas);
        var next = elc('button','lps-ab-next','Ver minha tabela →'); next.type = 'button'; next.disabled = true;
        next.style.background = accent;
        s1.appendChild(next);

        // PASSO 2 — nome / whatsapp / uf+cidade / e-mail opcional / enviar
        var r1 = elc('div','form-row lps-ab-row'); r1.appendChild(cNome); s2.appendChild(r1);
        var r2 = elc('div','form-row lps-ab-row'); r2.appendChild(cFone); s2.appendChild(r2);
        var r3 = elc('div','form-row lps-ab-row'); r3.appendChild(cUf); r3.appendChild(cCid); s2.appendChild(r3);
        var geonote = elc('p','lps-ab-geonote lps-ab-hid','📍 Já preenchemos com a sua localização. Confira e ajuste se precisar.');
        s2.appendChild(geonote);
        var mailrow = null;
        if(cMail){
          if(elMail) elMail.removeAttribute('required'); // e-mail vira opcional na variante B (payload aceita vazio)
          var addmail = elc('a','lps-ab-addmail','+ adicionar e-mail (opcional)');
          addmail.style.color = accent; // destaque legível em card claro ou escuro
          mailrow = elc('div','form-row lps-ab-row lps-ab-hid'); mailrow.appendChild(cMail);
          addmail.addEventListener('click', function(){
            mailrow.classList.remove('lps-ab-hid'); addmail.classList.add('lps-ab-hid');
            try { elMail.focus({preventScroll:true}); } catch(_){}
          });
          s2.appendChild(addmail); s2.appendChild(mailrow);
        }
        s2.appendChild(btn);
        s2.appendChild(elc('p','lps-ab-micro','🔒 Sem ligações indesejadas. Só a tabela no seu WhatsApp.'));

        // Injeta containers no topo do form
        form.insertBefore(s2, form.firstChild);
        form.insertBefore(s1, s2);
        form.insertBefore(lab, s1);
        form.insertBefore(prog, lab);
        form.insertBefore(proof, prog);

        // Remove .form-row originais que ficaram vazias (fone/email e uf/cidade antigos)
        Array.prototype.forEach.call(form.querySelectorAll('.form-row'), function(r){
          if(r!==r1 && r!==r2 && r!==r3 && r!==mailrow && !r.querySelector('input,select')) r.remove();
        });

        // Gate do passo 1: só habilita "Ver minha tabela" com cnpj + vidas marcados
        function gate(){
          next.disabled = !(form.querySelector('input[name="cnpj"]:checked') && form.querySelector('input[name="vidas"]:checked'));
        }
        Array.prototype.forEach.call(form.querySelectorAll('input[name="cnpj"],input[name="vidas"]'), function(r){ r.addEventListener('change', gate); });
        gate();

        next.addEventListener('click', function(){
          s1.classList.add('lps-ab-hid'); s2.classList.remove('lps-ab-hid');
          if(prog.firstChild) prog.firstChild.style.width = '88%';
          lab.innerHTML = 'Último passo · sua tabela está quase pronta';
          try { form.querySelector('input[name="nome"]').focus({preventScroll:true}); } catch(_){}
          abPush('lps_form_step1');
        });

        // Geo prefill (só variante B, só campo vazio) — endpoint /api/geo (Vercel/CF headers)
        fetchGeoPrefill(elUf, elCid, geonote);

        reveal();
      }

      function fetchGeoPrefill(elUf, elCid, geonote){
        try {
          fetch('/api/geo', { credentials:'omit' })
            .then(function(r){ return r.ok ? r.json() : null; })
            .then(function(g){
              if(!g) return;
              var did = false;
              if(g.uf && !elUf.value){ elUf.value = g.uf; elUf.dispatchEvent(new Event('change',{bubbles:true})); did = true; }
              if(g.cidade && !elCid.value){
                setTimeout(function(){ elCid.value = g.cidade; elCid.dispatchEvent(new Event('input',{bubbles:true})); }, 140);
                did = true;
              }
              if(did && geonote) geonote.classList.remove('lps-ab-hid');
            })
            .catch(function(){});
        } catch(_){}
      }

      function injectABStyles(){
        if(document.getElementById('lps-ab-styles')) return;
        var css =
          '.lps-ab-hid{display:none !important}'+
          // textos secundários HERDAM a cor do form (branco no card escuro, escuro no claro) => legível em qualquer LP
          '.lps-ab-steplab{margin:0 0 12px !important;font-size:12.5px;color:inherit;opacity:.72}'+
          '.lps-ab-geonote{margin:0 0 8px !important;font-size:12px;line-height:1.45;color:inherit;opacity:.72}'+
          '.lps-ab-micro{margin:12px 0 0 !important;font-size:12px;line-height:1.4;text-align:center;color:inherit;opacity:.68}'+
          '.lps-ab-addmail{display:inline-block;margin:2px 0 6px;font-weight:600;font-size:12.5px;text-decoration:none;border-bottom:1px dashed;cursor:pointer}'+
          // pílula de prova social: fundo próprio claro => contraste garantido em qualquer fundo
          '.lps-ab-proof{display:flex;align-items:center;gap:8px;background:#F0FBF7;border:1px solid #CBEEDF;'+
            'border-radius:999px;padding:8px 13px;margin:0 0 14px;font-weight:600;font-size:12.5px;line-height:1.35;color:#0b6b52}'+
          '.lps-ab-dot{flex:none;width:8px;height:8px;border-radius:50%;background:#22c55e;animation:lpsAbPulse 1.8s infinite}'+
          '@keyframes lpsAbPulse{70%{box-shadow:0 0 0 8px rgba(34,197,94,0)}}'+
          // trilha da barra em cinza translúcido => visível em card claro E escuro
          '.lps-ab-prog{height:6px;border-radius:999px;background:rgba(128,128,128,.28);overflow:hidden;margin:0 0 7px}'+
          '.lps-ab-prog i{display:block;height:100%;width:50%;background:#22c55e;border-radius:999px;transition:width .35s}'+
          '.lps-ab-next{display:block;width:100%;margin-top:16px;border:0;border-radius:8px;color:#fff;'+
            'font-weight:700;font-size:15px;padding:15px 18px;cursor:pointer;font-family:inherit;line-height:1.2}'+
          '.lps-ab-next:disabled{opacity:.45;cursor:not-allowed}'+
          // espaçamento consistente dos campos no passo 2 (12px; cobre uf/cidade empilhados no mobile)
          '.lps-ab-s2 .input-icon input,.lps-ab-s2 .input-icon select{margin-bottom:12px}'+
          '.lps-ab-s2 .btn-submit{margin-top:8px}';
        var st = document.createElement('style'); st.id = 'lps-ab-styles'; st.textContent = css;
        document.head.appendChild(st);
      }
    }

    function loadTypebotWidget(cfg){
      var operadoraNome = cfg.operadora || 'Salyd';

      // CRÍTICO: setar window.TS_PAGE_CTX ANTES do Typebot carregar.
      // O Set variable block "ctx_operadora" no init_ctx_utms (código herdado do tabelasaude)
      // lê window.TS_PAGE_CTX.operadora — não consegue ler prefilledVariables porque variáveis
      // do Typebot NÃO ficam expostas como globais JS dentro de blocks de código.
      window.TS_PAGE_CTX = {
        operadora:        cfg.operadora || '',
        operadora_source: 'lp',
        page_id:          window.location.pathname,
        page_title:       document.title,
        page_url:         window.location.href,
        post_type:        'lp',
        user_agent:       navigator.userAgent || '',  // p/ typebot meta.user_agent
        ip:               ''  // preenchido async pelo fetch ipify abaixo
      };

      var s = document.createElement('script');
      s.type = 'module';
      s.textContent =
        "import Typebot from 'https://cdn.jsdelivr.net/npm/@typebot.io/js@0.3/dist/web.js';" +
        "window.__lpsTypebot = Typebot;" +
        "Typebot.initBubble({" +
          "typebot: " + JSON.stringify(cfg.typebotId) + "," +
          "apiHost: " + JSON.stringify(cfg.typebotHost) + "," +
          "prefilledVariables: {" +
            // Mantém prefilled pra Group #1 renderizar greeting com {{ctx_operadora}}.
            // O Set variable block depois sobrescreve via window.TS_PAGE_CTX (mesmo valor — ok).
            "ctx_operadora: " + JSON.stringify(cfg.operadora) + "," +
            "ctx_operadora_source: 'lp'," +
            "ctx_page_url: window.location.href," +
            "ctx_page_title: document.title," +
            "ctx_page_id: window.location.pathname," +
            "ctx_referrer: document.referrer || ''" +
          "}," +
          "previewMessage: {" +
            "message: " + JSON.stringify('Quer receber a Tabela ' + operadoraNome + ' por WhatsApp?') + "," +
            "autoShowDelay: 4000" +
          "}," +
          "theme: {" +
            "button: { backgroundColor: '#25D366', iconColor: '#FFFFFF', size: 'large' }," +
            "placement: 'left'" +
          "}" +
        "});";
      document.head.appendChild(s);

      // Injeta header DENTRO do popup do Typebot (shadow DOM) quando o chat abre.
      // Em vez de overlay fixo, o header vira parte do widget.
      var operadoraNome2 = operadoraNome;
      var headerHtml =
        '<div class="lps-tb-h-avatar">' +
          '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>' +
        '</div>' +
        '<div class="lps-tb-h-info">' +
          '<div class="lps-tb-h-name">Marina - Planos ' + operadoraNome2 + '</div>' +
          '<div class="lps-tb-h-status">Online agora</div>' +
        '</div>';

      var headerCss =
        '.lps-tb-injected-header{display:flex;align-items:center;gap:12px;padding:14px 16px;' +
          'background:#0E2153;color:#fff;border-radius:8px 8px 0 0;' +
          'font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
          'box-sizing:border-box;width:100%}' +
        '.lps-tb-h-avatar{position:relative;width:44px;height:44px;border-radius:50%;background:#25D366;' +
          'display:flex;align-items:center;justify-content:center;flex-shrink:0}' +
        '.lps-tb-h-avatar svg{width:26px;height:26px;fill:#fff}' +
        '.lps-tb-h-avatar::after{content:"";position:absolute;bottom:1px;right:1px;width:11px;height:11px;' +
          'border-radius:50%;background:#22c55e;box-shadow:0 0 0 2px #0E2153}' +
        '.lps-tb-h-info{flex:1 1 auto;min-width:0}' +
        '.lps-tb-h-name{font-weight:600;font-size:15px;color:#fff;' +
          'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
        '.lps-tb-h-status{font-size:12px;color:rgba(255,255,255,.78);margin-top:2px}';

      function tryInjectHeader(){
        var bubble = document.querySelector('typebot-bubble');
        if(!bubble || !bubble.shadowRoot) return false;
        var root = bubble.shadowRoot;
        // Procura o container do chat aberto. Várias estratégias.
        var popup =
          root.querySelector('[part="popup"]') ||
          root.querySelector('[part="chat-window"]') ||
          root.querySelector('[class*="popup-container"]') ||
          root.querySelector('[class*="chat-container"]') ||
          root.querySelector('[class*="bubble-popup"]') ||
          // fallback: pega o primeiro div filho que parece chat
          Array.prototype.find.call(root.children, function(c){ return c.tagName === 'DIV' && c.children.length > 0; });
        if(!popup) return false;
        if(popup.querySelector('.lps-tb-injected-header')) return true; // já injetado
        // Injeta estilos no shadow root (1×)
        if(!root.querySelector('style[data-lps-tb]')){
          var st = document.createElement('style');
          st.setAttribute('data-lps-tb','1');
          st.textContent = headerCss;
          root.appendChild(st);
        }
        var hdr = document.createElement('div');
        hdr.className = 'lps-tb-injected-header';
        hdr.innerHTML = headerHtml;
        popup.prepend(hdr);
        return true;
      }

      // Tenta injetar repetidamente até conseguir (popup pode demorar a renderizar)
      var attempts = 0;
      var ival = setInterval(function(){
        attempts++;
        if(tryInjectHeader() || attempts > 60){ // ~12s
          clearInterval(ival);
        }
      }, 200);
      // E também via MutationObserver caso o user feche e reabra
      var bodyObs = new MutationObserver(function(){ tryInjectHeader(); });
      bodyObs.observe(document.body, { childList: true, subtree: true });
    }

    // ===== Phone mask + normalização =====
    function normalizePhoneDigits(digits){
      // E.164 (+5592...) ou fixo internacional 12-13 dígitos com prefixo 55: remove
      if((digits.length===12 || digits.length===13) && digits.indexOf('55')===0) digits = digits.slice(2);
      if(digits.length > 11) digits = digits.slice(0,11);
      return digits;
    }
    function formatPhone(v){
      if(v.length>10) return '('+v.slice(0,2)+') '+v.slice(2,7)+'-'+v.slice(7);
      if(v.length>6)  return '('+v.slice(0,2)+') '+v.slice(2,6)+'-'+v.slice(6);
      if(v.length>2)  return '('+v.slice(0,2)+') '+v.slice(2);
      if(v.length>0)  return '('+v;
      return '';
    }
    var foneEl = form.querySelector('input[name="fone"]');
    if(foneEl){
      var foneHandle = function(e){
        var digits = normalizePhoneDigits((e.target.value||'').replace(/\D/g,''));
        e.target.value = formatPhone(digits);
      };
      foneEl.addEventListener('input', foneHandle);
      foneEl.addEventListener('change', foneHandle);
      foneEl.addEventListener('blur', foneHandle);
    }

    // ===== Email normalize =====
    var emailEl = form.querySelector('input[name="email"]');
    if(emailEl){
      emailEl.addEventListener('input', function(e){
        e.target.value = e.target.value.replace(/\s/g,'').toLowerCase();
      });
      emailEl.addEventListener('blur', function(e){
        var v = e.target.value.trim();
        e.target.value = v;
        if(v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)){
          e.target.style.borderColor = '#e40f36';
          e.target.style.boxShadow   = '0 0 0 2px rgba(228,15,54,.2)';
        } else {
          e.target.style.borderColor = '';
          e.target.style.boxShadow   = '';
        }
      });
    }

    // ===== UTM capture com inferência por referrer (padrão GA4) =====
    // Cascata de atribuição: UTM explícita > gclid/fbclid > referrer → infere > direct.
    // Persiste em localStorage 30d (last-click com fallback pra direct via cache).
    // Schema completo: docs/ORIGEM_LEAD.md no salydcore.
    //
    // IMPORTANTE: storage key e formato FLAT compatíveis com o Typebot (init_ctx_utms)
    // que lê `localStorage.getItem('ts_utms_v1')` e acessa `s['utm_source']` direto.
    // Por isso salvamos flat ({utm_source, utm_medium, ..., _ts}) na key ts_utms_v1.
    var utmData = (function captureUTMs(){
      var STORAGE_KEY = 'ts_utms_v1'; // mesma key do Typebot (origin-scoped, sem conflito)
      var TTL_MS = 30*24*60*60*1000;
      var qs = new URLSearchParams(window.location.search);

      // 1. UTMs explícitas na URL (prioridade máxima — overrides tudo)
      var u = {
        utm_source:   qs.get('utm_source')   || '',
        utm_medium:   qs.get('utm_medium')   || '',
        utm_campaign: qs.get('utm_campaign') || '',
        utm_term:     qs.get('utm_term')     || '',
        utm_content:  qs.get('utm_content')  || '',
        utm_id:       qs.get('utm_id')       || '',
        gclid:        qs.get('gclid')        || '',
        fbclid:       qs.get('fbclid')       || ''
      };

      // Persiste em formato FLAT (compat Typebot) + _ts pra TTL check
      function persist(data){
        try {
          var toSave = {};
          for(var k in data) toSave[k] = data[k];
          toSave._ts = Date.now();
          localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
        } catch(_){}
      }
      function loadPersisted(){
        try {
          var raw = localStorage.getItem(STORAGE_KEY);
          if(!raw) return null;
          var d = JSON.parse(raw);
          if(!d || !d._ts || Date.now()-d._ts > TTL_MS) return null;
          var clean = {};
          for(var k in d) if(k !== '_ts') clean[k] = d[k];
          return clean;
        } catch(_) { return null; }
      }

      // Se já tem utm_source explícito, persiste e retorna
      if(u.utm_source){ persist(u); return u; }

      // 2. gclid → google/cpc | fbclid → facebook/paid_social
      if(u.gclid){ u.utm_source = 'google';   u.utm_medium = 'cpc';         persist(u); return u; }
      if(u.fbclid){u.utm_source = 'facebook'; u.utm_medium = 'paid_social'; persist(u); return u; }

      // 3. Sem nada na URL: tenta inferir por referrer
      var referrer = document.referrer || '';
      var currentHost = window.location.hostname.toLowerCase().replace(/^www\./,'');

      // Sem referrer → ver se tem persistido (preserva atribuição original em visitas direct)
      if(!referrer){
        var p = loadPersisted();
        if(p && p.utm_source && p.utm_source !== 'direct') return p;
        u.utm_source = 'direct'; u.utm_medium = 'direct';
        return u;
      }

      var refHost;
      try { refHost = new URL(referrer).hostname.toLowerCase().replace(/^www\./,''); }
      catch(_) { u.utm_source = 'direct'; u.utm_medium = 'direct'; return u; }

      // Mesmo domínio = não conta como referral
      if(refHost === currentHost){
        var p2 = loadPersisted();
        if(p2 && p2.utm_source && p2.utm_source !== 'direct') return p2;
        u.utm_source = 'direct'; u.utm_medium = 'direct';
        return u;
      }

      // Helper: match host contra lista (incluindo subdomínios)
      function matchHost(host, list){
        for(var k in list){
          if(host === k || host.endsWith('.' + k)) return list[k];
        }
        return null;
      }

      // Search engines (GA4 padrão) → organic
      var SEARCH = {
        'google.com':'google', 'google.com.br':'google',
        'bing.com':'bing', 'duckduckgo.com':'duckduckgo',
        'yahoo.com':'yahoo', 'br.search.yahoo.com':'yahoo',
        'yandex.com':'yandex', 'baidu.com':'baidu',
        'ecosia.org':'ecosia', 'search.brave.com':'brave'
      };
      var src = matchHost(refHost, SEARCH);
      if(src){ u.utm_source = src; u.utm_medium = 'organic'; persist(u); return u; }

      // GEO (LLMs) → organic_geo  (custom — único valor não-GA4 na nossa convenção)
      var GEO = {
        'chatgpt.com':'chatgpt', 'openai.com':'chatgpt', 'chat.openai.com':'chatgpt',
        'manus.im':'manus',
        'perplexity.ai':'perplexity',
        'copilot.microsoft.com':'copilot',
        'gemini.google.com':'gemini'
      };
      src = matchHost(refHost, GEO);
      if(src){ u.utm_source = src; u.utm_medium = 'organic_geo'; persist(u); return u; }

      // LinkedIn → referral (decisão explícita da doc, NÃO social)
      if(refHost === 'linkedin.com' || refHost.endsWith('.linkedin.com') || refHost === 'lnkd.in'){
        u.utm_source = 'linkedin'; u.utm_medium = 'referral'; persist(u); return u;
      }

      // Social networks (orgânico) → social
      var SOCIAL = {
        'facebook.com':'facebook', 'l.facebook.com':'facebook', 'm.facebook.com':'facebook', 'lm.facebook.com':'facebook',
        'instagram.com':'instagram', 'l.instagram.com':'instagram',
        'twitter.com':'twitter', 'x.com':'twitter', 't.co':'twitter',
        'youtube.com':'youtube', 'youtu.be':'youtube', 'm.youtube.com':'youtube',
        'tiktok.com':'tiktok',
        'whatsapp.com':'whatsapp', 'web.whatsapp.com':'whatsapp', 'wa.me':'whatsapp',
        'pinterest.com':'pinterest', 'reddit.com':'reddit', 'snapchat.com':'snapchat',
        'telegram.org':'telegram', 't.me':'telegram',
        'discord.com':'discord', 'messenger.com':'messenger'
      };
      src = matchHost(refHost, SOCIAL);
      if(src){ u.utm_source = src; u.utm_medium = 'social'; persist(u); return u; }

      // Fallback: outros sites → <dominio> / referral
      u.utm_source = refHost; u.utm_medium = 'referral'; persist(u); return u;
    })();

    // ===== IP lookup =====
    var userIP = '';
    fetch('https://api.ipify.org?format=json')
      .then(function(r){ return r.json(); })
      .then(function(d){
        userIP = d.ip;
        // expõe pra Typebot ler via TS_PAGE_CTX.ip (preenche meta.ip)
        if (window.TS_PAGE_CTX) window.TS_PAGE_CTX.ip = d.ip;
      })
      .catch(function(){});

    // ===== Tela de sucesso + URL state =====
    function showSuccessScreen(){
      var header  = document.getElementById('formHeader');
      var success = document.getElementById('formSuccess');
      if(form)    form.style.display = 'none';
      if(header)  header.style.display = 'none';
      if(success) success.classList.add('is-visible');
    }
    function markSuccessUrl(){
      try {
        var url = new URL(window.location.href);
        if(url.searchParams.get('envio') !== 'sucesso'){
          url.searchParams.set('envio','sucesso');
          window.history.replaceState({},'',url.toString());
        }
      } catch(_){}
    }
    if(new URLSearchParams(window.location.search).get('envio') === 'sucesso'){
      showSuccessScreen();
    }

    // ===== IBGE: autocomplete de cidades por UF (datalist) com cache localStorage 30d =====
    (function(){
      var ufSel = form.querySelector('select[name="estado"]');
      var dl    = document.getElementById('cidades-ibge');
      if(!ufSel || !dl) return;
      var TTL = 30*24*60*60*1000;
      function render(names){
        dl.innerHTML = names.map(function(n){ return '<option value="'+n.replace(/"/g,'&quot;')+'">'; }).join('');
      }
      function load(uf){
        if(!uf){ dl.innerHTML=''; return; }
        var key = 'ibge_cities_' + uf;
        try {
          var c = JSON.parse(localStorage.getItem(key) || 'null');
          if(c && c.ts && Date.now()-c.ts < TTL){ render(c.cities); return; }
        } catch(_){}
        fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados/'+uf+'/municipios')
          .then(function(r){ return r.json(); })
          .then(function(data){
            var names = data.map(function(c){ return c.nome; });
            render(names);
            try { localStorage.setItem(key, JSON.stringify({ts:Date.now(),cities:names})); } catch(_){}
          })
          .catch(function(){ /* IBGE off: input continua aceitando texto livre */ });
      }
      ufSel.addEventListener('change', function(){ load(this.value); });
      if(ufSel.value) load(ufSel.value);
    })();

    // ===== ANTI-BOT: scoring =====
    function isLikelyBot(data){
      var reasons = [];
      if(!/[aeiouáéíóúâêôãõàAEIOU]/i.test(data.nome || '') || (data.nome || '').trim().length < 2)
        reasons.push('invalid_name');
      if(/^[A-Za-z]{15,}$/.test((data.nome || '').trim()) && !/ /.test(data.nome))
        reasons.push('random_name');
      var digits = (data.fone || '').replace(/\D/g,'');
      if(digits.length < 10) reasons.push('invalid_phone');
      if(!/[aeiouáéíóúâêôãõàAEIOU]/i.test(data.cidade || ''))
        reasons.push('invalid_city');
      if(data.timezone && !/^America\//.test(data.timezone))
        reasons.push('suspicious_tz:' + data.timezone);
      return reasons;
    }

    // ===== Submit handler =====
    form.addEventListener('submit', function(e){
      e.preventDefault();
      var fd   = new FormData(this);
      var data = Object.fromEntries(fd);

      // Validação UF (defense-in-depth)
      if(!data.estado){
        var selEstado = this.querySelector('select[name="estado"]');
        if(selEstado){
          selEstado.focus();
          selEstado.style.borderColor = '#e40f36';
          selEstado.style.boxShadow   = '0 0 0 2px rgba(228,15,54,.2)';
          setTimeout(function(){ selEstado.style.borderColor=''; selEstado.style.boxShadow=''; }, 2500);
        }
        return;
      }

      // Re-normaliza o fone
      var foneDigits = normalizePhoneDigits((data.fone||'').replace(/\D/g,''));
      data.fone = formatPhone(foneDigits);
      var tz = (Intl && Intl.DateTimeFormat) ? Intl.DateTimeFormat().resolvedOptions().timeZone : '';

      // Anti-bot scoring
      var fillTimeSec = Math.round((Date.now()-PAGE_LOADED_AT)/1000);
      var botReasons  = isLikelyBot(Object.assign({}, data, { fill_time_sec: fillTimeSec, timezone: tz }));
      var botScore    = botReasons.length;

      // Honeypot + time trap
      var btn  = this.querySelector('.btn-submit');
      var self = this;
      if(data.website || fillTimeSec < 3){
        if(btn){
          btn.textContent = 'Enviado!';
          btn.style.background = '#00c27b';
          setTimeout(function(){
            btn.textContent = cfg.buttonDefault;
            btn.style.background = cfg.buttonBg;
            self.reset();
          }, 3000);
        }
        return; // NÃO envia pro webhook
      }

      // Payload nested (compatível com tabelasaude → 1 workflow n8n processa tudo)
      var payload = {
        lead: {
          nome:                data.nome || '',
          whatsapp:            data.fone || '',
          email:               data.email || '',
          uf:                  data.estado || '',
          cidade:              data.cidade || '',
          tipo_plano:          data.tipodeplano || '',   // descontinuado — mantido vazio pra compat schema v2.0.0
          cnpj_status:         data.cnpj || '',          // novo: 'sim' | 'nao'
          vidas:               data.vidas || '',         // novo: '1' | '2' | '3-5' | '6-10' | '10+'
          operadora_preferida: ''
        },
        contexto: {
          operadora:        data.operadora || cfg.operadora || '',
          operadora_source: 'lp',
          page_id:          window.location.pathname,
          page_title:       document.title,
          page_url:         window.location.href,
          post_type:        'lp',
          referrer:         document.referrer || ''
        },
        utm: {
          source:   utmData.utm_source   || '',
          medium:   utmData.utm_medium   || '',
          campaign: utmData.utm_campaign || '',
          content:  utmData.utm_content  || '',
          term:     utmData.utm_term     || '',
          keyword:  '',
          id:       utmData.utm_id       || '',
          gclid:    utmData.gclid        || '',
          fbclid:   utmData.fbclid       || '',
          ttclid:   '',
          msclkid:  ''
        },
        meta: {
          form_id:      cfg.formId,
          form_version: FORM_VERSION,
          submitted_at: new Date().toISOString(),
          user_agent:   navigator.userAgent,
          ip:           userIP || '',
          cf_country:   '',
          antibot: {
            score:          botScore,
            reasons:        botReasons.join(','),
            fill_time_sec:  fillTimeSec,
            fone_digits:    foneDigits
          },
          screen:       screen.width + 'x' + screen.height,
          timezone:     tz,
          landing_page: window.location.pathname
        }
      };

      if(btn){ btn.textContent = 'Enviando...'; btn.disabled = true; }

      fetch(WEBHOOK_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload)
      })
      .then(function(){
        if(window.dataLayer){
          var dl = { event: 'lead_submit', form_id: cfg.formId, operadora: cfg.operadora, bot_score: botScore };
          if(cfg.unidade)  dl.unidade    = cfg.unidade;
          if(abVariant)    dl.ab_variant = abVariant;   // amarra a conversão ao braço A/B
          window.dataLayer.push(dl);
        }
        self.reset();
        markSuccessUrl();
        showSuccessScreen();
      })
      .catch(function(){
        if(btn){
          btn.textContent = 'Erro, tente novamente';
          btn.style.background = '#e40f36';
          btn.style.color      = '#fff';
          setTimeout(function(){
            btn.textContent = cfg.buttonDefault;
            btn.style.background = cfg.buttonBg;
            btn.style.color = cfg.buttonColor;
            btn.disabled = false;
          }, 3000);
        }
      });
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
