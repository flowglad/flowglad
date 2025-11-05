<p align="center">
  <a href="https://github.com/flowglad/flowglad">
    <img width="1440" alt="1440w light" src="https://github.com/user-attachments/assets/4dea09ea-91c9-4233-a4ac-cef513bbb927" />
  </a>

  <h3 align="center">Flowglad</h3>

  <p align="center">
    A maneira mais fácil de ganhar dinheiro na internet.
    <br />
    <a href="https://flowglad.com"><strong>Comece Agora</strong></a>
    <br />
    <br />
    ·
    <a href="https://docs.flowglad.com/quickstart">Início Rápido</a>
    ·
    <a href="https://flowglad.com">Website</a>
    ·
    <a href="https://github.com/flowglad/flowglad/issues">Issues</a>
    ·
    <a href="https://app.flowglad.com/invite-discord">Discord</a>
  </p>
</p>
<p align="center">
  <a href="https://app.flowglad.com/invite-discord">
    <img src="https://img.shields.io/badge/chat-on%20discord-7289DA.svg" alt="Junte-se à Comunidade no Discord" />
  </a>
  <a href="https://twitter.com/intent/follow?screen_name=flowglad">
    <img src="https://img.shields.io/twitter/follow/flowglad.svg?label=Follow%20@flowglad" alt="Siga @flowglad" />
  </a>
  <a href="https://www.ycombinator.com/companies/flowglad">
    <img src="https://img.shields.io/badge/Backed%20by%20YC-FF4000" alt="Apoiado pela YC" />
  </a>
</p>
<div align="center">
  <p>
    O processador de pagamentos para programação em linguagem natural.
  </p>
  <p>
    Modelos de precificação infinitos, uma única fonte de verdade, zero webhooks.
  </p>
</div>

![nav-demo](/./public/nat-lang-demo.gif)

## Funcionalidades

- **Sem Estado por Padrão** Diga adeus aos webhooks, tabelas de banco de dados de `"assinaturas"`, colunas `customer_id`, variáveis de ambiente `PRICE_ID`, ou mapeamento manual de seus planos para preços e funcionalidades.
- **Fonte Única de Verdade:** Leia o estado de cobrança mais recente do seu cliente diretamente do Flowglad, incluindo acesso a recursos e créditos de medidores de uso
- **Acesse Dados Usando Seus IDs:** Consulte o estado do cliente usando os IDs de usuário da sua autenticação. Referencie preços, recursos e medidores de uso através de slugs que você define.
- **SDK Full-Stack:** Acesse os dados do seu cliente no backend usando `flowgladServer.getBilling()`, ou no seu frontend React usando nosso hook `useBilling()`
- **Adaptável:** Itere novos modelos de precificação em modo de teste e publique-os em produção com um clique. Alterne modelos de precificação no seu aplicativo sem nenhuma reimplantação.

## Configuração

### Instalação

Primeiro, instale os pacotes Flowglad necessários com base na configuração do seu projeto:
```bash
# Projetos Next.js
pnpm install @flowglad/nextjs

# Projetos Vite
pnpm install @flowglad/react @flowglad/server
```

O Flowglad se integra fortemente com sua autenticação. Aqui estão alguns prompts que você pode usar para integrar o Flowglad, baseado no seu provedor de autenticação, em cerca de 30 segundos:

<details>
<summary><strong>Clerk</strong></summary>

```txt
Por favor, configure a cobrança para nosso aplicativo de acordo com as seguintes instruções. Note que isso assume um aplicativo Next.js. Se nosso projeto usa uma stack diferente, você precisará adaptá-lo adequadamente. Especificamente, você precisará mudar o seguinte:
`bash
# substitua @flowglad/nextjs por @flowglad/react e @flowglad/server
pnpm install @flowglad/react @flowglad/server # ou qualquer gerenciador de pacotes que usamos
`

`ts
// substitua todas as importações de @flowglad/nextjs/server -> @flowglad/server
import { FlowgladServer } from '@flowglad/server'
`

1. Crie um arquivo `flowglad.ts em /src`, que se pareça com isto:

`// flowglad.ts
import { FlowgladServer } from '@flowglad/nextjs/server'
import { currentUser } from '@clerk/nextjs/server'

export const flowgladServer = new FlowgladServer({
  clerk: {
    currentUser,
  },
})
`
<Important>
 Se seus clientes são organizações em vez de usuários individuais, você deve usar o método `getRequestingCustomer`:

`ts flowglad.ts
import { FlowgladServer } from '@flowglad/nextjs/server'

export const flowgladServer = new FlowgladServer({
  getRequestingCustomer: () => {
   // qualquer lógica que você usa atualmente para 
   // derivar a organização associada a uma determinada solicitação
  }
})

