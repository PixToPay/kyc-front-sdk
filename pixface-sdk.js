/*
 * PixFace SDK — SDK simples para embutir o fluxo KYC/Face da PixtoPay
 * Version: 1.0.0
 * Build date: 2025-10-30
 *
 * Exemplo rápido de uso:
 * <div id="pixface-root"></div>
 * <input id="pixface-hydrate-cpf" />
 * <button id="pixface-action-verify">Verificar</button>
 * <script src="https://cdn.exemplo.com/sdk/pixface-sdk.js"></script>
 * <script>
 *   const sdk = PixFace({
 *     apiURL: "https://api.dev.pixtopay.com",
 *     publicKey: "pk_dev_xxxxxxxxx",
 *     kycFrontOrigin: "https://kyc.dev.pixtopay.com",
 *     lang: "pt",
 *     enableRedirect: false,
 *     onSuccess: (name, data) => console.log("success:", name, data),
 *     onError: (name, data) => console.log("error:", name, data),
 *     eventHandler: (evt) => console.log("event:", evt),
 *   });
 *   sdk.changeFieldId({ fieldName: "cpf", fieldId: "pixface-hydrate-cpf" });
 *   sdk.changeActionId({ actionName: "verify", actionId: "pixface-action-verify" });
 *   sdk.mount();
 * </script>
 */

