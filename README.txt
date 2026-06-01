# Conversor de Etiquetas Shopee (Value)

Ferramenta web para converter os PDFs A4 de etiquetas da Shopee em um PDF final
100x150mm, pronto para impressao em impressora termica, preservando vetores
(QR e codigo de barras nitidos).

## Principais recursos
- Dois modos simples:
  - "Etiqueta + checklist": detecta cada etiqueta, recorta com precisao, pula
    celulas em branco e JUNTA o checklist (lista de produtos) do mesmo pedido
    embaixo da etiqueta, na mesma pagina 10x15. O pareamento e feito pelo
    numero do Pedido (com fallback por ordem). Etiqueta sem checklist sai sozinha.
  - "So etiqueta (sem checklist)": gera apenas as etiquetas 10x15; o checklist
    e ignorado.
- A grade da folha (2x2 do A4, ou 1x1 quando ja e 10x15) e detectada sozinha.
- Processamento 100% no navegador (pdf-lib + pdf.js), sem upload para servidor.
- Status, progresso com ETA e cancelamento.
- Pre-visualizacao com miniaturas e visualizador com zoom.
- Auto impressao (opcional) e pagina de teste 100x150mm.
- Download rapido do PDF final.

## Como usar
1. Abra `index.html` em um servidor local (recomendado).
2. Selecione o PDF de entrada (ou arraste e solte).
3. Deixe em "Automatico" (ou escolha um modo manual).
4. Clique em "Gerar etiquetas".
5. Confira na pre-visualizacao e baixe o PDF 100x150 ou imprima.

### Servidor local (recomendado)
No Windows, voce pode usar o Python:

```
python -m http.server 5500
```

Depois acesse `http://localhost:5500` no navegador.

> O servidor local garante o pdf.js (detecao automatica) e o preview funcionando.
> Abrir o arquivo direto (file://) pode bloquear o pdf.js; nesse caso o conversor
> usa um recorte geometrico simples (sem endireitar o checklist).

## Como funciona a detecao
Para cada pagina o sistema:
1. Renderiza a pagina e localiza o conteudo de cada celula (varredura de pixels),
   recortando justo e ignorando celulas vazias.
2. Le o sentido do texto (pdf.js) para saber se a celula e etiqueta (em pe) ou
   checklist (girado), e captura o numero do Pedido de cada uma.
3. Pareia cada etiqueta com o checklist do mesmo Pedido.
4. Monta no pdf-lib (mantendo vetores): etiqueta em cima + checklist endireitado
   embaixo, numa pagina 100x150mm.

## Regras de saida
- Paginas finais em 100x150mm.
- Cada etiqueta sai junto do checklist do mesmo pedido (etiqueta em cima,
  checklist embaixo). Etiqueta sem checklist sai sozinha (pagina inteira);
  checklist sem etiqueta sai sozinho (cortado no tamanho do conteudo).
- Celulas em branco nao viram paginas.

## Estrutura do projeto
- `index.html`        - interface
- `etiquetas.js`      - toda a logica (detecao + conversao)
- `src/styles/`       - `base.css` e `components.css`
- `vendor/`           - `pdf-lib.min.js`

## Dicas de impressao
- Use escala 100% (nao ajustar/encaixar na pagina).
- Selecione papel 100x150mm na impressora termica.
- Use a "pagina de teste 100x150" para conferir margens.

## Solucao de problemas
- "Arquivo invalido": verifique se o arquivo e um PDF valido.
- "PDF protegido por senha": desbloqueie e envie novamente.
- "Nenhuma etiqueta encontrada": tente um modo manual (ex.: 4 por folha).
- Recorte estranho: troque o modo Automatico por um manual que combine com a folha.

Desenvolvido por iury
