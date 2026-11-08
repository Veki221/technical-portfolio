const caseList = document.querySelector('#case-list');
const caseTemplate = document.querySelector('#case-template');

for (const work of portfolioCases) {
  const card = caseTemplate.content.cloneNode(true);

  for (const field of ['title', 'type', 'task', 'changes', 'result', 'verification']) {
    card.querySelector('.case-' + field).textContent = work[field];
  }

  const links = card.querySelector('.case-links');
  for (const { label, href, download } of work.links) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = href;
    link.textContent = label;
    if (download) link.download = '';
    item.append(link);
    links.append(item);
  }

  const images = card.querySelector('.case-images');
  for (const { label, src, alt } of work.screenshots ?? []) {
    const figure = document.createElement('figure');
    const link = document.createElement('a');
    const image = document.createElement('img');
    const caption = document.createElement('figcaption');

    link.href = src;
    image.src = src;
    image.alt = alt;
    caption.textContent = label;
    link.setAttribute("aria-label", label); link.append(image);
    figure.append(link);
    images.append(figure);
  }

  if (work.samples?.length) {
    images.classList.add('case-samples');
    for (const { label, text } of work.samples) {
      const figure = document.createElement('figure');
      const caption = document.createElement('figcaption');
      const snippet = document.createElement('pre');

      caption.textContent = label;
      snippet.textContent = text;
      figure.append(caption, snippet);
      images.append(figure);
    }
  }

  caseList.append(card);
}

