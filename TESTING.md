# Testes manuais

## Automático — folha com etiquetas + checklist (caso principal)
1. Abra a interface em `index.html` via servidor local (Live Server / `python -m http.server`).
2. Use um PDF da Shopee que tenha etiquetas (grade 2×2) e o "Checklist de carregamento".
3. Deixe o modo em "Automático (Shopee)".
4. Clique em "Gerar etiquetas".
5. Confira na pré-visualização:
   - Cada página tem a etiqueta em cima (QR e código de barras inteiros) e o
     checklist do MESMO pedido embaixo (na horizontal, legível).
   - O nº do "Pedido" da etiqueta bate com o "ID Pedido" do checklist abaixo.
   - Não há páginas em branco nem espaço sobrando.
6. Confira o hint: "Detectado: X etiqueta(s) com checklist — N página(s) 10×15".

## Automático — folha só de etiquetas
1. Use um PDF A4 com 4 etiquetas por página (2×2), sem checklist.
2. Gere e confirme que saem N×(etiquetas preenchidas) páginas 10×15, sem brancos.

## Modo "Só etiqueta (sem checklist)"
1. Use o mesmo PDF (com etiquetas + checklist).
2. Troque o modo para "Só etiqueta (sem checklist)" e gere.
3. Confirme que saem apenas as etiquetas 10×15 (inteiras, em pé), sem nenhum checklist.

## Tamanho 100x150mm
1. Abra o PDF gerado (Adobe Reader, Preview ou similar).
2. Propriedades do documento: tamanho 100x150mm (283.46 x 425.19 pt).
3. No diálogo de impressão, mantenha escala 100% e papel 100x150mm.

## PDFs grandes
1. Teste com PDFs com muitas páginas.
2. Confirme que a UI permanece responsiva e o status mostra "Analisando..." e "Montando etiqueta X de N...".
3. Verifique se o PDF final baixa corretamente.

## Cancelamento
1. Inicie o processamento com um PDF grande.
2. Clique em "Cancelar" e confirme o status "Processamento cancelado.".

## Auto-impressão
1. Marque "Imprimir automaticamente após gerar".
2. Gere o PDF e confirme se a janela de impressão abre (permitir popups).
3. Se o popup for bloqueado, use "Abrir PDF" ou "Baixar PDF 100x150".

## Pré-visualização e zoom
1. Gere um PDF e valide o iframe de pré-visualização e as miniaturas.
2. Clique em uma miniatura para abrir o visualizador.
3. Teste zoom +/− e navegação entre páginas.

## Página de teste 100x150
1. Clique em "Baixar página de teste 100x150".
2. Abra o PDF e confirme dimensões 100x150mm.
