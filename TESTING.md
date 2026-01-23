# Testes manuais

## Etiqueta padrão
1. Abra a interface em `index.html` via Live Server.
2. Use um PDF com N páginas.
3. Selecione o modo "Etiqueta padrão".
4. Clique em "Gerar etiquetas".
5. Confirme no resumo que a saída é N*4 páginas.
6. Baixe o PDF e confira a contagem no visualizador.

## Etiqueta com checklist
1. Use um PDF com N páginas.
2. Selecione o modo "Etiqueta com checklist".
3. Clique em "Gerar etiquetas".
4. Confirme no resumo que a saída é N*2 páginas.
5. Baixe o PDF e confira a contagem no visualizador.

## Tamanho 100x150mm
1. Abra o PDF gerado em um visualizador (Adobe Reader, Preview ou similar).
2. Verifique as propriedades do documento: o tamanho deve ser 100x150mm (283.46 x 425.19 pt).
3. No diálogo de impressão, mantenha escala 100% e confirme o tamanho do papel.

## PDFs grandes
1. Teste com PDFs acima de 50 páginas.
2. Confirme que a UI permanece responsiva e o status mostra "Processando página X de N...".
3. Verifique se o PDF final baixa corretamente.