(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    // AMD
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    // CommonJS
    module.exports = factory();
  } else {
    // Browser global
    root.PixFace = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DEFAULTS = {
    apiURL: "https://api.dev.pixtopay.com",
    kycFrontOrigin: "https://kyc.dev.pixtopay.com",
    lang: "pt",
    onSuccess: null,
    onError: null,
    eventHandler: null,
    enableRedirect: false,
    autoOpenValidation: false,
    allowedPostMessageOrigins: null, // defaults to [kycFrontOrigin]
    integrationId: null, // REQUIRED
    api_key: null, // preferred required header name
    publicKey: null, // legacy compatibility
    // Safe, opt-in UX improvements (defaults keep current behavior)
    lockBodyScroll: true, // já era o comportamento atual; pode ser desligado
    injectResponsiveStyles: false, // injeta --popup-height e ajusta dvh (iOS)
    forceMobileViewport: false, // força largura máxima custom no content
    mobileMaxWidth: null, // ex.: 480 (px). Se null, mantém CSS padrão (425px)
    showCloseButton: null, // null => segue autoOpenValidation; true/false força
    optimizeResizeUpdates: true, // debounce de resize para cálculos de layout
    strictLang: false, // valida/normaliza idioma recebido
    allowedLangs: ["pt", "en", "es"],
  };

  var DEFAULT_FIELD_IDS = {
    cpf: "pixface-hydrate-cpf",
    referenceId: "pixface-hydrate-referenceId",
    action: "pixface-hydrate-action",
    email: "pixface-hydrate-email",
    phone: "pixface-hydrate-phone",
  };

  var DEFAULT_ACTION_IDS = {
    verify: "pixface-action-verify",
    "verify-sow-flow": "pixface-action-verify-sow-flow",
    faceindex: "pixface-action-faceindex",
    close_dialog: "pixface-action-close_dialog",
  };

  var CSS_STRING =
    ".pf-dialog{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.5);z-index:999999;}" +
    '.pf-dialog[data-open="true"]{display:flex;}' +
    ".pf-dialog__content{position:relative;width:100%;max-width:425px;height:90dvh;max-height:900px;border-radius:12px;background:var(--pf-card,#ffffff);box-shadow:0 10px 30px rgba(0,0,0,.2);overflow:hidden;}" +
    "@media (max-width: 480px){.pf-dialog__content{width:95dvw;max-width:95dvw;height:90dvh;}}" +
    ".pf-dialog__close{position:absolute;top:8px;right:8px;background:var(--pf-muted,#f2f4f7);border:none;border-radius:8px;padding:8px 10px;cursor:pointer;color:var(--pf-dark,#1d2939);font-weight:600;}" +
    ".pf-hidden{display:none !important;}";

  function maskCpfForLog(cpfDigits) {
    if (!cpfDigits || cpfDigits.length < 3) return "***";
    return "***" + cpfDigits.slice(-3);
  }

  function normalizeCPF(value) {
    return (value || "").replace(/\D+/g, "").slice(0, 11);
  }

  function isValidCPF(cpfDigits) {
    var cpf = (cpfDigits || "").replace(/\D+/g, "");
    if (cpf.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(cpf)) return false;
    var sum = 0,
      rest,
      i;
    for (i = 1; i <= 9; i++)
      sum += parseInt(cpf.substring(i - 1, i), 10) * (11 - i);
    rest = (sum * 10) % 11;
    if (rest === 10 || rest === 11) rest = 0;
    if (rest !== parseInt(cpf.substring(9, 10), 10)) return false;
    sum = 0;
    for (i = 1; i <= 10; i++)
      sum += parseInt(cpf.substring(i - 1, i), 10) * (12 - i);
    rest = (sum * 10) % 11;
    if (rest === 10 || rest === 11) rest = 0;
    if (rest !== parseInt(cpf.substring(10, 11), 10)) return false;
    return true;
  }

  function buildQS(params) {
    var search = [];
    for (var k in params) {
      if (!Object.prototype.hasOwnProperty.call(params, k)) continue;
      var v = params[k];
      if (v === undefined || v === null || v === "") continue;
      search.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(v)));
    }
    return search.length ? "?" + search.join("&") : "";
  }

  function PixFace(userOptions) {
    var options = optionsMerge(DEFAULTS, userOptions || {});
    if (!options.integrationId) {
      throw new Error("[PixFace] integrationId is required");
    }
    var effectiveKey = options.api_key || options.publicKey;
    if (!effectiveKey) {
      throw new Error("[PixFace] api_key is required");
    }
    if (
      !options.allowedPostMessageOrigins ||
      !Array.isArray(options.allowedPostMessageOrigins)
    ) {
      options.allowedPostMessageOrigins = [options.kycFrontOrigin];
    }

    var state = {
      mounted: false,
      styleEl: null,
      rootEl: null,
      dialogEl: null,
      contentEl: null,
      iframeEl: null,
      fieldIds: cloneShallow(DEFAULT_FIELD_IDS),
      actionIds: cloneShallow(DEFAULT_ACTION_IDS),
      currentGuid: null,
      currentFeature: null,
      messageListener: null,
      lang: options.lang || "pt",
    };

    function logWarn() {
      var args = Array.prototype.slice.call(arguments);
      try {
        console.warn.apply(console, ["[PixFace]"].concat(args));
      } catch (_) {}
    }

    function safeOnSuccess(name, data) {
      if (typeof options.onSuccess === "function")
        try {
          options.onSuccess(name, data);
        } catch (_) {}
    }
    function safeOnError(name, data) {
      if (typeof options.onError === "function")
        try {
          options.onError(name, data);
        } catch (_) {}
    }
    function safeEventHandler(evt) {
      if (typeof options.eventHandler === "function")
        try {
          options.eventHandler(evt);
        } catch (_) {}
    }

    function injectCSS() {
      if (state.styleEl) return;
      var style = document.createElement("style");
      style.setAttribute("data-pixface", "true");
      style.type = "text/css";
      var cssVars =
        ":root{--pf-primary:#a9d001;--pf-dark:#1d2939;--pf-bg:#f9fafb;--pf-success:#22c55e;--pf-warning:#f59e0b;--pf-error:#ef4444;--pf-card:#ffffff;--pf-muted:#f2f4f7;}";
    style.appendChild(document.createTextNode(cssVars + CSS_STRING));
      document.head.appendChild(style);
      state.styleEl = style;
    }

    function ensureDOM() {
      if (state.rootEl && state.dialogEl && state.contentEl) return;
      var root = document.getElementById("pixface-root");
      if (!root) {
        root = document.createElement("div");
        root.id = "pixface-root";
        document.body.appendChild(root);
      }
      var dialog = document.createElement("div");
      dialog.className = "pf-dialog";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");

      var content = document.createElement("div");
      content.className = "pf-dialog__content";
      // force mobile viewport width if requested (host-side container only)
      if (options.forceMobileViewport && typeof options.mobileMaxWidth === "number") {
        try {
          content.style.maxWidth = String(options.mobileMaxWidth) + "px";
          content.style.width = "100%";
          content.style.margin = "0 auto";
        } catch (_) {}
      }

      var iframe = document.createElement("iframe");
      iframe.id = "pixface-iframe";
      iframe.setAttribute(
        "allow",
        "camera; geolocation; microphone; clipboard-write; fullscreen"
      );
      iframe.setAttribute("referrerpolicy", "origin");
      iframe.setAttribute("style", "width:100%; height:100%; border:0;");

      var closeBtn = document.createElement("button");
      closeBtn.id = state.actionIds.close_dialog;
      closeBtn.className =
        "pf-dialog__close" + (shouldHideCloseButton() ? " pf-hidden" : "");
      closeBtn.type = "button";
      closeBtn.textContent = "×";

      content.appendChild(closeBtn);
      content.appendChild(iframe);
      dialog.appendChild(content);
      root.appendChild(dialog);

      state.rootEl = root;
      state.dialogEl = dialog;
      state.contentEl = content;
      state.iframeEl = iframe;
    }

    function shouldHideCloseButton() {
      if (typeof options.showCloseButton === "boolean") {
        return options.showCloseButton ? false : true;
      }
      return !!options.autoOpenValidation;
    }

    // Responsive popup-height for better iOS dvh handling (opt-in)
    var resizeTimer = null;
    function updatePopupHeightVar() {
      try {
        var toolbarHeight = window.screen.availHeight - window.innerHeight;
        var popupHeight = window.screen.availHeight - (toolbarHeight > 0 ? toolbarHeight : 0);
        document.documentElement.style.setProperty("--pf-popup-height", String(popupHeight) + "px");
      } catch (_) {}
    }
    function attachResizeHandler() {
      if (!options.injectResponsiveStyles) return;
      var handler = function () {
        if (!options.optimizeResizeUpdates) {
          updatePopupHeightVar();
          return;
        }
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
          updatePopupHeightVar();
        }, 150);
      };
      window.addEventListener("resize", handler);
      // initial compute
      updatePopupHeightVar();
    }

    function setDialogOpen(open, refId) {
      if (!state.dialogEl) return;
      if (open) {
        state.dialogEl.setAttribute("data-open", "true");
        if (options.lockBodyScroll) document.body.style.overflow = "hidden";
        try {
          // focus management: move focus into dialog on open
          state.dialogEl.focus && state.dialogEl.focus();
        } catch (_) {}
        safeEventHandler({ name: "modal", status: "open", refId: refId });
      } else {
        state.dialogEl.setAttribute("data-open", "false");
        state.dialogEl.style.display = "";
        if (options.lockBodyScroll) document.body.style.overflow = "";
        safeEventHandler({ name: "modal", status: "close", refId: refId });
      }
    }

    function readInputValue(inputId) {
      if (!inputId) return "";
      var el = document.getElementById(inputId);
      if (!el) return "";
      return (el.value || "").toString();
    }

    function setInvalidInput(inputId, invalid) {
      var el = document.getElementById(inputId);
      if (!el) return;
      if (invalid) {
        el.setAttribute("data-pixface-invalid", "true");
        try {
          el.focus();
        } catch (_) {}
      } else {
        el.removeAttribute("data-pixface-invalid");
      }
    }

    function setButtonsLoading(actionNames, loading) {
      for (var i = 0; i < actionNames.length; i++) {
        var name = actionNames[i];
        var btnId = state.actionIds[name];
        if (!btnId) continue;
        var btn = document.getElementById(btnId);
        if (!btn) continue;
        if (loading) {
          btn.setAttribute("data-pixface-loading", "true");
          btn.disabled = true;
        } else {
          btn.removeAttribute("data-pixface-loading");
          btn.disabled = false;
        }
      }
    }

    function createSession(params) {
      var cpf = normalizeCPF(params.cpf);
      var url = options.apiURL.replace(/\/$/, "") + "/customer/register";
      var body = { cpf: cpf, integration_id: String(options.integrationId) };

      var headers = { "Content-Type": "application/json" };
      if (effectiveKey)
        headers["Authorization"] = "Bearer " + String(effectiveKey);

      return fetch(url, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(body),
      })
        .then(function (res) {
          if (!res.ok) {
            return res.text().then(function (t) {
              var err = { status: res.status, body: t };
              safeOnError("bad_request", err);
              throw err;
            });
          }
          return res.json();
        })
        .then(function (json) {
          if (!json || !json.onboarding_id) {
            var err = { reason: "invalid_response", json: json };
            safeOnError("invalid_response", err);
            throw err;
          }
          // use onboarding_id as guid for iframe
          return String(json.onboarding_id);
        })
        .catch(function (err) {
          logWarn("session error for CPF", maskCpfForLog(cpf), err);
          if (!err || !err.reason) safeOnError("network", err);
          throw err;
        });
    }

    function buildIframeSrc(
      guid,
      feature,
      lang,
      referenceId,
      action,
      onlyLiveness
    ) {
      var base = options.kycFrontOrigin.replace(/\/$/, "") + "/";
      var qs = buildQS({
        guid: guid,
        step: 1,
        lang: lang,
        refId: referenceId,
        action: action,
        onlyliveness: onlyLiveness ? 1 : undefined,
      });
      return base + qs;
    }

    function openModalWithGuid(params) {
      var src = buildIframeSrc(
        params.guid,
        params.feature,
        state.lang,
        params.referenceId,
        params.action,
        params.onlyliveness
      );
      if (!state.iframeEl) return;
      state.iframeEl.src = src;
      state.currentGuid = params.guid;
      state.currentFeature = params.feature;
      setDialogOpen(true, params.referenceId);
    }

    function attachMessageListener() {
      if (state.messageListener) return;
      var listener = function (event) {
        try {
          if (!event || !event.origin) return;
          if (options.allowedPostMessageOrigins.indexOf(event.origin) === -1)
            return;
          var data = event.data;
          if (!data || typeof data !== "object") return;

          // Clipboard copy handshake
          if (
            data.type === "COPY_TO_CLIPBOARD" &&
            typeof data.text === "string"
          ) {
            var text = data.text;
            var doWrite =
              navigator && navigator.clipboard && navigator.clipboard.writeText
                ? navigator.clipboard.writeText(text)
                : Promise.reject(new Error("Clipboard API not available"));
            doWrite
              .then(function () {
                try {
                  event.source &&
                    event.source.postMessage(
                      { type: "COPY_SUCCESS" },
                      event.origin
                    );
                } catch (_) {}
              })
              .catch(function () {
                try {
                  event.source &&
                    event.source.postMessage(
                      { type: "COPY_FAILED" },
                      event.origin
                    );
                } catch (_) {}
              });
            return;
          }

          // Generic events
          var type = data.type || data.name;
          if (!type) return;

          if (
            type === "close-modal" ||
            type === "close_modal" ||
            type === "close"
          ) {
            closeModal({ refId: data.refId });
            return;
          }

          if (
            type === "redirect" &&
            options.enableRedirect &&
            data &&
            data.url
          ) {
            try {
              window.location.href = String(data.url);
            } catch (_) {}
            return;
          }

          if (type === "success") {
            safeOnSuccess(data.eventName || "success", data.payload);
            safeEventHandler(data);
            return;
          }

          if (type === "error") {
            safeOnError(data.eventName || "error", data.payload);
            safeEventHandler(data);
            return;
          }

          // Other events (stepUpdate, kyc-qrcode, faceindex-qrcode, ...)
          safeEventHandler(data);
        } catch (e) {
          logWarn("message handling error", e);
        }
      };
      window.addEventListener("message", listener);
      state.messageListener = listener;
    }

    function detachMessageListener() {
      if (!state.messageListener) return;
      try {
        window.removeEventListener("message", state.messageListener);
      } catch (_) {}
      state.messageListener = null;
    }

    function readMappedInputs() {
      var rawCpf = readInputValue(state.fieldIds.cpf);
      var cpf = normalizeCPF(rawCpf);
      var referenceId = readInputValue(state.fieldIds.referenceId) || undefined;
      var action = readInputValue(state.fieldIds.action) || undefined;
      return { cpf: cpf, referenceId: referenceId, action: action };
    }

    function handleVerifyLike(actionName, flow, feature, opts) {
      var inputs =
        opts && (opts.cpf || opts.referenceId || opts.action)
          ? {
              cpf: normalizeCPF(opts.cpf || ""),
              referenceId: opts.referenceId,
              action: opts.action,
            }
          : readMappedInputs();

      if (!isValidCPF(inputs.cpf)) {
        safeOnError("invalid_cpf", { field: "cpf" });
        setInvalidInput(state.fieldIds.cpf, true);
        return Promise.resolve();
      }
      setInvalidInput(state.fieldIds.cpf, false);
      setButtonsLoading([actionName], true);

      return createSession({ cpf: inputs.cpf })
        .then(function (guid) {
          openModalWithGuid({
            guid: guid,
            feature: feature,
            referenceId: inputs.referenceId,
            action: inputs.action,
            onlyliveness: feature === "faceindex",
          });
        })
        .catch(function (err) {
          // handled above via onError/log
          return null;
        })
        .finally(function () {
          setButtonsLoading([actionName], false);
        });
    }

    function attachActionHandlers() {
      // verify
      var elVerify = document.getElementById(state.actionIds.verify);
      if (elVerify)
        elVerify.onclick = function () {
          handleVerifyLike("verify", "default", "verify");
        };

      // verify sow flow
      var elSow = document.getElementById(state.actionIds["verify-sow-flow"]);
      if (elSow)
        elSow.onclick = function () {
          handleVerifyLike("verify-sow-flow", "kyc-sow", "sow");
        };

      // faceindex (liveness only)
      var elFace = document.getElementById(state.actionIds.faceindex);
      if (elFace)
        elFace.onclick = function () {
          handleVerifyLike("faceindex", "kyc-faceindex", "faceindex");
        };

      // close dialog
      var elClose = document.getElementById(state.actionIds.close_dialog);
      if (elClose)
        elClose.onclick = function () {
          closeModal({
            refId: readInputValue(state.fieldIds.referenceId) || undefined,
          });
        };
    }

    function mount() {
      return new Promise(function (resolve) {
        if (state.mounted) {
          resolve();
          return;
        }
        injectCSS();
        ensureDOM();
        if (options.injectResponsiveStyles) {
          // ensure the dialog/content consume the CSS var when present
          try {
            state.contentEl.style.height = "var(--pf-popup-height, 90dvh)";
          } catch (_) {}
          attachResizeHandler();
        }
        attachMessageListener();
        attachActionHandlers();
        state.mounted = true;
        if (options.autoOpenValidation) {
          // Reserved: can auto-open when guid available via URL
        }
        resolve();
      });
    }

    function setLang(lang) {
      var nextLang = lang || "pt";
      if (options.strictLang) {
        if (options.allowedLangs.indexOf(nextLang) === -1) {
          nextLang = options.allowedLangs[0] || "pt";
        }
      }
      state.lang = nextLang;
      if (state.iframeEl && state.iframeEl.src) {
        try {
          var url = new URL(state.iframeEl.src, window.location.href);
          url.searchParams.set("lang", state.lang);
          state.iframeEl.src = url.toString();
        } catch (_) {
          // Fallback: rebuild src if URL API fails
          if (state.currentGuid) {
            var src = buildIframeSrc(
              state.currentGuid,
              state.currentFeature || "verify",
              state.lang
            );
            state.iframeEl.src = src;
          }
        }
      }
    }

    function closeModal(opts) {
      setDialogOpen(false, opts && opts.refId);
      if (state.iframeEl) state.iframeEl.removeAttribute("src");
    }

    function changeFieldId(payload) {
      if (!payload || !payload.fieldName || !payload.fieldId) return;
      if (
        Object.prototype.hasOwnProperty.call(state.fieldIds, payload.fieldName)
      ) {
        state.fieldIds[payload.fieldName] = String(payload.fieldId);
      }
    }

    function changeActionId(payload) {
      if (!payload || !payload.actionName || !payload.actionId) return;
      if (
        Object.prototype.hasOwnProperty.call(
          state.actionIds,
          payload.actionName
        )
      ) {
        state.actionIds[payload.actionName] = String(payload.actionId);
        // reattach in case IDs changed post-mount
        attachActionHandlers();
      }
    }

    function verifyDocument(params) {
      return handleVerifyLike("verify", "default", "verify", params);
    }

    function openVerifySOWFlow(params) {
      return handleVerifyLike("verify-sow-flow", "kyc-sow", "sow", params);
    }

    function startFaceIndex(params) {
      return handleVerifyLike(
        "faceindex",
        "kyc-faceindex",
        "faceindex",
        params
      );
    }

    function checkCPF(cpf) {
      return isValidCPF(normalizeCPF(cpf));
    }

    return {
      // Public API
      mount: mount,
      setLang: setLang,
      closeModal: closeModal,
      changeFieldId: changeFieldId,
      changeActionId: changeActionId,
      verifyDocument: verifyDocument,
      openVerifySOWFlow: openVerifySOWFlow,
      startFaceIndex: startFaceIndex,
      checkCPF: checkCPF,

      // Minimal internal helpers (explicit export)
      normalizeCPF: normalizeCPF,
      isValidCPF: isValidCPF,
      createSession: createSession,
      openModalWithGuid: openModalWithGuid,
      attachActionHandlers: attachActionHandlers,
      attachMessageListener: attachMessageListener,
    };
  }

  function optionsMerge(base, extra) {
    var out = {};
    for (var k in base)
      if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
    for (var j in extra)
      if (Object.prototype.hasOwnProperty.call(extra, j)) out[j] = extra[j];
    return out;
  }

  function cloneShallow(obj) {
    var out = {};
    for (var k in obj)
      if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
    return out;
  }

  // UMD factory returns the factory
  return PixFace;
});
