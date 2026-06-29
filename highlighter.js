// ---------------------------------------------------------------------------
// CEFR level colour palette
//
// Each level gets a distinct hue so readers can visually distinguish difficulty
// at a glance. `bg` is the background color, `text` is the font color, and
// `line` is the underline color. `hover` applies a subtle background tint
// on mouse-over to signal that the word is interactive.
// ---------------------------------------------------------------------------

const CEFR_COLORS = {
  A1: { bg: '#DCFCE7', text: '#166534', line: '#4ADE80', hover: '#4ADE8028' }, // Mint Green
  A2: { bg: '#E0F2FE', text: '#0369A1', line: '#38BDF8', hover: '#38BDF828' }, // Sky Blue
  B1: { bg: '#E0E7FF', text: '#4338CA', line: '#6366F1', hover: '#6366F128' }, // Indigo
  B2: { bg: '#FEF3C7', text: '#92400E', line: '#FBBF24', hover: '#FBBF2428' }, // Amber Yellow
  C1: { bg: '#FFEDD5', text: '#9A3412', line: '#F97316', hover: '#F9731628' }, // Vivid Orange
  C2: { bg: '#FCE7F3', text: '#9D174D', line: '#F472B6', hover: '#F472B628' }, // Rose Pink
};

function injectStyles(highlightStyle) {
  let style = document.getElementById('vs-styles');
  if (!style) {
    style = document.createElement('style');
    style.id = 'vs-styles';
    document.head.appendChild(style);
  }

  // Base rule — layout and cursor only, no colour.
  // Colour is applied per-level via attribute selectors below so each CEFR
  // level gets its own distinct shade regardless of the chosen highlight style.
  let css =
    '.vs-highlight {\n' +
    '  display: inline;\n' +
    '  cursor: pointer;\n' +
    '  border-radius: 0;\n' + // Removed border radius
    '}\n';

  // Per-level rules using the [data-level] attribute written by highlightWords.
  // For each level we emit both a resting state and a :hover state.
  for (const [level, { bg, text, line, hover }] of Object.entries(CEFR_COLORS)) {
    const selector = `.vs-highlight[data-level="${level}"]`;

    let decoration, hoverDecoration;
    if (highlightStyle === 'bg-yellow') {
      // Solid background style: uses padding to create a perfect sharp rectangle 
      // (extending 3px left/right and 1px down), then perfectly offsets it with negative 
      // margins so that its physical layout footprint remains exactly 0 to protect line reflows.
      decoration = `background-color: ${bg}; color: ${text}; padding: 0 2px 1px 2px; margin: 0 -2px -1px -2px;`;
      hoverDecoration = `background-color: ${line}40;`;
    } else if (highlightStyle === 'underline-dotted') {
      // Pure dotted underline: text color is NOT modified. 
      // Uses native text-decoration to eliminate any block/box-model reflow layout impacts.
      decoration = `text-decoration: underline dotted ${line}; text-decoration-thickness: 3px; text-underline-offset: 3px;`;
      hoverDecoration = `background-color: ${hover};`;
    } else {
      // Default: pure dashed underline: text color is NOT modified.
      // Uses native text-decoration to eliminate any block/box-model reflow layout impacts.
      decoration = `text-decoration: underline dashed ${line}; text-decoration-thickness: 3px; text-underline-offset: 3px;`;
      hoverDecoration = `background-color: ${hover};`;
    }

    css +=
      `${selector} {\n` +
      `  ${decoration}\n` +
      `}\n` +
      `${selector}:hover {\n` +
      `  ${hoverDecoration}\n` +
      `}\n`;
  }

  style.textContent = css;
}

/**
 * Wraps each word in wordList with a .vs-highlight <span> directly in the DOM.
 *
 * Words that share a text node are processed in descending offset order so that
 * each splitText() call only affects the right-hand portion of the node —
 * leaving all lower offsets intact for subsequent iterations.
 *
 * The span receives a data-level attribute (e.g. data-level="B2") which the
 * CSS rules emitted by injectStyles() use to apply the correct level colour.
 *
 * @param {Array<{word, lemma, cefrLevel, textNode, offset}>} wordList
 * @param {string} highlightStyle  'underline-dashed' | 'underline-dotted' | 'bg-yellow'
 */
function highlightWords(wordList, highlightStyle) {
  injectStyles(highlightStyle);

  // Group items by their source text node so all words in the same node
  // can be sorted and processed together.
  const nodeMap = new Map();
  for (const item of wordList) {
    if (!nodeMap.has(item.textNode)) nodeMap.set(item.textNode, []);
    nodeMap.get(item.textNode).push(item);
  }

  let insertedCount = 0;

  for (const [textNode, items] of nodeMap) {
    // Descending offset order: right-to-left processing keeps all
    // earlier offsets valid after each split modifies the right side.
    items.sort((a, b) => b.offset - a.offset);

    for (const item of items) {
      try {
        // The node may have been detached from the DOM between scan and highlight
        // (e.g. by a live-updating news widget). Skip it rather than crash.
        if (!textNode.parentNode) continue;

        const { offset } = item;
        const wordLength = item.word.length;

        // Defensive: scanArticle guarantees valid offsets, but guard anyway
        // in case the node's content changed after the scan.
        if (offset < 0 || offset + wordLength > textNode.nodeValue.length) continue;

        // Step 1 — split off the text that follows the word, but only when
        // the word doesn't already end at the node boundary (splitText at
        // length would create a superfluous empty text node).
        if (offset + wordLength < textNode.nodeValue.length) {
          textNode.splitText(offset + wordLength);
        }

        // Step 2 — isolate the word into its own text node.
        // After this call: textNode holds text[0..offset-1],
        // wordNode holds text[offset..offset+wordLength-1].
        const wordNode = textNode.splitText(offset);

        // Step 3 — build the highlight span and splice it into the DOM.
        // insertBefore first, then appendChild, so the span lands exactly
        // where wordNode was before wordNode is moved inside it.
        const span = document.createElement('span');
        span.className = 'vs-highlight';
        span.dataset.word = item.word;
        span.dataset.lemma = item.lemma;
        span.dataset.level = item.cefrLevel; // drives the per-level CSS colour rule

        textNode.parentNode.insertBefore(span, wordNode);
        span.appendChild(wordNode);

        insertedCount++;
      } catch (err) {
        console.warn(`[VocaSpot] highlightWords: failed to wrap "${item.word}":`, err.message);
      }
    }
  }

  if (DEBUG) console.log(`[VocaSpot] highlightWords: ${insertedCount} span(s) inserted`);
}