`
</Important>

2. Crie um manipulador de rota em `/api/flowglad/[...path]/route.ts`:

`// /api/flowglad/[...path]/route.ts
'use server'
import { createAppRouterRouteHandler } from '@flowglad/nextjs/server'
import { flowgladServer } from '@/flowglad'

const routeHandler = createAppRouterRouteHandler(flowgladServer)

export { routeHandler as GET, routeHandler as POST }
`
3. Adicione o seguinte ao arquivo `app/layout.tsx.` Preserve o código JSX do layout existente. Apenas:

- Obtenha o usuário via clerk auth
- Monte o `FlowgladProvider` com o usuário
- Passe o usuário para o `FlowgladProvider`

`
// /app/layout.tsx
import { currentUser } from '@clerk/nextjs/server'
// ... código existente ...
// dentro do componente layout:
const user = await currentUser()

return (

<FlowgladProvider loadBilling={!!user}>
  {/* ... JSX do layout existente ... */}
  {children}
  {/* ... JSX do layout existente ... */}
</FlowgladProvider>
) `
```
</details>
<details>
<summary><strong>Autenticação Supabase</strong></summary>

```txt
Por favor, configure a cobrança para nosso aplicativo de acordo com as seguintes instruções. Note que isso assume um aplicativo Next.js. Se nosso projeto usa uma stack diferente, você precisará adaptá-lo adequadamente. Especificamente, você precisará mudar o seguinte:
`bash
# substitua @flowglad/nextjs por @flowglad/react e @flowglad/server
pnpm install @flowglad/react @flowglad/server # ou qualquer gerenciador de pacotes que usamos
`

`ts
// substitua todas as importações de @flowglad/nextjs/server -> @flowglad/server
import { FlowgladServer } from '@flowglad/server'
`

1. Crie um arquivo `flowglad.ts` no diretório do seu projeto, que se pareça com isto:

`ts
import { FlowgladServer } from '@flowglad/nextjs/server'
import { createClient } from '@/utils/supabase/server' // ou onde quer que você armazene o construtor do cliente servidor supabase.

export const flowgladServer = new FlowgladServer({
  supabaseAuth: {
    client: createClient,
  },
})
`

#### NOTA IMPORTANTE
Se seus clientes são organizações em vez de usuários individuais, você deve usar o método inicializador `getRequestingCustomer`:
`ts flowglad.ts
import { FlowgladServer } from '@flowglad/nextjs/server'

export const flowgladServer = new FlowgladServer({
  getRequestingCustomer: () => {
   // qualquer lógica que você usa atualmente para 
   // derivar a organização associada a uma determinada requisição
  }
})

`

2. Crie um manipulador de rota em `/api/flowglad/[...path]/route.ts`:

`ts
import { createAppRouterRouteHandler } from '@flowglad/nextjs/server'
import { flowgladServer } from '@/flowglad'

const routeHandler = createAppRouterRouteHandler(flowgladServer)

export { routeHandler as GET, routeHandler as POST }
`

3. Adicione o seguinte ao arquivo `app/layout.tsx`. Preserve o código JSX do layout existente. Apenas:

- Obtenha o usuário via supabase auth
- Monte o `FlowgladProvider` com o usuário
- Passe o usuário para o `FlowgladProvider`

`tsx
// /app/layout.tsx
import { createClient } from '@/utils/supabase/server' // ou onde quer que criemos nosso cliente supabase
// ... código existente ...
// dentro do componente layout:
const supabase = createClient()
const {
data: { user }
} = await supabase.auth.getUser()

return (
<FlowgladProvider loadBilling={!!user}>
  {/* ... JSX do layout existente ... */}
  {children}
  {/* ... JSX do layout existente ... */}
</FlowgladProvider>
)
`
```
</details>
<details>
<summary><strong>Próxima autenticação</strong></summary>

```txt
Por favor, configure a cobrança para nosso aplicativo de acordo com as seguintes instruções. Note que isso assume um aplicativo Next.js. Se nosso projeto usa uma stack diferente, você precisará adaptá-lo adequadamente. Especificamente, você precisará mudar o seguinte:
`bash
# substitua @flowglad/nextjs por @flowglad/react e @flowglad/server
pnpm install @flowglad/react @flowglad/server # ou qualquer gerenciador de pacotes que usamos
`

`ts
// substitua todas as importações de @flowglad/nextjs/server -> @flowglad/server
import { FlowgladServer } from '@flowglad/server'
`

1. Crie um arquivo `flowglad.ts` em /src, que se pareça com isto:

`// flowglad.ts
import { FlowgladServer } from '@flowglad/nextjs/server'
import { auth } from '@/auth' // your initialized, configured NextAuth
client

export const flowgladServer = new FlowgladServer({
  nextAuth: {
    auth,
  },
})
`

<Important>
Se seus clientes são organizações em vez de usuários individuais, você deve usar o método inicializador `getRequestingCustomer`:

`ts flowglad.ts
import { FlowgladServer } from '@flowglad/nextjs/server'

