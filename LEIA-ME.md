# Central Técnica by Don — aplicativo para Windows e Mac

Esta pasta é o projeto do aplicativo. Os instaladores (`.exe` para Windows e `.dmg` para Mac) são gerados de graça pelo GitHub, na nuvem. Você não precisa abrir o cmd nem o Terminal.

## 1. Gerar os instaladores (uma vez por versão)

1. Crie uma conta gratuita em **github.com** (ou entre na sua).
2. Clique em **New** (novo repositório). Dê o nome `central-tecnica`, deixe como **Private** e clique em **Create repository**.
3. Na página que abrir, clique em **uploading an existing file**.
4. Arraste para a página **tudo o que está dentro desta pasta**: `app`, `build`, `scripts`, `.github`, `main.js`, `preload.js`, `package.json`, `.gitignore` e este `LEIA-ME.md`. Depois clique em **Commit changes**.
   - No Mac, a pasta `.github` fica escondida. No Finder, aperte **Cmd + Shift + .** para mostrar os arquivos ocultos.
   - Se a pasta `.github` não subir: no GitHub, clique em **Add file → Create new file**, digite o nome `.github/workflows/instaladores.yml`, cole o conteúdo do arquivo de mesmo nome que está nesta pasta e clique em **Commit changes**.
5. Abra a aba **Actions**. A tarefa **Gerar instaladores** começa sozinha e leva de 10 a 15 minutos. Se ela não começar, clique em **Gerar instaladores → Run workflow**.
6. Quando aparecer o ✓ verde, clique na execução. No fim da página, em **Artifacts**, baixe:
   - **Central-Tecnica-Windows** → um zip com `Central-Tecnica-Setup-45.0.0.exe`
   - **Central-Tecnica-Mac** → um zip com `Central-Tecnica-45.0.0-mac.dmg` (funciona em Mac Intel e Apple Silicon)

## 2. Instalar

**Windows**
1. Abra o `Central-Tecnica-Setup-…exe`.
2. Se aparecer “O Windows protegeu o computador”, clique em **Mais informações → Executar assim mesmo**. O aviso aparece porque o app não tem certificado de assinatura pago.
3. Siga o instalador. Ele cria atalho na Área de Trabalho e no Menu Iniciar.

**Mac**
1. Abra o `.dmg` e arraste **Central Técnica** para **Aplicativos**.
2. Na primeira vez que abrir, se o Mac bloquear, vá em **Ajustes do Sistema → Privacidade e Segurança**, role até o aviso da Central Técnica e clique em **Abrir Mesmo Assim**. Depois disso o app abre direto.

## 3. Onde ficam os dados

- O app salva sozinho a cada alteração.
- Ele também guarda uma cópia por dia dos últimos 30 dias em **Documentos › Central Técnica › Backups**.
- Os projetos continuam salvos quando você instala uma versão nova por cima.
- Os projetos da versão de navegador **não** passam sozinhos para o app. Na versão antiga, vá em **Backup e importação → Baixar backup de todos**. No app, use **Arquivo → Abrir backup…**.

## 4. Atualizar para uma versão nova

1. No GitHub, abra a pasta `app` e substitua o `index.html` pela versão nova (**Add file → Upload files**).
2. Abra o `package.json` (ícone de lápis) e aumente o número em `"version"`, por exemplo de `45.0.0` para `45.1.0`.
3. Salve. Novos instaladores são gerados sozinhos na aba **Actions**.

## O que o aplicativo tem a mais que a versão de navegador

- Salvamento automático em arquivo e backups diários.
- **Salvar PDF** direto no caderno técnico e nas folhas de câmera, sem passar pela janela de impressão.
- Monitor da direção em janela própria, que pode ir para outro monitor.
- Menus com atalhos: Ctrl/Cmd+N novo projeto, +O abrir backup, +S salvar backup, +P caderno técnico, +K busca rápida, +1…4 telas principais, F9 ON AIR.
- Fontes embutidas: funciona 100% offline.
- O app lembra o tamanho e a posição da janela.
