const form = document.querySelector('#request');
const fields = document.querySelector('#fields');
const submit = document.querySelector('#submit');
const status = document.querySelector('#status');
const count = document.querySelector('#count');
const recordsList = document.querySelector('#records');
const api = '/api/requests';

function showStatus(message, state) {
  status.textContent = message;
  status.dataset.state = state;
}

async function refreshRecords() {
  try {
    const response = await fetch(api, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('Registry unavailable');
    const records = await response.json();
    count.textContent = 'Записей: ' + records.length;
    recordsList.replaceChildren();
    for (const record of records) {
      const item = document.createElement('li');
      const id = document.createElement('strong');
      id.textContent = record.id;
      item.append(id, document.createTextNode(record.name + ' · ' + record.topic));
      recordsList.append(item);
    }
  } catch {
    count.textContent = 'Список записей недоступен';
    recordsList.replaceChildren();
  }
}

if (location.protocol === 'file:') {
  document.querySelector('#launch').hidden = false;
  fields.disabled = true;
} else {
  let application;
  const key = crypto.randomUUID();
  submit.disabled = false;
  refreshRecords();

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled) return;
    if (!application) {
      application = {
        name: document.querySelector('#name').value,
        topic: document.querySelector('#topic').value,
        loseConfirmation: document.querySelector('#failure').checked,
      };
      if (!application.name.trim() || !application.topic.trim()) {
        application = undefined;
        showStatus('Заполни имя и задачу.', 'error');
        return;
      }
      fields.disabled = true;
    }

    submit.disabled = true;
    showStatus('Отправляем заявку…', 'pending');
    try {
      const response = await fetch(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify(application),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error('Confirmation unavailable');
      const { record, duplicate } = await response.json();
      showStatus(
        duplicate ? 'Заявка уже учтена: ' + record.id + '. Дубль не создан.'
          : 'Заявка принята: ' + record.id + '.',
        'success',
      );
      submit.textContent = 'Отправить ещё раз';
      document.querySelector('#new').hidden = false;
    } catch {
      showStatus('Не удалось подтвердить отправку. Повтори попытку с этой же заявкой.', 'error');
      submit.textContent = 'Повторить отправку';
    } finally {
      await refreshRecords();
      submit.disabled = false;
    }
  });
}