export const flowgladServer = new FlowgladServer({
  getRequestingCustomer: () => {
   // qualquer lógica que você usa atualmente para 
   // derivar a organização associada a uma determinada solicitação
  }
})

`
</Important>

2. Crie um manipulador de rota em `/api/flowglad/[...path]/route.ts`:

`// /api/flowglad/[...path]/route.ts
'use server'
import { createAppRouterRouteHandler } from '@flowglad/nextjs/server'
import { flowgladServer } from '@/flowglad'

const routeHandler = createAppRouterRouteHandler(flowgladServer)

export { routeHandler as GET, routeHandler as POST }
`

3. Adicione o seguinte ao arquivo app/layout.tsx. Preserve o código JSX do layout existente. Apenas:

- Obtenha a sessão via next-auth
- Monte o `FlowgladProvider` com o status da sessão
- Envolva tudo no SessionProvider

`
// /app/layout.tsx
import { auth } from '@/auth'
import { SessionProvider } from 'next-auth/react'
// ... código existente ...
// dentro do componente layout:
const session = await auth()

return (

<SessionProvider session={session}>
  <FlowgladProvider
    loadBilling={session?.status === 'authenticated'}
  >
    {/* ... JSX do layout existente ... */}
    {children}
    {/* ... JSX do layout existente ... */}
  </FlowgladProvider>
</SessionProvider>
) `
```
</details>

## Cobertura de SDKs de Linguagens & Frameworks

O Flowglad visa ter suporte de primeira classe para cada linguagem e framework em que os desenvolvedores constroem.

Se ainda não chegamos à sua ferramenta de escolha, temos uma [API REST](https://docs.flowglad.com/api-reference/introduction) que qualquer pessoa pode integrar como alternativa.

Aqui está nosso progresso até agora. Se você não vê seu framework ou linguagem aqui, por favor nos avise em [nosso Discord](https://discord.gg/zsvkVtTXge)!

| Framework   | Suporte |
|-------------|---------|
| Next.js     | ✅      |
| Express     | ✅      |
| React       | ✅      |
| Remix       | 🟡      |
| Astro       | 🟡      |
| Hono        | 🟡      |
| Vue         | 🟡      |

## Serviços de Autenticação
O Flowglad se integra fortemente com sua camada de autenticação, mapeando automaticamente sua noção de clientes para nossa noção de clientes. Para tornar isso sem esforço, temos adaptadores para muitos serviços de autenticação populares.

Se você tem uma configuração de autenticação personalizada ou precisa suportar cobrança baseada em equipes, você pode dizer ao Flowglad como derivar o registro do cliente no seu servidor definindo `getRequestingCustomer`.

| Serviço de Autenticação | Suporte |
|-------------------------|---------|
| Supabase Auth           | ✅      |
| Clerk                   | ✅      |
| NextAuth                | ✅      |
| Better Auth             | 🟡      |
| Firebase Auth           | 🟡      |


## Construído Com

- [Next.js](https://nextjs.org/?ref=flowglad.com)
- [tRPC](https://trpc.io/?ref=flowglad.com)
- [React.js](https://reactjs.org/?ref=flowglad.com)
- [Tailwind CSS](https://tailwindcss.com/?ref=flowglad.com)
- [Drizzle ORM](https://orm.drizzle.team/?ref=flowglad.com)
- [Zod](https://zod.dev/?ref=flowglad.com)
- [Trigger.dev](https://trigger.dev/?ref=flowglad.com)
- [Supabase](https://supabase.com/?ref=flowglad.com)
- [Better Auth](https://better-auth.com/?ref=flowglad.com)

## Objetivos do Projeto

Nos últimos 15 anos, o mercado deu aos desenvolvedores mais opções do que nunca para cada parte de sua stack. Mas quando se trata de pagamentos, praticamente não houve novos entrantes. As opções existentes são limitadas, e quase todas exigem que falemos com vendas para até mesmo configurar uma conta. Quando se trata de pagamentos _self-service_, há ainda menos opções.

O resultado? A experiência do desenvolvedor e o custo de pagamentos praticamente não melhoraram nesse tempo. O melhor DX em pagamentos parece estranhamente suspenso em 2015. Enquanto isso, desfrutamos de melhorias constantes em autenticação, computação, hospedagem e praticamente tudo mais.

O Flowglad quer mudar isso.

Estamos construindo uma camada de pagamentos que permite a você:
- Pensar em cobrança e pagamentos o mínimo possível
- Gastar o mínimo de tempo possível em integração e manutenção
- Obter o máximo possível da sua única integração
- Desbloquear mais provedores de pagamento a partir de uma única integração

Alcançar essa missão levará tempo. Será difícil. Pode até deixar algumas pessoas infelizes. Mas com a IA trazendo cada vez mais desenvolvedores online e explodindo a complexidade da cobrança de startups, a necessidade é mais urgente do que nunca.