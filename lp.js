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
      typebotHost:   form.dataset.typebotHost   || 'https://viewer.salyd.com.br'
    };

    if(!cfg.operadora || !cfg.formId){
      console.warn('[lp.js] data-operadora e data-form-id são obrigatórios no <form id="leadForm">');
    }

    // ===== Typebot bubble com header customizado estilo Leadster =====
    // Carrega o widget Typebot self-hosted + injeta header HTML por cima
    // (avatar WhatsApp + nome "Marina - Planos {operadora}" + "Online agora").
    // Payload do Typebot é IDÊNTICO ao do form (mesmo webhook salyd-lps-global).
    if(cfg.typebotId){
      injectTypebotStyles();
      var hdr = injectTypebotHeader(cfg);
      loadTypebotWidget(cfg, hdr);
    }

    function injectTypebotStyles(){
      if(document.getElementById('lps-tb-styles')) return;
      var css =
        '#lps-tb-header{position:fixed;bottom:88px;right:20px;width:360px;max-width:calc(100vw - 40px);' +
          'background:#0E2153;color:#fff;padding:14px 16px;border-radius:12px 12px 0 0;' +
          'display:none;align-items:center;gap:12px;' +
          'font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
          'box-shadow:0 -4px 12px rgba(0,0,0,.08);z-index:42999998}' +
        '#lps-tb-header.is-visible{display:flex;animation:lpsTbFadeIn .25s ease-out}' +
        '@keyframes lpsTbFadeIn{from{transform:translateY(8px);opacity:0}to{transform:translateY(0);opacity:1}}' +
        '#lps-tb-header .avatar{position:relative;width:44px;height:44px;border-radius:50%;background:#25D366;' +
          'display:flex;align-items:center;justify-content:center;flex-shrink:0}' +
        '#lps-tb-header .avatar svg{width:26px;height:26px;fill:#fff}' +
        '#lps-tb-header .avatar::after{content:"";position:absolute;bottom:1px;right:1px;width:11px;height:11px;' +
          'border-radius:50%;background:#22c55e;box-shadow:0 0 0 2px #0E2153}' +
        '#lps-tb-header .info{flex:1 1 auto;min-width:0}' +
        '#lps-tb-header .name{font-weight:600;font-size:15px;color:#fff;' +
          'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
        '#lps-tb-header .status{font-size:12px;color:rgba(255,255,255,.78);margin-top:2px}' +
        '#lps-tb-header .close{background:transparent;border:0;color:#fff;cursor:pointer;' +
          'font-size:22px;line-height:1;padding:4px 8px;opacity:.85;border-radius:50%}' +
        '#lps-tb-header .close:hover{opacity:1;background:rgba(255,255,255,.1)}' +
        '@media (max-width:480px){#lps-tb-header{right:10px;left:10px;width:auto;bottom:88px}}';
      var style = document.createElement('style');
      style.id = 'lps-tb-styles';
      style.textContent = css;
      document.head.appendChild(style);
    }

    function injectTypebotHeader(cfg){
      var operadoraNome = cfg.operadora || 'Salyd';
      var hdr = document.createElement('div');
      hdr.id = 'lps-tb-header';
      hdr.innerHTML =
        '<div class="avatar">' +
          '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>' +
        '</div>' +
        '<div class="info">' +
          '<div class="name">Marina - Planos ' + operadoraNome + '</div>' +
          '<div class="status">Online agora</div>' +
        '</div>' +
        '<button class="close" type="button" aria-label="Fechar">×</button>';
      document.body.appendChild(hdr);

      hdr.querySelector('.close').addEventListener('click', function(){
        hdr.classList.remove('is-visible');
        try {
          // Tenta fechar o Typebot via API global ou clica no botão do bubble
          var bubbleEl = document.querySelector('typebot-bubble');
          if(bubbleEl && bubbleEl.close) bubbleEl.close();
          else if(window.Typebot && window.Typebot.close) window.Typebot.close();
        } catch(_){}
      });

      return hdr;
    }

    function loadTypebotWidget(cfg, hdr){
      var operadoraNome = cfg.operadora || 'Salyd';
      var s = document.createElement('script');
      s.type = 'module';
      s.textContent =
        "import Typebot from 'https://cdn.jsdelivr.net/npm/@typebot.io/js@0.3/dist/web.js';" +
        "window.__lpsTypebot = Typebot;" +
        "Typebot.initBubble({" +
          "typebot: " + JSON.stringify(cfg.typebotId) + "," +
          "apiHost: " + JSON.stringify(cfg.typebotHost) + "," +
          "prefilledVariables: {" +
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
            "button: { backgroundColor: '#0E2153', size: 'large' }" +
          "}" +
        "});";
      document.head.appendChild(s);

      // Detecção de abertura/fechamento do bubble pra mostrar/esconder o header
      // Estratégia: MutationObserver no body procurando typebot-bubble + propriedade isOpen
      var lastOpen = false;
      function checkBubbleState(){
        var bubble = document.querySelector('typebot-bubble');
        if(!bubble) return;
        // Typebot v0.3+ expõe `isOpen` como attribute ou property
        var open = bubble.hasAttribute('isOpen') ||
                   (bubble.shadowRoot && bubble.shadowRoot.querySelector('[part="popup"]')) ||
                   bubble.getAttribute('data-state') === 'open';
        if(open !== lastOpen){
          lastOpen = open;
          if(open) hdr.classList.add('is-visible');
          else hdr.classList.remove('is-visible');
        }
      }
      var obs = new MutationObserver(checkBubbleState);
      obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter:['isOpen','data-state'] });

      // Fallback: clicar no botão do bubble → mostrar header
      document.addEventListener('click', function(e){
        var tgt = e.target;
        // Atravessa shadow DOM se possível
        var path = e.composedPath && e.composedPath();
        var inBubble = false;
        if(path){
          for(var i=0;i<path.length;i++){
            var el = path[i];
            if(el && el.tagName && el.tagName.toLowerCase() === 'typebot-bubble'){ inBubble = true; break; }
          }
        } else {
          inBubble = !!(tgt.closest && tgt.closest('typebot-bubble'));
        }
        if(inBubble){
          // Pequeno delay pra deixar o popup renderizar
          setTimeout(function(){ hdr.classList.add('is-visible'); }, 100);
        }
      }, true);
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

    // ===== UTM capture =====
    var utmData = (function(){
      var p = new URLSearchParams(window.location.search);
      return {
        utm_source:   p.get('utm_source')   || '',
        utm_medium:   p.get('utm_medium')   || '',
        utm_campaign: p.get('utm_campaign') || '',
        utm_term:     p.get('utm_term')     || '',
        utm_content:  p.get('utm_content')  || '',
        gclid:        p.get('gclid')        || '',
        fbclid:       p.get('fbclid')       || ''
      };
    })();

    // ===== IP lookup =====
    var userIP = '';
    fetch('https://api.ipify.org?format=json')
      .then(function(r){ return r.json(); })
      .then(function(d){ userIP = d.ip; })
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
          tipo_plano:          data.tipodeplano || '',
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
          id:       utmData.utm_campaign || '',
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
          var dl = { event: 'lead_submit', form_id: cfg.formId, bot_score: botScore };
          if(cfg.unidade) dl.unidade = cfg.unidade;
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
