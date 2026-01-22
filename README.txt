ETIQUETA SHOPEE — VALUE (PREMIUM)

O que esta versão resolve:
- Layout premium (dark + laranja Value) com duas colunas: controles à esquerda e preview à direita
- Botão “Processar” habilita/desabilita corretamente (antes ficava travado)
- Status com cores (ok/aviso/erro) e preview mais limpo
- Barra de progresso por página (fica claro em qual página está)
- Preview com modo Compacto/Grande + Tela cheia (modal)
- Clique em qualquer etiqueta do preview para abrir em tela cheia
- Atalhos: Ctrl+Enter (Processar) e Ctrl+S (Baixar PDF)
- Detecta quando está dentro de iframe (Elementor) e esconde o topo automaticamente

Arquivos:
- index.html
- etiquetas.css
- etiquetas.js

Como usar (standalone):
1) Abra o arquivo index.html no navegador (ou hospede em qualquer servidor).
2) Selecione o PDF da Shopee.
3) Escolha o preset e clique em “Processar”.
4) Clique em “Baixar PDF”.

Como colocar no WordPress (Elementor) — recomendado:
1) Hospede esta pasta em um lugar público no seu próprio domínio, por exemplo:
   /wp-content/uploads/ferramentas/etiqueta/
2) A URL final precisa apontar para: .../etiqueta/index.html
3) No Elementor, use um widget HTML e cole um iframe assim:

<iframe
  src="https://SEU-DOMINIO/wp-content/uploads/ferramentas/etiqueta/index.html"
  style="width:100%;height:980px;border:0;border-radius:22px;overflow:hidden"
  loading="lazy"
  referrerpolicy="no-referrer"
></iframe>

Dicas:
- Impressão: use escala 100% (não “ajustar/encaixar na página”).
- Se o PDF vier em 4 por folha, use o preset “A4 (4 por página)”.
- Para alterar a cor do laranja, edite no CSS (variáveis no topo):
  --accent e --accent2

Usabilidade:
- Se quiser ver mais etiquetas na tela: use “Compacto”.
- Para checar recorte com calma: use “Grande” ou “Tela cheia”.
