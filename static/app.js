const $ = (id) => document.getElementById(id);
const topic = $('topic'), audience = $('audience'), tone = $('tone'), asOf = $('as_of');
const includeImages = $('include_images'), imageQuery = $('image_query');
const generate = $('generate-btn'), resultCard = $('result-card'), empty = $('empty-state');
const loading = $('loading-box'), status = $('status-chip'), heading = $('result-heading');
let latestMarkdown = '';

asOf.value = new Date().toISOString().slice(0, 10);
includeImages.addEventListener('change', () => imageQuery.classList.toggle('hidden', !includeImages.checked));

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function renderMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/), output = [];
  let list = null;
  const closeList = () => { if (list) { output.push(`</${list}>`); list = null; } };
  lines.forEach((line) => {
    if (!line.trim()) { closeList(); return; }
    if (line.startsWith('### ')) { closeList(); output.push(`<h3>${inlineMarkdown(line.slice(4))}</h3>`); }
    else if (line.startsWith('## ')) { closeList(); output.push(`<h2>${inlineMarkdown(line.slice(3))}</h2>`); }
    else if (line.startsWith('# ')) { closeList(); output.push(`<h1>${inlineMarkdown(line.slice(2))}</h1>`); }
    else if (/^[-*] /.test(line)) { if (!list) { list = 'ul'; output.push('<ul>'); } output.push(`<li>${inlineMarkdown(line.slice(2))}</li>`); }
    else if (/^\d+\. /.test(line)) { if (!list) { list = 'ol'; output.push('<ol>'); } output.push(`<li>${inlineMarkdown(line.replace(/^\d+\. /, ''))}</li>`); }
    else if (line.startsWith('> ')) { closeList(); output.push(`<blockquote>${inlineMarkdown(line.slice(2))}</blockquote>`); }
    else if (line.startsWith('![')) {
      closeList();
      const match = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
      if (match && /^https?:\/\//.test(match[2])) output.push(`<img src="${escapeHtml(match[2])}" alt="${escapeHtml(match[1])}" loading="lazy">`);
    } else { closeList(); output.push(`<p>${inlineMarkdown(line)}</p>`); }
  });
  closeList();
  return output.join('');
}

function setStatus(label, busy = false) {
  status.textContent = label;
  status.style.color = busy ? '#a36b1e' : '#2f6d4d';
  status.style.background = busy ? '#fff3df' : '#edf4ec';
}

function renderSources(data) {
  const sources = data.research?.sources || data.evidence || [];
  $('source-count').textContent = sources.length;
  $('research-description').textContent = sources.length
    ? `The draft was grounded in ${sources.length} source${sources.length === 1 ? '' : 's'} for ${data.research?.as_of || asOf.value}.`
    : 'No live sources were returned. Add a TAVILY_API_KEY to enable web research, or use the draft as an evergreen starting point.';
  $('source-list').innerHTML = sources.length ? sources.map((source) => `
    <article class="source-card">
      <a href="${escapeHtml(source.url)}" target="_blank" rel="noopener">${escapeHtml(source.title || source.url)}</a>
      <p>${escapeHtml(source.snippet || 'Open the source to review the full context.')}</p>
      <span class="source-meta">${escapeHtml(source.source || source.published_at || source.url)}</span>
    </article>`).join('') : '<div class="empty-state"><p>No source cards to show yet.</p></div>';
}

function renderOutline(plan) {
  const tasks = plan?.tasks || [];
  $('result-plan').innerHTML = tasks.length ? tasks.map((task, index) => `
    <article class="outline-item"><strong>${index + 1}. ${escapeHtml(task.title)}</strong>
    <p>${escapeHtml(task.goal || '')}</p></article>`).join('') : '<p class="empty-state">The outline is not available for this draft.</p>';
}

async function generateBlog() {
  if (topic.value.trim().length < 5) { topic.focus(); alert('Please enter a topic with at least 5 characters.'); return; }
  setStatus('Working…', true); loading.classList.remove('hidden'); empty.classList.add('hidden'); resultCard.classList.add('hidden'); generate.disabled = true;
  try {
    const response = await fetch('/api/generate', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({
      topic: topic.value.trim(), audience: audience.value.trim(), tone: tone.value.trim(), as_of: asOf.value,
      include_images: includeImages.checked, image_query: imageQuery.value.trim() || topic.value.trim()
    })});
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Generation failed.');
    latestMarkdown = data.final_markdown || '';
    heading.textContent = data.title || topic.value.trim();
    $('article-tab').innerHTML = renderMarkdown(latestMarkdown);
    renderSources(data); renderOutline(data.plan);
    resultCard.classList.remove('hidden'); setStatus('Complete'); activateTab('article');
  } catch (error) {
    empty.classList.remove('hidden'); empty.querySelector('h3').textContent = 'Something went wrong'; empty.querySelector('p').textContent = error.message;
    setStatus('Error');
  } finally { loading.classList.add('hidden'); generate.disabled = false; }
}

function activateTab(name) {
  document.querySelectorAll('.tab[data-tab]').forEach((button) => button.classList.toggle('active', button.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.toggle('hidden', panel.id !== `${name}-tab`));
}
document.querySelectorAll('.tab[data-tab]').forEach((button) => button.addEventListener('click', () => activateTab(button.dataset.tab)));
generate.addEventListener('click', generateBlog);
$('copy-btn').addEventListener('click', async () => { await navigator.clipboard.writeText(latestMarkdown); $('copy-btn').textContent = 'Copied'; setTimeout(() => $('copy-btn').textContent = 'Copy markdown', 1400); });
$('new-topic-btn').addEventListener('click', () => { topic.value = ''; resultCard.classList.add('hidden'); empty.classList.remove('hidden'); heading.textContent = 'Your story will appear here'; setStatus('Ready'); topic.focus(); });
