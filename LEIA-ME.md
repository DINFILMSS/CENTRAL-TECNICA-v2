# Central Técnica by Don — aplicativo para Windows e Mac

Esta pasta é o projeto do aplicativo. Os instaladores são gerados de graça pelo GitHub, na nuvem, e publicados numa página de downloads. Quem instala o app recebe as versões novas automaticamente.

## 1. Deixar o repositório público (uma vez)

A atualização automática e a página de downloads só funcionam com o repositório público.

1. No repositório, clique em **Settings**.
2. Role até **Danger Zone** e clique em **Change visibility → Change to public**.
3. Confirme.

O código do app fica visível, mas ninguém consegue alterar nada nele sem a sua senha.

## 2. Publicar uma versão nova

Faça isso sempre que receber um `index.html` novo.

1. Abra a pasta `app` do repositório, clique em **Add file → Upload files**, envie o `index.html` novo e clique em **Commit changes**.
2. Abra o `package.json`, clique no lápis ✏️ e aumente o número em `"version"`, por exemplo de `45.1.0` para `45.2.0`. Clique em **Commit changes**.
3. Na aba **Actions**, a tarefa **Gerar instaladores** começa sozinha e leva de 15 a 20 minutos.
4. Quando aparecer o ✓ verde, a versão está publicada na página **Releases** do repositório.

Se aparecer o erro "A versão … já foi publicada", você esqueceu de aumentar o número no `package.json`.

## 3. Página de downloads para as outras pessoas

Mande este link para quem quiser usar o app. Troque `SEU-USUARIO` pelo seu usuário do GitHub:

`https://github.com/SEU-USUARIO/central-tecnica/releases/latest`

Lá aparecem:
- **Central-Tecnica-Setup-….exe** → Windows
- **Central-Tecnica-…-mac.dmg** → Mac (Intel e Apple Silicon)

## 4. Instalar

**Windows**
1. Abra o `Central-Tecnica-Setup-…exe`.
2. Se aparecer "O Windows protegeu o computador", clique em **Mais informações → Executar assim mesmo**. O aviso aparece porque o app não tem certificado de assinatura pago.
3. Siga o instalador. Ele cria atalho na Área de Trabalho e no Menu Iniciar.

**Mac**
1. Abra o `.dmg` e arraste **Central Técnica** para **Aplicativos**.
2. Na primeira vez que abrir, se o Mac bloquear, vá em **Ajustes do Sistema → Privacidade e Segurança**, role até o aviso da Central Técnica e clique em **Abrir Mesmo Assim**.

## 5. Como funciona a atualização automática

- O app procura versão nova ao abrir e a cada 4 horas. Também dá para procurar pelo menu **Ajuda → Procurar atualizações…**.
- **Windows:** a versão nova é baixada sozinha e o app pergunta se pode reiniciar. Se a pessoa escolher "Depois", ela é instalada quando o app for fechado.
- **Mac:** o app avisa que tem versão nova e abre a página de downloads; a pessoa baixa o `.dmg` e substitui o app em Aplicativos. A instalação sozinha no Mac exige o certificado de desenvolvedor da Apple (US$ 99 por ano). Se um dia você fizer essa conta, dá para ligar.
- Os projetos nunca se perdem na atualização.

## 6. Onde ficam os dados

- O app salva sozinho a cada alteração.
- Ele também guarda uma cópia por dia dos últimos 30 dias em **Documentos › Central Técnica › Backups**.
- Os projetos da versão de navegador **não** passam sozinhos para o app. Na versão de navegador, vá em **Backup e importação → Baixar backup de todos**. No app, use **Arquivo → Abrir backup…**.

## O que o aplicativo tem a mais que a versão de navegador

- Atualização automática.
- Salvamento automático em arquivo e backups diários.
- **Salvar PDF** direto no caderno técnico e nas folhas de câmera, sem passar pela janela de impressão.
- Monitor da direção em janela própria, que pode ir para outro monitor.
- Menus com atalhos: Ctrl/Cmd+N novo projeto, +O abrir backup, +S salvar backup, +P caderno técnico, +K busca rápida, +1…4 telas principais, F9 ON AIR.
- Fontes embutidas: funciona 100% offline.
