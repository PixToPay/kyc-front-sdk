## PixFace SDK

SDK para embutir o fluxo de KYC/Face da PixtoPay em qualquer página web via modal + iframe.

### Instalação rápida

Inclua o script e inicialize:

```html
<script src="./pixface-sdk.js"></script>
<script>
  const sdk = PixFace({
    apiURL: "https://kyc-api.pixtopay.com.br",
    integrationId: "<INTEGRATION_ID>",
    api_key: "<API_KEY>",
    kycFrontOrigin: "https://face.pixtopay.com.br",
    lang: "pt",
    onSuccess: (name, data) => console.log("success", name, data),
    onError: (name, data) => console.log("error", name, data),
    eventHandler: (evt) => console.log("event", evt),
  });
  sdk.mount();
</script>
```

### Campos e ações padrão

- Campos (IDs):
  - `pixface-hydrate-cpf` (CPF somente dígitos)
  - `pixface-hydrate-referenceId` (opcional)
  - `pixface-hydrate-action` (opcional)
- Ações (IDs):
  - `pixface-action-verify`
  - `pixface-action-verify-sow-flow`
  - `pixface-action-faceindex`
  - `pixface-action-close_dialog`

Você pode alterar os IDs em runtime:

```js
sdk.changeFieldId({ fieldName: "cpf", fieldId: "meu-campo-cpf" });
sdk.changeActionId({ actionName: "verify", actionId: "meu-botao-verify" });
```

### Métodos públicos

- `mount()` – injeta estilos, constrói o modal, associa handlers e listeners.
- `verifyDocument({ cpf, referenceId?, action? })` – inicia o fluxo padrão.
- `openVerifySOWFlow({ ... })` – inicia o fluxo SOW.
- `startFaceIndex({ ... })` – inicia liveness apenas.
- `closeModal()` – fecha o modal e limpa o `src` do iframe.
- `setLang(lang)` – atualiza o idioma (o front atual ignora `lang`).
- `checkCPF(cpf)` – valida CPF (somente dígitos).

### Opções (todas opt‑in e compatíveis)

- `lockBodyScroll` (boolean, default: `true`)
  - Bloqueia o scroll do body enquanto o modal estiver aberto.

- `injectResponsiveStyles` (boolean, default: `false`)
  - Injeta uma variável CSS `--pf-popup-height` e usa fallback para iOS (`dvh`).

- `forceMobileViewport` (boolean, default: `false`)
  - Força largura “mobile” no host mesmo em desktop.
  - Use com `mobileMaxWidth` (ex.: `480`).

- `mobileMaxWidth` (number|null, default: `null`)
  - Largura máxima do container do modal quando `forceMobileViewport` estiver ativo.

- `showCloseButton` (boolean|null, default: `null`)
  - `null`: segue `autoOpenValidation` existente.
  - `true`/`false`: força exibir/ocultar o botão de fechar.

- `optimizeResizeUpdates` (boolean, default: `true`)
  - Debounce de 150ms para cálculos de layout em `resize`.

- `strictLang` (boolean, default: `false`) e `allowedLangs` (array, default: `["pt","en","es"]`)
  - Quando ativo, normaliza o idioma recebido para a lista permitida.

Outras já existentes:

- `enableRedirect` (boolean) – reservado; seu front não emite redirect.
- `allowedPostMessageOrigins` (string[]) – por padrão usa `kycFrontOrigin`.

### Eventos

O iframe emite (via `postMessage`) ao host:

- `stepUpdate`: `{ type: "stepUpdate", step: number }`
- `processCompleted`: `{ type: "processCompleted", status: "approved"|"rejected"|"pending", reason?: string }`

Use `eventHandler` para observar:

```js
const sdk = PixFace({
  ...,
  eventHandler: (evt) => {
    if (evt.type === "stepUpdate") {
      console.log("Step:", evt.step);
    }
    if (evt.type === "processCompleted") {
      console.log("Status:", evt.status, evt.reason);
    }
  },
});
```

O SDK também chama `onSuccess(name, data)` e `onError(name, data)` para eventos genéricos de sucesso/erro quando aplicável.

### Segurança

- O host valida `event.origin` contra `allowedPostMessageOrigins`/`kycFrontOrigin`.
- O iframe é criado com `allow="camera; geolocation; microphone; clipboard-write; fullscreen"` e `referrerpolicy="origin"`.

### Dicas de UX

- Em desktop, ative `forceMobileViewport: true` e `mobileMaxWidth: 480` para garantir que o front do iframe opere no modo “mobile”.
- Ative `injectResponsiveStyles: true` para estabilidade de altura em iOS.
- Mantenha `lockBodyScroll: true` para foco total no fluxo.

### Build/minificação

Para gerar o arquivo minificado:

```bash
npx --yes terser pixface-sdk.js -c -m -o pixface-sdk.min.js
```

Opcional com sourcemap:

```bash
npx --yes terser pixface-sdk.js -c -m --source-map "content=inline,filename=pixface-sdk.min.js.map" -o pixface-sdk.min.js
```

### Demo

Veja `demo.html` para um exemplo completo com as novas opções ligadas.


