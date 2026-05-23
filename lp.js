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
      unidade:       form.dataset.unidade       || ''
    };

    if(!cfg.operadora || !cfg.formId){
      console.warn('[lp.js] data-operadora e data-form-id são obrigatórios no <form id="leadForm">');
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
